# mqtt-insight v1.1 설계 — v1 갭 마무리

> 작성일: 2026-07-02 · 상태: 승인됨 · 선행 문서: [v1 설계](2026-07-02-mqtt-insight-v1-design.md)

## 1. 배경

v1 최종 리뷰에서 "백엔드는 준비됐으나 UI 배선이 없는" 갭 4가지가 확인됐다. v1.1은 이 갭만 닫아 v1을 완결한다. 새 의존성 없이 기존 컴포넌트·바인딩을 재사용하는 최소 배선 접근을 택한다.

## 2. 범위

### 목표
1. **트리 컨텍스트 메뉴** — 우클릭 시 메뉴: 이 토픽에 발행 / Unsubscribe / Retained 삭제 / 기록 켜기·끄기
2. **Recorded 뷰** — 메시지 패널에 Live/Recorded 소스 토글, 기록된 SQLite 히스토리 조회
3. **발행 v5 속성 UI** — content-type / response topic / user properties 입력(접이식)
4. **수동 E2E 체크리스트** — `docs/MANUAL_TESTING.md`

### 비목표 (v2+)
기록 내보내기(CSV/JSON), 기록 상태 이벤트 push, 숫자 차트, diff, 멀티 연결, mTLS.

## 3. 결정 사항

| 항목 | 결정 |
|---|---|
| 기록 조회 UI | 메시지 패널 내 Live/Recorded 토글 (별도 모달 아님) |
| 트리 우클릭 | 컨텍스트 메뉴 도입 (기존 "우클릭=기록 토글 즉시 실행" 제거) |
| 컨텍스트 메뉴 구현 | 의존성 없는 자체 컴포넌트 (라이브러리 미도입) |
| 기록 상태 진실원천 | 백엔드. 프론트는 `RecordedTopics()`로 초기화 (이벤트 push는 안 함) |
| Retained 삭제 | 새 바인딩 없이 기존 `Publish`(빈 payload + retained=true) 사용 |

## 4. 백엔드 변경 (app.go + internal/store)

### 새 메서드
- `SQLiteRecorder.Topics() []string` (internal/store/sqlite.go) — enabled map의 키를 뮤텍스 하에 복사해 반환.

### 새 바인딩 (app.go)
- `QueryRecorded(topic string, limit int) ([]mqtt.Message, error)` — `recorder.Query` 위임. recorder가 nil이면 빈 슬라이스, 에러 없음.
- `RecordedTopics() []string` — `recorder.Topics()` 위임. recorder nil이면 빈 슬라이스.

### Message 타입 확장 (internal/mqtt/message.go)
- `ResponseTopic string \`json:"responseTopic,omitempty"\`` 필드 추가 (v5).
- `internal/mqtt/v5.go` Publish 경로에서 `Properties.ResponseTopic` 설정, 수신 경로에서 `msg.ResponseTopic` 채움.
- v3 경로는 무시(필드 미사용).

## 5. 프론트엔드 변경

### 5.1 ContextMenu 컴포넌트 (신규 `components/ContextMenu.tsx`)
- props: `x, y, items: {label, onClick, disabled?}[], onClose`.
- 우클릭 좌표에 absolute div 렌더, 외부 클릭·Esc에서 `onClose`. 의존성 없음.

### 5.2 TopicTree
- 우클릭 → ContextMenu 표시. 항목:
  - **이 토픽에 발행** — 스토어의 `publishTopic` 설정 (PublishPanel이 topic 입력 초기값으로 사용)
  - **Unsubscribe** — `Unsubscribe(topic)` 호출
  - **Retained 삭제** — retained 노드에만 표시. `Publish({topic, payload: "", retained: true, qos: 0})` (빈 payload는 base64 빈 문자열)
  - **기록 켜기 / 끄기** — 상태에 따라 라벨 전환, `EnableRecording`/`DisableRecording` 호출 + 로컬 Set 갱신
- `recording` Set은 mount 시 `RecordedTopics()` 결과로 초기화.

### 5.3 MessageList — Live/Recorded 토글
- 툴바에 소스 토글 버튼. 활성 조건: 토픽 선택됨 && 해당 토픽이 기록 중(`recording` Set — 스토어로 이동해 TopicTree와 공유).
- Recorded 모드: `QueryRecorded(topic, 500)` 호출, 결과를 timestamp 오름차순 정렬 후 기존 newest-first 렌더링 재사용. 수동 새로고침 버튼 제공(자동 갱신 없음).
- Live 모드: 기존 동작 유지.

### 5.4 PublishPanel — v5 속성 (접이식)
- "MQTT 5.0 Properties ▸" 토글로 펼침/접힘, 기본 접힘.
- 입력: content-type(텍스트), response topic(텍스트), user properties(key/value 행 동적 추가/삭제).
- 빈 값 필드는 Message에서 생략. "5.0 연결 전용, 3.1.1에서는 무시됨" 힌트 텍스트 표시.

### 5.5 스토어 (appStore)
- `publishTopic: string | null` + setter 추가.
- `recording: Set<string>` + `setRecording`/`toggleRecording` 추가 (TopicTree 로컬 상태에서 이동).

## 6. 에러 처리
- `QueryRecorded` 실패/빈 결과: 빈 리스트 표시 + 툴바에 "no recorded messages" 텍스트.
- recorder 미초기화(nil): 바인딩이 빈 결과 반환, UI는 토글 비활성화로 자연 처리.
- v5 속성 입력값은 발행 시에만 검증 없이 전달(브로커가 거부하면 기존 발행 실패 토스트 경로).

## 7. 테스트
- **Go**: `SQLiteRecorder.Topics()` 단위 테스트(enable/disable 후 목록), `QueryRecorded`/`RecordedTopics` nil-recorder 가드 테스트(app 레벨은 어려우므로 recorder 메서드 중심).
- **프론트**: 로직이 컴포넌트에 얇게 붙으므로 vitest 대상은 없음(기존 payload 테스트 유지). UI 동작은 수동 체크리스트로 커버.
- **수동 E2E**: `docs/MANUAL_TESTING.md`에 시나리오 문서화 — 연결(5.0/3.1.1) → Sub # → 트리 탐색 → 컨텍스트 메뉴 4항목 → Recorded 토글/새로고침 → v5 속성 발행(수신 상세에서 속성 확인) → 테마 전환.
