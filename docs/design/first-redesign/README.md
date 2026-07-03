# Handoff: MQTT Insight — 첫 사용자 UX 개선

## Overview
mqtt-insight(Wails + Go + React MQTT 데스크톱 클라이언트)의 UX 전면 개선.
목표: **처음 사용하는 사람이 안내 없이도 연결 → 구독 → 관찰 → 발행까지 도달**하게 하고,
기존 기능(기록, MQTT 5.0 속성, retained)의 발견성을 높인다.

이 문서는 대화 없이도 구현 가능하도록 모든 결정사항을 담았다.

## About the Design Files
`MQTT Insight Redesign.dc.html`은 **HTML로 만든 디자인 레퍼런스(인터랙티브 프로토타입)** 이다.
프로덕션 코드가 아니며 그대로 복사하지 않는다. 할 일은 이 디자인을 **기존 코드베이스
(`frontend/src`, React + TypeScript + zustand + Wails 바인딩)의 패턴으로 재구현**하는 것이다.
기존 라이브러리(react-arborist 트리, react-window 리스트)를 유지한다.

프로토타입 안의 시뮬레이션은 디자인 시연용이다. 실제 구현에서는 제외/대체:
- 데모 토픽 데이터 생성기 → 실제 MQTT 수신
- 호스트 화이트리스트 기반 연결 성공/실패 → 실제 연결 결과/에러
- 상태 점(●) 클릭으로 끊김 시뮬레이션 → 제거
- "재연결 3회째 성공" 시나리오 → 실제 auto-reconnect 이벤트 기반

## Fidelity
**High-fidelity.** 색·타이포·간격·상태·카피 모두 최종 의도값. 기존 앱의 다크 팔레트를
확장한 것이므로 픽셀 수준으로 재현하되, CSS 변수 테마 시스템(아래 Design Tokens)으로 구현한다.

## 전체 구조 / 라우팅
앱은 3개의 최상위 뷰 + 모달들로 구성된다. **다중 동시 연결은 스코프 제외로 확정**
(README roadmap에서 제거 권장). 브로커 전환 = 연결 해제 → 연결 홈에서 다른 프로필 선택.

| 뷰 | 조건 |
|---|---|
| Welcome (환영/온보딩) | 연결 안 됨 && 저장된 프로필 0개. 타이틀바 `?` 버튼으로 언제든 재진입 |
| Connection Home (연결 런처) | 연결 안 됨 && 프로필 ≥ 1개. 연결 해제 시 이 화면으로 복귀 |
| Main App (3-pane) | 연결됨(또는 재연결 중/끊김 — 데이터 유지한 채 배너 표시) |

공통 크롬: 타이틀바(앱 아이콘+이름, 우측 `?` 가이드·`⚙` 설정 버튼 24×24px, radius 6px) +
연결 바(높이 44px: 상태 점 9px + 상태 텍스트 12.5px/600 + 브로커 host:port(mono, dim) +
우측 연결/연결 해제 버튼).

상태 점 색: 연결됨 `#43c463`, 연결 중/재연결 중 `#febc2e`, 안 됨 `#6a6a76`
(halo: 같은 색 18% 알파, 3px spread).

## Screens / Views

### 1. Welcome (첫 실행)
- 중앙 정렬, 최대 640px.
- 앱 아이콘 60×60 (radius 15, `linear-gradient(135deg,#4f8cff,#7b5cff)`).
- H1 25px/700 "MQTT Insight에 오신 걸 환영해요"
- 서브 14px dim: "IoT·임베디드 디버깅을 위한 MQTT 데스크톱 클라이언트예요. 세 단계면 메시지가 흐르기 시작합니다."
- 3단계 카드(가로 3열, gap 12, card bg + border, radius 11, padding 16):
  1. **브로커에 연결** — "호스트·포트만 입력하면 끝. TCP/TLS/WebSocket 지원."
  2. **토픽 구독** — "`#` 한 번이면 모든 토픽이 트리로 정리돼요."
  3. **보고 · 발행** — "실시간 메시지를 확인하고 직접 발행해 테스트해요."
  - 번호 뱃지 26×26, radius 8, bg `rgba(79,140,255,.15)`, color `#6ba0ff`.
- CTA: "브로커 연결하기" (accent, padding 12/26, radius 9) → 연결 모달.

