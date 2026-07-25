# 대용량 트래픽 성능 개선 — focus 기반 메시지 스트림 스펙

> 작성일: 2026-07-25 · 상태: 승인 대기(스펙 리뷰) · 브랜치: `feature/high-volume-performance`
> 전제: 실측 브로커(`localhost:1884`, 로봇 52대 / 104토픽 / 467 msg/s) 기준. 목표 규모는 3배(§1.2)

## 1. 배경과 목표

### 1.1 증상

전 토픽(`#`)을 구독한 실사용 브로커에 붙었을 때:

- center 메시지 리스트가 읽을 수 없는 blur가 된다 — "봐도 의미가 없다"
- 좌측 트리에서 토픽을 클릭해도 center가 반응하지 않는다
- 앱 전체가 버겁다

### 1.2 실측

20초간 브로커를 샘플링한 결과:

```
unique topics       : 104  (20초 내내 104 고정 — 토픽 증가 없음)
topic depth         : 전부 4세그먼트  arc/robot/<id>/{report,bt-blackboard}
                      → 로봇 52대 × 2토픽, 트리 노드 총 158개
message rate        : 467.6 msg/s
payload size        : p50=880B  p90=973B  p99=1013B
payload throughput  : 371 KB/s
```

**목표 규모**: 로봇 대수가 2~3배로 늘 수 있다는 요구를 반영해 **토픽 ~600개 / ~1,400 msg/s / ~1.2 MB/s payload**를 설계 기준으로 삼는다. 토픽 수는 사실상 고정이고 **병목은 순수하게 메시지 레이트**다.

### 1.3 근본 원인 — 초당 20번, 전체를 다시 만든다

수집·집계·표시가 전부 하나의 50ms 배처 콜백(`app.go:51-60`)에 묶여 있다. 가장 비싼 작업이 가장 빠른 주기를 강요당한다.

| # | 위치 | 문제 |
|---|---|---|
| 1 | `app.go:59` | `TreeSnapshot()` — 전 토픽 트리 deep copy + JSON 직렬화 + IPC를 초당 20회. 각 leaf의 `LastPayload`(≈1KB 전문)까지 포함 |
| 2 | `TopicTree.tsx:123` | tree 갱신마다 `applyFilter`+`toArborist` 전체 재구축 — 레벨마다 `localeCompare` 정렬, leaf마다 `matchesAny`+`bytesToString` |
| 3 | `TopicTree.tsx:94` | `liveMessages` 구독 — 클릭 핸들러에서만 쓰는데 트리 전체를 초당 20회 리렌더시킴 |
| 4 | `TopicTree.tsx:234` | 행마다 `ref={dragHandle}` — 이 트리는 드래그를 쓰지 않는데 react-arborist의 드래그 감지가 붙어 있음 |
| 5 | `MessageList.tsx:49` | `useEffect(..., [selectedTopic, liveMessages])` → `History()` IPC를 초당 20회 왕복, 매번 최대 200개 payload 복사 |
| 6 | `MessageList.tsx:123` | `recentCount`가 500개 메시지에 `new Date()` 파싱 — 초당 약 1만 회 |
| 7 | `appStore.ts:90` | `pushMessages`가 매 flush마다 500칸 배열 신규 생성 → 구독 컴포넌트 전부 리렌더 |

**파생 버그 1 — msg/s 표시가 실제의 1/5.** `liveMessages`는 500개 캡(`appStore.ts:69`), 레이트 윈도우는 5초(`MessageList.tsx:13`)다. 467 msg/s에서 500개 버퍼는 1초치밖에 담지 못하므로 `recentCount ≤ 500`이 되어 **표시값이 구조적으로 100 msg/s를 넘을 수 없다**. 화면의 `100.0 msg/s`는 실제 467 msg/s다.

