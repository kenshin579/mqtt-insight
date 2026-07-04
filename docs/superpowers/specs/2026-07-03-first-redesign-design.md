# first-redesign 스펙 — 첫 사용자 UX 전면 개편

> 작성일: 2026-07-03 · 상태: 승인 대기(스펙 리뷰) · 브랜치: `feature/first-redesign`
> 원본 디자인: `docs/design/first-redesign/` (README 핸드오프 + 인터랙티브 프로토타입)
> **요구사항 레지스트리**: [2026-07-03-redesign-inventory.md](2026-07-03-redesign-inventory.md) — 본 스펙과 한 몸이다.

## 1. 배경과 목표

`docs/design/first-redesign/`의 Claude 디자인을 기준으로 UI를 전면 개편한다.
- UX 목표(디자인 문서): 처음 사용하는 사람이 안내 없이 연결 → 구독 → 관찰 → 발행에 도달. 기존 기능(기록·MQTT 5.0 속성·retained)의 발견성 개선.
- **프로세스 목표(이번 작업의 핵심 요구)**: 디자인된 내용이 **하나도 빠짐없이** 구현된다. 과거 Claude 디자인 기반 작업에서 반복된 "종종 누락"을 구조적으로 차단한다.

## 2. 접근: 추적성 기반 구현

프로토타입·README를 전수 분석해 만든 **요구사항 레지스트리**(A1~G19, 전 항목 ID)를 두고 4중 게이트로 추적한다:

1. **계획 게이트** — 구현 계획의 모든 태스크에 `covers: [ID…]`를 명기. 계획 셀프 리뷰에서 고아 ID(구현 대상인데 어느 태스크에도 배정 안 된 ID) 검사.
2. **구현 게이트** — 페이즈별 구현자에게 담당 ID 목록을 제공, 완료 보고에 ID별 구현 위치 요구.
3. **감사 게이트** — 전체 구현 후 독립 커버리지 감사 에이전트가 레지스트리 전 항목을 코드와 대조(`구현/누락/부분` 판정) → 누락 수정 라운드 → 재감사.
4. **시각 게이트** — 프로토타입 HTML과 실제 앱을 나란히 띄워 뷰별 수동 비교(사용자와 함께). `docs/MANUAL_TESTING.md`를 리디자인 기준으로 전면 갱신.

**정본 규칙**: 시각·동작 = HTML 프로토타입(단, README의 시뮬레이션 제외 목록 우선). 카피 = `T` 딕셔너리. README와 HTML 충돌 시 본 스펙 §3의 결정을 따른다.

## 3. 갭·유실 위험 해소 결정 (승인됨)

### 일괄 결정
HTML에만 있는 디테일(F1~F5, F7~F13, F15, F20~F23 등)은 전부 HTML대로 구현: 애니메이션/z-index/그림자/스크롤바(F11), 전체 토픽 피드 150 캡(F12), msg/s 전역 집계(F4), 연결 중 blocking 오버레이+취소(F19), 브랜치 카운트=재귀 합(F5), 토픽 선택 시 최신 메시지 자동 선택(F1), 발행 후 자동 선택(F2), 지우기 범위(F3) 포함.

### 개별 결정