### 2. Connection Home (프로필 런처)
- 2-pane: 왼쪽 300px 프로필 목록 + 오른쪽 선택 프로필 상세.
- 왼쪽: 헤더 "연결 · N" (uppercase 11px/700 dim) / 프로필 카드 리스트(gap 6):
  - 카드: padding 10/11, radius 9, card bg + border. 선택 시 bg `rgba(79,140,255,.12)` + border `#4f8cff`. hover 시 border accent.
  - 내용: 파란 점 8px + 이름(13px/600) + host:port(11px mono dim) + 전송방식 뱃지(TCP 등, 9px/700).
  - 클릭 = 선택, **더블클릭 = 즉시 연결**.
  - 하단 고정: "+ 새 연결" 버튼(전체폭, dashed border) → 연결 모달(빈 폼).
- 오른쪽: 선택 프로필 상세(중앙, 최대 440px):
  - 앱 아이콘 52px, 프로필명 21px/700, 연결 문자열 `tcp://host:port` (13px mono dim).
  - 정보 카드 2개: 전송 방식 / 포트.
  - 큰 "연결" 버튼(전체폭, accent, padding 13, radius 10).
  - 연결 실패 시 버튼 아래 오류 배너(아래 '오류 처리' 참조).
  - 보조: "편집"(연결 모달 고급 탭, 프리필) / "삭제"(빨강 텍스트; 목록이 비면 Welcome으로 전환).
- 미선택 시: "← 연결할 프로필을 선택하세요" empty state.

### 3. Main App (3-pane)
레이아웃: 왼쪽 트리 패널 316px | 오른쪽 열(메시지 패널 flex:1 + 발행 패널 176px, 속성 펼침 시 316px).

#### 3a. 트리 패널
위에서부터:
1. **토픽 필터 입력** (⌕ + input, mono 12px) — 트리 노드 텍스트 필터.
2. **구독 칩 행**: 라벨 "구독 중"(uppercase 10px) + 구독별 칩 + "+ 추가" 칩.
   - 칩: mono 10.5px, bg `rgba(79,140,255,.13)`, border `rgba(79,140,255,.35)`, color `#6ba0ff`, radius 14, 내부에 ✕(구독 해지).
   - QoS는 **0이 아닐 때만** `sensors/# · q1` 형태로 표기.
   - "+ 추가" 클릭 → 아래로 인라인 행 확장: 패턴 input(placeholder "토픽 패턴 (예: home/+/status)") + QoS select(q0/q1/q2) + "구독" 버튼. 중복 패턴은 무시.
3. **트리 헤더**: "토픽 트리 · N"(토픽 수).
4. **1회성 힌트 카드** (트리가 처음 채워질 때, ✕로 닫음, 세션당 1회):
   "각 행 끝의 ⋯ 버튼(또는 우클릭)으로 발행 · 기록 · Retained 삭제를 할 수 있어요."
   bg `rgba(79,140,255,.08)`, border `rgba(79,140,255,.25)`, radius 8.
5. **트리** (react-arborist 유지): 행 높이 26px, 들여쓰기 15px/depth.
   - 행: 캐럿(▾/▸) + [기록 중이면 빨간 ● 8px] + 이름(mono 12px; 브랜치 600/leaf 400) +
     메시지 수 뱃지(파란 pill) + [R 뱃지] + 마지막 payload 미리보기(mono 10.5px, ellipsis) + **⋯ 버튼**.
   - ⋯: opacity 0.6, hover 시 1.0. 클릭 또는 행 우클릭 → 컨텍스트 메뉴(동일).
   - 선택 행: bg `rgba(79,140,255,.16)` + 왼쪽 2px accent 보더. 선택 시 발행 패널 토픽 자동 채움.
   - **구독 해지된 토픽의 행은 opacity 0.45로 유지**(데이터 보존, 수신만 중단). 지우려면 "지우기".

**구독 empty state** (연결됨 && 구독 0 && 데이터 없음):
- ↯ 아이콘(pulse ring 애니메이션) + "아직 구독한 토픽이 없어요" + 설명 +
  큰 "모든 토픽 구독 `#`" 버튼(accent 전체폭) + 특정 토픽 input+구독 버튼 +
  각주 10.5px: "운영 브로커라면 # 대신 sensors/# 처럼 범위를 좁히는 걸 추천해요."