**파생 버그 2 — 토픽 클릭이 먹지 않는다.** 코드상 토픽이 선택되면 center는 `History(topic)` 결과만 그리고(`MessageList.tsx:70`), 토픽 컬럼이 사라지며(`:224`) 헤더가 토픽명으로 바뀐다(`:163`). 증상 재현 화면은 헤더가 `All topics (live)`이고 토픽 컬럼도 살아 있으므로 **선택 자체가 걸리지 않은 상태**다. 필터링 로직 결함이 아니라 클릭이 핸들러에 도달하지 못한 것이며, 원인은 위 3·4번으로 본다.

### 1.4 목표

> **Go는 전부 받아 쌓고, 브릿지는 사용자가 보고 있는 것만 건넌다.**

## 2. 결정 사항

| 항목 | 결정 |
|---|---|
| center 기본 상태 | **메시지를 그리지 않는다.** 구독 직후에는 빈 상태, 좌측에서 토픽을 선택해야 스트림이 시작됨 |
| all-topics 라이브 피드 | **제거** (F12). 전 토픽 firehose는 어떤 부하에서도 제공하지 않음 |
| 메시지 필터 위치 | **백엔드**. `SetFocus(topic)`으로 focus를 설정하고, 배처가 매칭 메시지만 emit |
| 중간 노드 클릭 | **하위 subtree를 합쳐 스트리밍** (예: 로봇 노드 = `report` + `bt-blackboard` 시간순 병합) |
| subtree 크기 가드 | 하위 leaf **20개 초과**면 스트리밍 대신 **subtree 요약** 표시 |
| 트리 emit | **500ms 주기**, revision 변동 시에만. `LastPayload` 전문 대신 절단된 `Preview` 문자열 |
| 트리 갱신 방식 | **슬림 전체 스냅샷**. 증분(delta) diff는 채택하지 않음 — §6.1 |
| msg/s 계산 | **백엔드**가 슬라이딩 윈도우로 계산해 1초 주기 emit |
| 트리 기본 펼침 | **기본 접힘.** 필터 입력 중에만 매칭 결과를 펼침 |
| 폭주 방어 | focus 스트림도 flush당 100개(= 2,000 msg/s) 상한, 초과분은 드롭하고 **드롭 사실을 UI에 명시** |
| 재연결 버그 | **본 스펙 범위 밖** — 별도 이슈 (§8) |

### 2.1 상수

구현 시 흩어지지 않도록 한곳에 모은다. 전부 코드 상수이며 설정으로 노출하지 않는다.

| 상수 | 값 | 용도 |
|---|---|---|
| `treeEmitInterval` | 500ms | 트리 티커 주기 |
| `rateEmitInterval` | 1s | 레이트 티커 주기 |
| `rateWindow` | 5s (1s 버킷 5개) | msg/s 슬라이딩 윈도우 |
| `maxPerFlush` | 100 (= 2,000 msg/s) | focus 스트림 flush당 emit 상한 |
| `previewRunes` | 48 rune | 트리 노드 preview 절단 길이 |
| `previewHexBytes` | 16 byte | 바이너리 payload preview 길이 |
| `subtreeHistoryLimit` | 500 | `SetFocus`가 반환하는 이력 최대 건수 |
| `maxFocusMessages` | 500 | 프론트 `focusMessages` 링 상한 |
| `streamLeafThreshold` | 20 | 이 값 **이하**면 스트리밍, 초과면 subtree 요약 |

`subtreeHistoryLimit`과 `maxFocusMessages`는 설정값 `ringBufferSize`(토픽당 기본 200)와 별개다. 전자는 **표시 상한**이고 후자는 **토픽당 보관량**이다. 로봇 노드(2토픽 × 200 = 400건)는 상한에 걸리지 않고, 큰 subtree는 가드(§5.5)에서 먼저 막힌다.

## 3. 아키텍처 — 4개 트랙 분리

주기와 목적이 다른 작업을 분리한다. 메시지는 실시간성이 중요하니 50ms, 트리 카운트 배지는 0.5초 지연돼도 무해하니 500ms, 레이트는 1초면 충분하다.