| ID | 결정 |
|---|---|
| F6 `?` 버튼 | 세션 유지. 연결 중이면 Welcome을 오버레이로 표시(닫기 버튼), 미연결이면 뷰 전환. disconnect 금지 |
| G1+F14+F18 고급 탭 | 신규 설계: 프로필(이름·버전)/연결(호스트·포트·전송방식·clientId·keepAlive·cleanSession·자동재연결)/인증(아이디·비밀번호)/TLS(tls·wss시: CA경로·시스템CA·검증생략)/WS(ws·wss시: 경로)/LWT(토픽·페이로드·QoS·retained). 편집 시 전 필드 프리필 |
| G2 정확 토픽 unsub | 디자인 따름 — 구독 해지는 칩(패턴)에서만. 트리 메뉴 Unsubscribe 제거 |
| F16+G3+G4 Recorded | Refresh 버튼 유지(Recorded 모드에서 일시정지/지우기 대신) + 토글 시 자동 로드 + 기록 전용 empty 카피 신규 키 |
| F24+F32 일시정지 | 표시만 정지(링버퍼·msg/s 계속). 발행은 pause 무관 |
| F25 상대시각 | 상대 모드일 때 1초 ticker 갱신 |
| F27 프로필 삭제 | 확인 다이얼로그 추가 |
| F28 키보드 | Enter 제출(연결/구독/검색), Esc 닫기(모달·메뉴·검색) 전면 추가 |
| F31 브랜치 기록 | 브랜치 행에서 "기록 켜기" 숨김. "이 토픽에 발행"은 브랜치 허용 |
| F33+G19 오류 카피 | errAuth/errTls/errRefused/errTimeout 신규 집필(ko/en) + errGeneric(백엔드 원문 병기) |
| F34 | content-type placeholder 로컬라이즈 |
| G5+G16 포맷 | 초기값=설정 기본 포맷, 세션 sticky(자동 감지·리마운트 키 제거), diff 토픽 전환에도 유지 |
| G7 링버퍼 | 백엔드 SetCapacity → 설정 즉시 적용("재시작 필요" 제거) |
| G8+G18 발행/# | 토픽 input 비면 발행 비활성, `#` 원클릭은 empty state에서만 |
| F21+G11 트리 | 전체 경로 substring 필터(사전 필터 후 트리 구성), 기본 펼침, 높이 하드코딩 제거 |
| F17 힌트 카드 | HTML 채택: 구독 존재 시 표시. 닫으면 config 영속 |
| F30 | treeAdd 죽은 키 제거 |
| E2+E9 토큰 | --treename/--treebranch 포함, 끊김 halo는 HTML 값(회색 .15) |
| E5 폰트 | 외부 폰트 로드 없음 — system-ui + 기존 mono 폴백(오프라인 앱) |
| 기타 | i18n 기본 ko / 테마 system=matchMedia+change 리스너 / G9·G10·G12·G13·G14 기존 로직 보존 / F26 파생 상태로 자연 해소 / F29 취소 후 모달 유지 / F8 진입점별 폼 리셋 차이 HTML대로 |

## 4. 아키텍처

### 뷰 라우팅
`App.tsx`: `view = welcome | home | app` (연결 상태 + profiles.length에서 파생). 재연결/끊김 중 `app` 유지 + 배너. `?` 오버레이는 별도 `showGuide`.

### 프론트엔드 파일 구조