**토픽 컨텍스트 메뉴** (⋯/우클릭, min-width 176, radius 9, 항목 hover 시 chip bg):
- "이 토픽에 발행" → 발행 패널 토픽 채움
- "기록 켜기" / "기록 끄기"
- "Retained 삭제" — retained 메시지가 있는 토픽만 표시. (실제 구현: 빈 payload retained 발행)
- Unsubscribe는 제외 — 구독 해지는 칩에서만.

**기록(Recording)**:
- 처음 기록을 켤 때 1회 토스트(하단 중앙, 6.5초): "이 토픽의 메시지를 파일(SQLite)에 저장해요. 링 버퍼와 달리 한도 없이 남습니다. 툴바의 실시간/기록 토글로 저장된 메시지를 볼 수 있어요."
- 기록 중 토픽을 보면 메시지 툴바에 "● 기록 중" 뱃지(빨강) + 실시간/기록 세그먼트 토글.
- "기록" 소스 = QueryRecorded (기존 백엔드), 실시간 = ring buffer History.

#### 3b. 메시지 패널
- 툴바(flex-wrap 허용): 토픽명(mono 12px accent; 전체 뷰면 "전체 토픽 (실시간)" dim; max-width 42% ellipsis) +
  [msg/s 표시: 최근 5초 수신량, 수신 중일 때만] + [기록 뱃지/토글] + 스페이서 +
  **⌕ 검색 버튼** + 일시정지/재개 + 지우기.
- **검색**: ⌕ 클릭 → 툴바 아래 검색 행 확장(⌕ + input + "매치 / 전체" 카운트 + ✕).
  payload 부분 문자열(대소문자 무시), 전체 토픽 뷰에서는 토픽명도 매치. 필터 중 새 메시지도 매치만 유입.
  결과 0이면 empty state "검색 결과가 없어요 / 다른 검색어를 시도해 보세요."
- 메시지 리스트(react-window 유지): 행 23px, mono 11.5px:
  시각 + [토픽(전체 뷰만, accent)] + payload 미리보기(ellipsis) + [R 뱃지] + qN.
  - 시각 표기: 설정에 따라 절대(HH:MM:SS) 또는 상대("3초 전").
  - 정렬: 설정에 따라 최신/오래된 먼저.
  - R 뱃지 tooltip: "Retained(보존) 메시지 — 브로커가 토픽별로 1개 저장해 두고, 새로 구독하는 클라이언트에게 즉시 전달해요."
  - qN tooltip: "QoS — 전달 보장 수준. 0: 최대 1회(유실 가능), 1: 최소 1회(중복 가능), 2: 정확히 1회"
- empty state: 토픽 미선택 "← 토픽을 선택하세요…", 선택했지만 메시지 없음 "아직 메시지가 없어요…".

#### 3c. 메시지 상세 (행 클릭 시, 오른쪽 44%)
- 헤더(sticky, flex-wrap): "메시지" 라벨 + 포맷 탭 JSON/Plain/Hex/Base64 + **Diff 토글**.
  - 포맷 탭: 활성 accent. 초기 포맷 = 설정의 기본 페이로드 형식.
  - Diff 토글: 활성 시 주황 `#d9822b`. tooltip "직전 메시지와 비교해 바꾼 값을 강조해요 (JSON)".
- 메타: topic / time · qos · size / [props: `content-type=… · response-topic=… · k=v`].
- 본문: mono 12px, payload 색 `#d6e2c8`(라이트: `#33562a`).
- **Diff 모드**: 같은 토픽의 직전 메시지와 키 단위 비교(JSON 객체일 때만):
  - 변경: 노란 bg `rgba(254,188,46,.14)` + 값 뒤에 dim으로 `← 이전값` 병기
  - 추가 키: 초록 bg `rgba(67,196,99,.14)`
  - 삭제 키: 빨간 bg `rgba(229,72,77,.12)` + 취소선 + dim
  - Diff 켜면 자동으로 JSON 포맷 전환. 비교 대상 없으면(첫 메시지) 일반 보기 폴백.
  - Diff 상태는 토픽을 바꿔도 유지. 전체 토픽 뷰에서는 각 메시지의 자기 토픽 기준.