```
MQTT 수신
   │
   └─▶ Batcher (50ms)  ────────────────────────────────  변경 없음
          │
          ├─▶ ① 적재      store.Record() + recorder      전량, 브릿지 안 건넘
          │
          ├─▶ ② focus 스트림  focus 매칭 메시지만  ──▶ "mqtt:messages"   (50ms)
          │                                              선택 없으면 emit 자체가 없음
          │
          └─▶ (레이트 카운터 갱신)

   트리 티커 (500ms)  ─▶ ③ 슬림 스냅샷, 변경 시만 ──▶ "mqtt:tree"       (500ms)

   레이트 티커 (1s)   ─▶ ④ 전역/focus msg/s      ──▶ "mqtt:rate"        (1s)
```

### 3.1 focus 규칙

```go
func MatchesFocus(topic, focus string) bool {
    if focus == "" { return false }
    return topic == focus || strings.HasPrefix(topic, focus+"/")
}
```

`focus == ""`가 "전체"가 아니라 **"아무것도 안 보냄"**인 것이 핵심이다. 기본 상태에서 메시지 emit이 0이 되는 근거가 이 한 줄이다.

구분자 `/`를 강제하므로 `arc/robot2`는 `arc/robot` focus에 걸리지 않는다.

### 3.2 focus 전환 경합

`SetFocus` 직후 이전 focus로 만들어진 flush가 뒤늦게 도착할 수 있다. emit 페이로드에 **그 배치가 어떤 focus로 필터됐는지**를 실어 보내고, 프론트가 현재 focus와 다르면 배치를 통째로 버린다. 락이나 순서 보장 없이 비교 한 줄로 끝난다.

### 3.3 폭주 방어

focus가 큰 subtree를 가리키면 예전 문제가 재현된다. focus 스트림에도 상한을 둔다.

- flush(50ms)당 최대 **100개**(= 2,000 msg/s)만 emit
- 초과분은 최신 것만 남기고 **드롭 카운트를 함께 전달**
- 프론트는 `1,400 msg/s · 최신 2,000/s 표시 중`처럼 생략을 명시

**무음 절단은 하지 않는다.** 안 보이는 것이 있으면 반드시 보이게 말한다. Go 스토어와 녹화(SQLite)는 드롭과 무관하게 전량 유지되므로 데이터가 유실되는 것이 아니라 화면 갱신만 제한된다.

### 3.4 브릿지 비용

| | 현재 구조 (3배 목표 시) | 변경 후 |
|---|---|---|
| 트리 | 15.8 MB/s | ~120 KB/s |
| 메시지 | ~1.2 MB/s | ~8 KB/s (로봇 1대 선택 시) |
| `History()` 폴링 | 20회/s × 200메시지 | 선택 시 1회 |
| **합계** | **~17 MB/s** | **~130 KB/s** |

## 4. 백엔드 변경

### 4.1 `internal/store/tree.go` — 스냅샷 다이어트

`LastPayload []byte`를 **내부 저장부터** `Preview string`으로 교체한다. 원본 payload는 링버퍼에 이미 있으므로 트리가 중복 보관할 이유가 없다.

```go
type Node struct {
    Name         string    `json:"name"`
    FullTopic    string    `json:"fullTopic"`
    Children     []*Node   `json:"children,omitempty"`
    MessageCount int       `json:"messageCount"`
    Preview      string    `json:"preview,omitempty"`  // ← LastPayload []byte 대체
    LastSeen     time.Time `json:"lastSeen"`
    Retained     bool      `json:"retained"`
    childIndex   map[string]*Node
}
```

**`previewOf(payload []byte) string`** — 순수 함수. 프론트의 기존 `detectFormat` 휴리스틱(`payload.ts:27-31`)을 따라가 동작 일관성을 지킨다.

- 제어 바이트(`<9` 또는 `13<b<32`)가 있으면 → 앞 16바이트 hex
- 아니면 → **rune 경계에서 안전하게** 48 rune 절단

