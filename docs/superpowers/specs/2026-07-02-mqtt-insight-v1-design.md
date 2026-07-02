# mqtt-insight v1 설계

> 작성일: 2026-07-02 · 상태: 승인 대기(스펙 리뷰)

## 1. 배경과 목표

`mqtt-insight`는 IoT/임베디드 개발자를 위한 오픈소스 MQTT 디버깅 클라이언트다.

### 시장 조사 요약

기존 대표 클라이언트 조사 결과 명확한 빈틈이 존재한다:

- **MQTT Explorer** — 토픽 트리 + 값 diff + 숫자 차트가 최고 수준이나 2019년 이후 사실상 방치, 단일 연결, MQTT 5.0 취약, 라이선스(CC BY-ND)가 포크를 금지.
- **MQTTX** — 활발히 유지·MQTT 5.0·멀티 연결·페이로드 포맷 완비하나 토픽 트리 없음, 차트/diff 미출시, 고빈도 메시지에서 성능 이슈.
- **MQTT.fx** — 유료 전환으로 이탈. mqtt-spy·HiveMQ 웹클라이언트 등도 방치.

→ **"토픽 트리 + diff + 숫자 차트"(Explorer 강점)와 "MQTT 5.0 + 멀티 연결 + 성능"(MQTTX 강점)을 동시에 갖춘, 활발히 유지되는 오픈소스가 없다.** Go 백엔드(Wails)는 Electron 기반 도구들이 약한 고throughput 처리·반응성에서 유리하다.

### 제품 비전 (단계적)

- **v1 (MVP)** — 견고한 기본 디버깅 클라이언트 (table-stakes). 본 문서의 범위.
- **v2 — 인사이트 계층**: 값 변화 diff, 숫자 페이로드 실시간 차트, rate/통계.
- **v3 — 고급**: replay, 필터/알림 규칙, 확장 디코더(Sparkplug/Protobuf), 시뮬레이션/부하테스트, 멀티 연결, mTLS.

최종 목표는 "분석·시각화·추적을 아우르는 인사이트 클라이언트"이며, v1은 그 토대를 만든다.

## 2. 범위

### v1 목표
브로커에 연결 → 토픽을 트리로 탐색 → 메시지 값 히스토리 확인 → 발행으로 디버깅. 이 흐름을 빠르고 안정적으로.

### v1 비목표 (v2+로 연기)
멀티 연결, mTLS, 숫자 차트/그래프, 값 diff 하이라이트, replay, 필터/알림 규칙, 확장 디코더(Sparkplug/Protobuf), 시뮬레이션/부하테스트, AI 어시스트.

## 3. 기술 스택

- **셸**: Wails v2 (Go 백엔드 ↔ React 프론트엔드, 네이티브 데스크톱 Win/mac/Linux)
- **프론트엔드**: React + TypeScript + Vite. 트리 `react-arborist`, 고빈도 리스트 `react-window` 가상화, 상태관리 Zustand.
- **MQTT 라이브러리**: `eclipse/paho.golang`(MQTT 5.0) + `eclipse/paho.mqtt.golang`(3.1.1)을 `MQTTClient` 인터페이스로 추상화해 버전에 따라 구현체 선택. (단일 라이브러리가 두 버전을 모두 지원하지 못하므로 래핑)
- **저장**: 연결 프로필/설정은 앱 데이터 디렉터리의 JSON. 메시지는 인메모리 링버퍼 + 선택적 SQLite(`modernc.org/sqlite`, CGo 없는 순수 Go 드라이버).

## 4. 결정 사항 요약

| 항목 | 결정 |
|---|---|
| 주 사용자 | IoT/임베디드 개발자 디버깅 도구 |
| 연결 | v1은 단일 연결 (상태 모델은 멀티로 확장 가능하게 설계) |
| MQTT 버전 | 3.1.1 + 5.0 완전 지원 (5.0 전용 속성 UI 포함) |
| 메시지 저장 | 하이브리드 — 인메모리 링버퍼 + 선택적("이 토픽 기록하기") SQLite 영속화 |
| Transport | TCP + TLS + WebSocket (mTLS는 v2) |
| 레이아웃 | 3-Pane (Explorer 스타일): 좌 트리 / 우상 메시지 / 우하 발행 |
| 프론트엔드 | React + TypeScript |

## 5. 아키텍처

### 계층 (Go 백엔드)

- `mqtt/` — 연결 관리, 버전 추상화, 구독/발행. 프론트엔드로 이벤트 emit.
- `store/` — 토픽 트리 상태, 링버퍼, 선택적 SQLite 영속화. `MessageStore` 인터페이스로 추상화.
- `config/` — 프로필/설정 로드·저장(JSON).
- `app.go` — Wails 바인딩(프론트엔드가 호출하는 메서드) + 배치 이벤트 브리지.

### 데이터 흐름

```
브로커 → mqtt.Client(수신) → app 이벤트 emit ┐
                                             ├→ store: 트리 갱신 + 링버퍼 append
프론트엔드(React) ← Wails 이벤트 구독 ────────┘   (+ 기록 토글 ON이면 SQLite write)

프론트엔드 명령(연결/구독/발행) → Wails 바인딩 → mqtt.Client
```