#### 3d. 발행 패널
- 헤더 "발행" + 트리에서 채워졌을 때 "↳ 트리에서 선택한 토픽" 힌트(직접 수정하면 사라짐).
- 행: 토픽 input(mono) + QoS select + retain 체크 + "발행" 버튼(토픽 없거나 미연결이면 회색/비활성).
- **"▸ 속성" 토글 행**: 펼치면 **패널이 위로 확장(176→316px)** — 페이로드 입력란 크기 유지.
  - 필드: content-type input, response topic input, user property 키-값 행들(+ 추가/✕ 삭제).
  - 접혀 있어도 설정값이 있으면 "▸ 속성 · 2"처럼 개수 표기.
  - **3.1.1 연결이면 토글 비활성(opacity .45) + "MQTT 5.0 연결에서 사용 가능해요"** 안내.
- 페이로드 textarea(mono, placeholder `{"value": 23.5}`).
- 발행한 QoS/retain/속성은 그대로 메시지에 반영되어야 함(프로토타입 초기 버그였음 — 주의).

### 4. 연결 모달 (460px, radius 14)
- 제목 "브로커에 연결" + 서브 "호스트와 포트만 있으면 연결할 수 있어요."
- **오류 배너**(실패 시, 모달 유지): ⚠ + 메시지. bg `rgba(229,72,77,.09)`, border `rgba(229,72,77,.35)`.
  - 원인별 카피: 호스트 미입력 "호스트를 입력하세요." / 미확인 호스트 "'{host}' 호스트를 찾을 수 없어요. 주소와 네트워크 상태를 확인해 주세요." (실제: 에러 타입별로 인증 실패/TLS 오류 등 확장)
- **저장된 프로필** 섹션: 안내 "저장된 프로필을 눌러 불러오거나, 아래에 직접 입력하세요." +
  칩 행: **"+ 새 연결"**(dashed; 선택 없음 상태에서 파랗게 강조; 클릭 시 폼 리셋) + 프로필 칩들(선택 시 accent 강조; 필드를 직접 수정하면 선택 해제).
- **"연결 정보" 구분선** + 탭: **빠른 연결**(호스트/포트/전송 방식만 + 힌트 "인증이 필요하면 고급 설정에서…") / **고급 설정**(프로필 이름, MQTT 버전 5.0|3.1.1, 호스트, 포트, 아이디, 비밀번호, 자동 재연결 체크. 실제 앱의 TLS/WS/LWT 필드도 이 탭에 배치).
- 하단: "연결"(주 버튼) + "취소".
- 연결 성공 시 프로필 자동 저장(host+port 중복 제외).

### 5. 연결 중 / 오류·재연결 상태
- **연결 중 토스트**: 스피너 + "브로커에 연결하는 중…" + **취소 버튼**(연결 시도 중단).
- **재연결 배너**(끊김 && auto-reconnect, 연결 바 아래, 노랑):
  스피너 + "연결 끊김 — {s}초 후 재연결 (시도 {n})" (시도 중엔 "재연결 시도 중…") +
  [지금 재시도] [중단]. 상태 점 노랑, 상태 텍스트 "재연결 중…".
- **끊김 배너**(중단했거나 auto-reconnect off, 빨강):
  ⚠ "연결이 끊겼어요. 아래 데이터는 마지막 수신 상태예요." + [다시 연결].
- **끊긴 동안 트리/메시지 데이터는 지우지 않는다.** 발행 버튼만 비활성.

### 6. 설정 모달 (480px, ⚙ 버튼)
섹션 3개, 세그먼트 컨트롤(활성 accent) 사용:
- **일반**: 언어(한국어/English — UI 전체 즉시 전환), 테마(다크/라이트/시스템)
- **메시지 표시**: 기본 페이로드 형식(JSON/Plain/Hex/Base64 — 상세 초기 포맷), 타임스탬프(절대/상대 — "상대 시각은 '3초 전'처럼 표시돼요"), 메시지 정렬(최신 먼저/오래된 먼저)
- **데이터**: 토픽당 보관 메시지 수(슬라이더 50–500, step 10; 기존 ringBufferSize) — "한도를 넘으면 오래된 메시지부터 자동으로 지워집니다."
- 하단 "완료". 모든 설정 즉시 적용 + config 저장(기존 Settings 구조 확장: `lang`, `timestampFormat`, `messageOrder` 추가).