현재는 프론트가 base64 디코드 → `TextDecoder` → `slice(0,34)`를 leaf마다 반복한다. 600 leaf × 20Hz면 초당 12,000회·12 MB의 디코딩이 오직 34자를 얻으려고 돌아간다. 이 작업이 통째로 사라진다.

**변경 감지**: `Tree`에 `revision uint64`를 두고 `Insert`마다 증가시킨다. `Snapshot()`은 revision을 변경하지 않는다. 티커는 직전 emit revision과 같으면 skip한다.

### 4.2 `internal/store/ringbuffer.go` — subtree 병합

```go
// GetSubtree merges buffers of all topics under prefix, ascending by timestamp,
// returning at most the newest `limit` messages.
func (r *RingBuffer) GetSubtree(prefix string, limit int) []mqtt.Message
```

매칭 규칙은 §3.1과 동일. 600토픽 map 전체 스캔이지만 **선택 순간 1회뿐**이라 무해하다. 로봇 노드 선택 시엔 버퍼 2개 병합으로 끝난다. `Get`과 마찬가지로 payload를 복사해 반환한다.

### 4.3 `internal/store/store.go`

`MessageStore` 인터페이스에 추가:

```go
HistorySubtree(prefix string, limit int) []mqtt.Message
TreeRevision() uint64
```

### 4.4 `internal/app/focus.go` — 신규

§3.1의 `MatchesFocus`와 배치 필터 `FilterFocus([]mqtt.Message, string) []mqtt.Message`. 순수 함수라 테스트가 쉽다.

### 4.5 `internal/app/rate.go` — 신규

5초 슬라이딩 윈도우를 1초 버킷 5개 링으로 구현한다. 전역/focus 두 카운터. **정수 증감**이므로 500개 배열을 훑으며 `new Date()`를 파싱하던 방식이 사라지고, 표시 상한 100 msg/s 버그(§1.3 파생 버그 1)가 원인부터 없어진다.

### 4.6 `app.go` — 트랙 분리

**`SetFocus`는 이력까지 한 번에 반환**한다. 왕복 2회를 1회로 줄이고, "focus 설정과 이력 조회 사이에 들어온 메시지"라는 틈도 없앤다.

```go
// SetFocus scopes the live message stream to a topic subtree and returns the
// buffered history for it. Empty topic stops the stream.
func (a *App) SetFocus(topic string) []mqtt.Message
```

배처 flush 콜백:

```go
for _, m := range ms {
    a.store.Record(m)
    if a.recorder != nil { a.recorder.Record(m) }
}
a.rate.AddGlobal(len(ms))

f := a.currentFocus()
if f == "" { return }                     // ← 기본 상태: 브릿지 트래픽 0

out := app.FilterFocus(ms, f)
a.rate.AddFocused(len(out))
dropped := 0
if len(out) > maxPerFlush {               // §3.3 폭주 방어
    dropped = len(out) - maxPerFlush
    out = out[len(out)-maxPerFlush:]
}
runtime.EventsEmit(a.ctx, "mqtt:messages", focusBatch{Focus: f, Messages: out, Dropped: dropped})
```

**신규 고루틴 2개** (startup 시작, shutdown 정지):

- 트리 티커 500ms — revision 변동 시에만 `mqtt:tree`
- 레이트 티커 1s — `mqtt:rate` `{global, focused}`

**focus 초기화 지점**: `Connect`(재연결 포함)와 `Disconnect`에서 `focus = ""`. 끊긴 브로커의 잔여 스트림이 새 세션에 섞이지 않게 한다.

### 4.7 이벤트 계약 변화

| 이벤트 | 현재 | 변경 후 |
|---|---|---|
| `mqtt:messages` | `Message[]`, 전량, 50ms | `{focus, messages, dropped}`, focus 한정, 50ms |
| `mqtt:tree` | 전체 스냅샷 + payload, 50ms | 슬림 스냅샷, 500ms, 변경 시만 |
| `mqtt:rate` | — | 신규, `{global, focused}`, 1s |