**신규 lib**
- `lib/i18n.ts` — T 딕셔너리(ko/en) 이식 + 신규 키(오류·기록 empty·고급 탭 라벨) + `t(key)` + `{s}/{n}/{host}` 치환
- `lib/tokens.css` — 토큰 전면 교체(DARK/LIGHT → CSS 변수, data-theme 유지, system=matchMedia+리스너)
- `lib/mqttMatch.ts` — MQTT 와일드카드 매칭(#/+) — 구독 dim·칩 매칭
- `lib/time.ts` — 절대/상대 포맷 + 1초 ticker 훅
- `lib/diff.ts` — JSON 객체 키 diff(changed/added/removed)
- `lib/connectError.ts` — 백엔드 에러 문자열 → 오류 키 분류

**신규 컴포넌트**: `Welcome.tsx`, `ConnectionHome.tsx`, `ReconnectBanner.tsx`(재연결+끊김 배너), `ConnectingOverlay.tsx`, `Toast.tsx`, `SearchBar.tsx`, `SubscriptionChips.tsx`, `SegmentedControl.tsx`

**재설계**: `ConnectionForm.tsx`(오류 배너·칩·빠른/고급 탭·G1 전 필드), `SettingsModal.tsx`(3섹션·즉시 적용), `TopicTree.tsx`(칩 행·힌트·⋯·dim·empty state), `MessageList.tsx`(검색·msg/s·기록 뱃지·툴팁·정렬·시각), `MessageDetail.tsx`(포맷 탭·Diff·props 한 줄), `PublishPanel.tsx`(확장·개수 뱃지·3.1.1 비활성), `ConnectionBar.tsx`(상태 점 3색)

**유지**: `ContextMenu.tsx`(Esc 포함, ⋯ 좌표 대응 추가), `lib/payload.ts`, `bridge/events.ts`(이벤트 확장)

### 상태 (appStore 확장)
```
view(파생), status(disconnected|connecting|connected|reconnecting)
connectError{key,host?,raw?}, reconn{attempt,trying}
subs[{pattern,qos}], selectedTopic, selectedMsg, msgSource, recording(Set)
searchOpen, searchQuery, diffOn, fmt, pub{topic,payload,qos,retain,props{...}}
showGuide, settings{lang,theme,defaultFormat,timestampFormat,messageOrder,ringBufferSize}
treeHintDismissed, recToastShown  → config(Settings)에 영속
```
`subs`는 프론트 소유(구독은 전부 프론트가 시작, 재연결 재적용은 백엔드 클라이언트 기존 로직).

### 백엔드 변경 (소폭)
- `mqtt:status` 구조화: `{state, attempt?, reason?}`. v3/v5 콜백에 재연결 시도 카운트 배선. 카운트다운 초는 미지원(결정: 실용 절충).
- `CancelConnect()` 바인딩 — 진행 중 Connect의 context 취소.
- `config.Settings` 확장: `lang, timestampFormat, messageOrder, treeHintDismissed, recToastShown`.
- `MemoryStore.SetCapacity(n)` + `SetRingBufferSize` 경로 — 즉시 적용(초과분 트림).
- 기존 바인딩(QueryRecorded/RecordedTopics/EnableRecording 등) 그대로 사용.

### 데이터 흐름 (신규)
- msg/s: 프론트가 `mqtt:messages` 수신 시각을 5초 창 집계(전역).
- Diff: 선택 메시지의 직전 메시지를 같은 토픽 히스토리에서 조회.
- 검색/필터/정렬/시각: 프론트 파생 계산.

## 5. 검증·추적 체계

§2의 4중 게이트를 그대로 수행한다. 산출물:
- 계획 문서: 태스크별 `covers:` 필드 + 고아 ID 검사 결과 명시
- 감사 리포트: 레지스트리 전 항목 판정표(감사 에이전트)
- `docs/MANUAL_TESTING.md` 전면 갱신: 뷰별 섹션(Welcome/Home/Main/모달/배너) + §3 결정 사항 확인 항목

## 6. 테스트 전략
- **vitest**: `mqttMatch`(#/+/엣지), `diff.ts`(changed/added/removed/비객체 폴백), `time.ts`(절대/상대), `i18n`(**ko/en 키 패리티** — 카피 누락 자동 검출), `connectError.ts`(분류), 기존 payload 유지.
- **Go**: `SetCapacity`(트림), 구조화 상태 이벤트, `CancelConnect`(취소 시 정리 — v1 하드닝과 일관). 기존 전 테스트 통과 유지.
- **통합**: 기존 Mosquitto 통합 테스트 유지. 재연결 시나리오(브로커 재시작)는 MANUAL_TESTING에 추가.

## 7. 에러 처리
- 연결 에러 분류(`connectError.ts`): auth→errAuth, TLS→errTls, refused→errRefused, timeout→errTimeout, 그 외→errGeneric(원문 병기). 배너는 Home(B17)/모달(B46)에 표시.
- 발행 실패·QueryRecorded 실패: 기존 정책 유지.
- 재연결 중 발행 시도: 버튼 비활성으로 차단(C18).

## 8. 비목표
- 다중 동시 연결(디자인 확정 제외 — README roadmap에서도 제거), 카운트다운 초 표시(§3 결정), 차트/rate 통계 등 v2 인사이트 기능, 실제 앱 아이콘 제작(그라디언트+◈ 유지).

## 9. 규모/전달
프론트 대규모 + 백엔드 소폭. 예상 20~25태스크. 단일 브랜치 `feature/first-redesign` → 단일 PR.