## State Management (기존 zustand appStore 확장)
```
view: 'welcome' | 'home' | 'app'           // 파생: 연결 상태 + profiles.length
status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting'
connectError: { key, host? } | null
reconn: { attempt, countdown, trying } | null
subs: { pattern, qos }[]                    // 구독 목록 (칩)
selectedTopic, selectedMsg, msgSource: 'live' | 'recorded'
recording: Set<topic>                        // 기존 RecordedTopics 연동
searchOpen, searchQuery
diffOn: boolean                              // 토픽 바꿔도 유지
fmt: 'JSON'|'Plain'|'Hex'|'Base64'          // 초기값 settings.defaultFormat
pub: { topic, payload, qos, retain, props: { show, contentType, responseTopic, userProps[] } }
settings: { lang, theme, defaultFormat, timestampFormat, messageOrder, ringBufferSize }
treeHintDismissed, recToastShown             // 1회성 안내 (config에 저장 권장)
```
i18n: `t(key)` 딕셔너리(ko/en). 프로토타입 로직 클래스의 `T` 객체에 전체 카피가 들어 있다 — 그대로 사용.

## Design Tokens (CSS 변수, 다크/라이트)
프로토타입 로직의 `DARK`/`LIGHT` 맵이 원본. 요약:

| 토큰 | 다크 | 라이트 |
|---|---|---|
| --bg | #1e1e24 | #f4f4f7 |
| --titlebar | #26262e | #ececf1 |
| --pane | #22222a | #ffffff |
| --pane2 (발행) | #202028 | #f6f6f9 |
| --detail | #1c1c22 | #fbfbfd |
| --card | #26262e | #ffffff |
| --input | #1a1a20 | #eef0f4 |
| --modal | #23232b | #ffffff |
| --chip | #2c2c35 | #e8eaf0 |
| --border | #34343f | #dcdce4 |
| --line | #2e2e37 | #e7e7ee |
| --btnborder | #3a3a44 | #d3d3dc |
| --text | #e4e4ec | #1a1a22 |
| --text2 | #cfcfd8 | #2c2c36 |
| --dim | #8a8a96 | #63636f |
| --dim2 | #6a6a76 | #86868f |
| --dim3 | #7a7a86 | #78788a |
| --faint | #6f6f7b | #9a9aa6 |
| --payload | #d6e2c8 | #33562a |
| --hoverbg | rgba(255,255,255,.05) | rgba(0,0,0,.045) |

고정색: accent `#4f8cff`, accent-light `#6ba0ff`, 성공 `#43c463`, 경고 `#febc2e`, 오류 `#e5484d`, retained/diff `#d9822b`.
타이포: UI Inter(또는 system-ui) 11–14px, 코드/토픽/payload **JetBrains Mono**(또는 기존 mono). radius: 버튼 6–9, 카드 9–11, 모달 14.

## 기존 코드 매핑
- `App.tsx` — 뷰 라우팅(welcome/home/app) 추가
- `ConnectionBar.tsx` — 상태 점 색 3종 + 재연결/끊김 배너 (신규 `ReconnectBanner`)
- `ConnectionForm.tsx` — 재설계: 오류 배너, 새 연결 칩, 빠른/고급 탭
- 신규: `Welcome.tsx`, `ConnectionHome.tsx`, `TopicContextMenu`(기존 ContextMenu 재사용 + ⋯ 트리거), `SearchBar`, `Toast`
- `TopicTree.tsx` — 구독 칩 행, 힌트 카드, ⋯ 버튼, dim 처리
- `MessageList.tsx` — 검색, msg/s, 기록 뱃지/토글(기존 Live/Recorded 로직 유지), 툴팁
- `MessageDetail.tsx` — Diff 모드, props 표시
- `PublishPanel.tsx` — 속성 접이식(패널 확장), 개수 뱃지, 3.1.1 비활성
- `SettingsModal.tsx` — 재설계(언어 포함), `internal/config` Settings 필드 추가

## Assets
외부 에셋 없음. 앱 아이콘은 그라디언트 사각형 + ◈ 글리프(임시) — 실제 아이콘으로 교체 가능.

## Files
- `MQTT Insight Redesign.dc.html` — 인터랙티브 프로토타입(전체 흐름·전체 카피·ko/en 딕셔너리·토큰 맵 포함). 브라우저로 열어 직접 조작 가능.