## 5. 프론트엔드 변경

### 5.1 `store/appStore.ts`

```
liveMessages: Message[]     (전역 500개)   →   focusMessages: Message[]   (선택 subtree 전용)
                                              rate: { global, focused }   (백엔드 계산값)
                                              dropped: number             (생략 배지용)
                                              selectedIsLeaf: boolean
```

`pushMessages`는 배치의 `focus`가 현재 `selectedTopic`과 다르면 **통째로 버린다**(§3.2).

`clearedAt`의 전역 baseline(`clearedAt[""]`)도 제거한다 — all-topics 뷰가 사라지면 그 키를 쓰는 곳이 없다.

### 5.2 `bridge/focus.ts` — 신규, 단일 진입점

토픽 선택은 반드시 여기 한 곳을 통과한다.

```ts
export async function applyFocus(topic: string | null, isLeaf: boolean) {
  const msgs = await SetFocus(topic ?? "");   // focus 설정 + 이력을 한 번에
  useAppStore.getState().focusTopic(topic, isLeaf, msgs);
}
```

`selectTopic`을 여러 컴포넌트가 각자 호출하면 언젠가 `SetFocus`를 빠뜨리는 경로가 생긴다. 선택과 focus는 항상 함께 움직여야 하므로 함수 하나로 묶는다.

`bridge/events.ts`는 유일한 수신 지점이라는 기존 규칙을 유지한 채 `mqtt:rate` 핸들러가 추가되고 `mqtt:messages`가 새 페이로드 형태를 받는다.

### 5.3 `components/MessageList.tsx`

| 제거 | 근거 |
|---|---|
| `History()` 20Hz `useEffect` (`:49-52`) | 푸시가 authoritative가 됨 |
| `recentCount` / `msgRate` 계산 (`:123-133`) | 백엔드 rate 사용 |
| `ALL_TOPICS_CAP` / `liveMessages.slice()` (`:14,71`) | all-topics 뷰 제거 |
| 1초 `tick` interval (`:118-122`) | rate가 이벤트로 오므로 불필요 |

**토픽 선택 전이 기본 화면**이 된다. 기존 `msgSelectTitle`/`msgSelectHint` 빈 상태를 그대로 재사용한다.

토픽 컬럼(`:224`)은 **subtree 선택일 때만** 표시한다. 로봇 노드를 고르면 `report`/`bt-blackboard`가 섞여 오므로 어느 토픽인지 보여야 하고, leaf를 고르면 전부 같은 값이라 낭비다. `selectedIsLeaf`로 가른다.

드롭이 발생하면 툴바에 생략을 명시한다(§3.3).

### 5.4 `components/TopicTree.tsx`

1. **`liveMessages` 구독 제거** (`:94`) — 클릭 핸들러의 "최신 메시지 찾기"는 `SetFocus` 응답의 마지막 메시지로 대체
2. **`ref={dragHandle}` 제거** (`:234`) — 드래그 미사용. 클릭 유실의 유력 후보(§1.3 파생 버그 2)
3. **`bytesToString(...).slice(0,34)` 제거** (`:66`) — 백엔드 `preview`를 그대로 사용
4. **`localeCompare` → 모듈 레벨 `Intl.Collator` 재사용** — `localeCompare`는 호출마다 collator를 새로 만든다
5. **행을 `React.memo` 컴포넌트로 분리** — 카운트가 안 바뀐 행은 리렌더에서 빠진다
6. **`openByDefault={true}` → 기본 접힘** (`:221`) — 600토픽이면 900여 행(로봇 300 + leaf 600 + 상위 2)이 전부 펼쳐진다. 필터 입력 중에만 매칭 결과를 펼친다

### 5.5 subtree 크기 가드