- **고빈도 대응**: 백엔드가 메시지를 배치(예: 50ms 단위)로 묶어 프론트엔드에 emit → 렌더 폭주 방지.
- **트리 상태는 백엔드가 소유**(진실의 원천), 프론트엔드는 스냅샷/델타를 받아 렌더.

## 6. v1 기능 상세

### 6.1 연결 관리
- 연결 프로필 저장/편집/삭제 (이름, host, port, client ID, username/password, transport, keepalive, clean session, LWT).
- Transport: TCP / TLS / WebSocket(ws, wss). TLS는 CA 인증서 파일 지정 + "OS 신뢰 저장소 사용" 옵션 + "인증서 검증 건너뛰기"(개발용).
- MQTT 버전 선택: 5.0(기본) / 3.1.1. 사용자가 프로필에서 명시적으로 선택(자동 협상 없음). 5.0 선택 시 연결 속성(session expiry 등) 기본 지원.
- 연결/해제, 자동 재연결(on/off), 연결 상태 표시(상단 바).

### 6.2 토픽 트리 (좌측 패널)
- 와일드카드 구독(`#`, `+`)으로 수신한 메시지를 계층 트리로 자동 집계.
- 노드별: 최신 payload 미리보기, 메시지 수, 마지막 수신 시각.
- 트리 검색/필터, 노드 접기/펼치기, retained 메시지 표시(아이콘 구분).
- 노드 컨텍스트 메뉴: 구독/구독해제, 이 토픽에 발행, retained 삭제(빈 payload 발행), "이 토픽 기록하기(SQLite)" 토글.

### 6.3 메시지 뷰 (우상 패널)
- 선택 토픽의 메시지 히스토리(링버퍼, 토픽별 최근 N개; N은 설정).
- payload 포맷: Plain / JSON(pretty+접기) / Hex / Base64 자동감지 + 수동전환.
- 각 메시지: 시각, QoS, retained 여부, payload 크기, (5.0) user properties·content type 등 속성 패널.
- 리스트 가상화로 고빈도에서도 반응성 유지. 일시정지/재개, 지우기.

### 6.4 발행 패널 (우하 패널)
- topic, payload(에디터, 포맷 선택), QoS, retained, (5.0) user properties/content type/response topic.
- 최근 발행 히스토리에서 재사용.

### 6.5 공통
- 다크/라이트 테마, 설정(링버퍼 크기, 기본 포맷, 테마), 크로스플랫폼 빌드.

## 7. 컴포넌트 구조

### Go 백엔드 (단일 책임, 인터페이스로 경계 분리)
- `mqtt/client.go` — `MQTTClient` 인터페이스(`Connect/Disconnect/Subscribe/Unsubscribe/Publish`) + 이벤트 콜백.
- `mqtt/v3.go`, `mqtt/v5.go` — 버전별 구현체.
- `mqtt/message.go` — 공통 `Message` 타입(topic, payload, qos, retained, timestamp, v5 properties).
- `store/tree.go` — 토픽 트리(스레드 안전), 노드 집계.
- `store/ringbuffer.go` — 토픽별 링버퍼.
- `store/store.go` — `MessageStore` 인터페이스 + 인메모리 구현 + SQLite 옵션 구현.
- `config/config.go` — 프로필/설정 JSON 로드·저장.
- `app.go` — Wails 바인딩 메서드 + 배치 이벤트 emit(디바운서).

### React 프론트엔드
- `App.tsx` — 3-pane 레이아웃 + 모달.
- `ConnectionBar.tsx`, `ConnectionForm.tsx` — 연결 상태/프로필 편집.
- `TopicTree.tsx` — react-arborist 트리 + 검색 + 컨텍스트 메뉴.
- `MessageList.tsx` + `MessageDetail.tsx` — 가상화 리스트 + 상세/속성 패널 + 포맷 전환.
- `PublishPanel.tsx` — 발행 폼.
- `store/` (Zustand) — 트리 스냅샷, 선택 상태, 연결 상태.
- `bindings/` — Wails 자동생성 Go 바인딩 래퍼.

## 8. 에러 처리
- **연결 실패/끊김**: 명확한 사유 표시(인증 실패/TLS 오류/타임아웃 구분), 자동 재연결 시 상태·재시도 횟수 노출.
- **TLS 오류**: 인증서 검증 실패를 별도 메시지로 구분(개발용 "검증 건너뛰기" 안내).
- **발행 실패**: 토스트로 알림.
- **SQLite 쓰기 실패**: 기록만 비활성화, 앱 동작은 지속(비치명적).
- **잘못된 payload 포맷**: 자동감지 실패 시 Plain으로 폴백.

## 9. 테스트 전략
- **Go 단위 테스트**: `store`(트리 집계·링버퍼 경계·동시성), `config`(직렬화), `mqtt`(인터페이스 mock). TDD로 진행.
- **통합 테스트**: 로컬 Mosquitto(또는 testcontainers)에 실제 연결해 구독/발행/retained/와일드카드 검증.
- **프론트엔드**: 핵심 컴포넌트(트리 렌더, 포맷 변환 유틸) Vitest 단위 테스트.
- **수동 E2E**: 크로스플랫폼 빌드 후 실제 브로커로 시나리오 확인.