중간 노드 클릭 시 `node.toggle()`과 선택이 함께 걸리므로(`:150-158`), `arc/robot`을 한 번 누르면 600개 토픽이 focus되고 `GetSubtree`가 링버퍼 600개(최대 12만 건)를 병합·정렬한 뒤 500 KB를 브릿지로 보낸다.

**하위 leaf가 20개 초과인 노드는 스트리밍하지 않고 subtree 요약을 보여준다.**

```
arc  클릭     → 펼침 + 요약 패널      (600개 토픽 · 1,400 msg/s · 상위 발신 토픽 목록)
arc/robot     → 펼침 + 요약 패널
arc-0114911   → 펼침 + 스트리밍       (2개 토픽 = 그 로봇의 report + bt-blackboard)
report        → 스트리밍              (leaf)
```

깊이가 아니라 **크기**로 판단하는 이유는, 다른 브로커의 토픽 구조에서도 그대로 성립하기 때문이다. "3번째 레벨만 선택 가능" 같은 규칙은 이 브로커에서만 맞다.

요약 패널은 트리 데이터로 계산되므로 브릿지 비용이 0이고, **"어느 로봇이 시끄러운가"에 답한다** — 최초 불만("봐도 의미가 없다")을 정면으로 해결하는 화면이다. 막다른 길 대신 다음 클릭을 안내한다.

임계값 20은 로봇 노드(2)는 통과하고 `arc/robot`(600)은 막는 값이다. 설정으로 노출하지 않는다.

### 5.6 `types.ts`

`TreeNode.lastPayload?: string`(base64) → `preview?: string`. `FocusBatch`, `RateEvent` 타입 추가.

## 6. 채택하지 않은 대안

### 6.1 증분(delta) 트리 업데이트

바뀐 leaf만 패치로 보내는 방식을 검토했으나 **이 데이터에서는 이득이 없다.** 1,400 msg/s에서는 500ms마다 600개 토픽이 거의 전부 바뀌므로 delta가 전체 스냅샷과 같은 크기가 된다. 프론트에 가변 트리 모델과 재동기화 경로만 추가로 지는 셈이다.

슬림 스냅샷(payload 제거) + 저주기 emit만으로 15.8 MB/s → ~120 KB/s가 되므로 충분하다.

### 6.2 프론트에서 필터링

`mqtt:messages`를 전량 emit하고 프론트가 선택된 subtree만 남기는 방식. 변경량은 가장 적지만 **브릿지 비용 1.2 MB/s가 그대로 남는다.** 버리려고 JSON을 파싱하는 셈이라 근본 문제를 건드리지 않는다.

### 6.3 커서 기반 폴링 (pull)

메시지 푸시를 없애고 `HistorySince(prefix, afterTs)`를 4Hz로 당겨오는 방식. 백프레셔가 자연스럽게 걸리고 백엔드에 UI 상태가 남지 않는 장점이 있으나, 이 앱은 이미 50ms 배처 푸시 구조이고 그 구조 자체는 건강하다. 문제는 "무엇을" 보내느냐지 "어떻게"가 아니다. 잘 도는 배처를 버리고 커서 관리를 새로 들여오는 대가에 비해 이 규모에서 얻는 것이 없다.

### 6.4 레이트 적응형 UI

저부하에서는 지금의 로그 뷰를, 고부하에서는 토픽별 최신값 테이블로 자동 전환하는 방식. **all-topics 뷰 자체를 제거하기로 하면서 불필요해졌다.**

## 7. 기능 영향 · 엣지 케이스 · 테스트

### 7.1 없어지거나 바뀌는 기능

| 기능 | 변화 |
|---|---|
| all-topics 라이브 피드 (F12) | **제거.** center 기본 상태는 빈 화면 |
| 전 토픽 대상 검색 (C26/C27/F9) | focus된 subtree 내부 검색으로 축소. subtree 선택 시엔 토픽명 검색도 유지 |
| Pause / Clear | 선택 중일 때만 노출 (`hasTree` → `selectedTopic` 조건) |
| `clearedAt[""]` 전역 baseline | 제거 |
| msg/s 표시 | 백엔드 계산값으로 대체. 선택이 없어도 전역 rate는 헤더에 표시 |

전 토픽 검색 축소가 유일한 실질적 손실이다. 다만 지금도 500개 버퍼(≈1초치) 안에서만 검색되던 기능이라 실사용 가치는 낮았다.

### 7.2 엣지 케이스

- **prefix 오탐** — `arc/robot2`가 `arc/robot` focus에 걸리면 안 됨. `HasPrefix(topic, focus+"/")`로 구분자 강제
- **가드 경계** — 하위 leaf가 정확히 20이면 스트리밍(≤20), 21부터 요약
- **단일 토픽 폭주** — subtree가 작아도 한 토픽이 2,000 msg/s를 넘길 수 있음. 캡과 드롭 배지가 동일하게 적용
- **Pause 중 focus 변경** — pause는 표시 동결이므로 focus가 바뀌면 해제
- **연결 해제/재연결** — `focus=""` 초기화, `focusMessages` 비움
- **미연결 상태의 `SetFocus`** — 에러가 아니라 빈 배열 반환. 연결이 없는 건 정상 상태지 실패가 아님
- **녹화(Recorded) 모드** — `QueryRecorded` 경로는 focus와 무관하게 그대로
- **트리 필터 중 선택** — focus는 필터와 무관하게 실제 토픽 기준

### 7.3 테스트

**Go 단위** — 새 로직은 전부 순수 함수다.

- `previewOf` — 멀티바이트 rune 경계 절단, 제어문자 → hex, 빈 payload
- `MatchesFocus` / `FilterFocus` — exact / subtree / 빈 focus / prefix 오탐
- `GetSubtree` — 병합 정렬 순서, limit 적용, prefix 경계
- `Tree.revision` — Insert 시 증가, Snapshot은 미증가
- rate 카운터 — 윈도우 회전과 감쇠

**프론트 vitest**

- `pushMessages` — focus 불일치 배치 폐기
- `focusMessages` 캡
- subtree leaf 카운트 → 가드 임계값 판정

**수용 기준** (`docs/MANUAL_TESTING.md`에 추가)

- 유휴(선택 없음) 상태에서 `mqtt:messages` emit **0건**
- 토픽 선택 클릭 → 화면 반영 **200ms 이내**
- 1,400 msg/s 부하에서 트리 스크롤·클릭이 끊기지 않음
- 브릿지 트래픽 before/after 측정치를 본 스펙에 기록

## 8. 범위 밖 — 재연결 버그 (별도 이슈)

connect → disconnect → connect 시 재연결이 실패하고, port-forward를 재시작해야 복구되는 증상이 보고되었다. 원인 후보를 확인했으나 **성능 문제와 원인이 다르므로 본 스펙에 포함하지 않는다.**

`app.go:186` `Disconnect()`가 컨텍스트를 먼저 cancel하고 나서 `client.Disconnect()`를 호출한다.

```go
if cancel != nil { cancel() }       // autopaho 백그라운드 루프를 먼저 죽임
if c == nil { return nil }
return c.Disconnect()               // 이미 죽은 매니저 — DISCONNECT 패킷이 나가지 않음
```

autopaho에서 ctx cancel은 비정상 종료 경로이고, DISCONNECT 패킷을 보내고 소켓을 정상 종료하는 것은 `cm.Disconnect()`다. 순서가 뒤집혀 브로커에 정상 종료를 알리지 못하고 소켓이 매달린 채 남는다. `Connect()`의 재연결 경로(`app.go:130-134`)도 같은 순서다. 덧붙여 `a.client`가 Disconnect 후에도 nil이 되지 않아 끊긴 뒤에도 `Publish`/`Subscribe`가 죽은 클라이언트로 향한다.

**이는 가설이며 재현 절차를 세워 systematic-debugging으로 검증해야 한다.**
