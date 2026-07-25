# 대용량 트래픽 성능 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 수집·집계·표시가 하나의 50ms 배처 콜백에 묶여 있던 구조를 주기가 다른 4개 트랙으로 분리하고, 선택된 토픽 subtree의 메시지만 브릿지를 건너게 해 3배 목표 규모(600토픽 / 1,400 msg/s)에서 브릿지 트래픽을 ~17 MB/s에서 ~130 KB/s로 낮춘다.

**Architecture:** Go는 모든 메시지를 전량 받아 트리와 링버퍼에 적재하고, 프론트에는 (1) 사용자가 선택한 subtree의 메시지만 50ms 주기로, (2) payload를 제거한 슬림 트리 스냅샷을 500ms 주기로 변경 시에만, (3) 백엔드가 계산한 msg/s를 1초 주기로 보낸다. 선택 토픽이 없으면 메시지 emit 자체가 발생하지 않는다.

**Tech Stack:** Go 1.25 (표준 라이브러리만 추가 사용: `encoding/hex`, `unicode/utf8`, `sort`), React 18 + TypeScript + zustand, Wails v2 이벤트 브릿지, 테스트는 `go test` + vitest.

**Spec:** `docs/superpowers/specs/2026-07-25-high-volume-performance-design.md`

---

## File Structure

### 신규 파일

| 파일 | 책임 |
|---|---|
| `internal/store/preview.go` | payload → 트리 표시용 짧은 문자열 변환 (순수 함수) |
| `internal/store/preview_test.go` | 위 테스트 |
| `internal/app/focus.go` | focus 매칭 규칙과 배치 필터 (순수 함수) |
| `internal/app/focus_test.go` | 위 테스트 |
| `internal/app/rate.go` | 슬라이딩 윈도우 msg/s 카운터 |
| `internal/app/rate_test.go` | 위 테스트 |
| `frontend/src/bridge/focus.ts` | 토픽 선택의 단일 진입점 (SetFocus 호출 + 스토어 반영 + 크기 가드) |
| `frontend/src/lib/subtree.ts` | 트리 노드 순회 유틸 (leaf 수, 상위 발신 토픽, 노드 검색) |
| `frontend/src/lib/subtree.test.ts` | 위 테스트 |
| `frontend/src/store/appStore.test.ts` | 스토어 액션 테스트 (focus 불일치 폐기, 캡) |
| `frontend/src/components/SubtreeSummary.tsx` | 크기 가드에 걸린 노드의 요약 패널 |

### 수정 파일

| 파일 | 변경 |
|---|---|
| `internal/store/tree.go` | `LastPayload []byte` → `Preview string`, `revision` 카운터 추가 |
| `internal/store/ringbuffer.go` | `GetSubtree` 추가 |
| `internal/store/store.go` | 인터페이스에 `HistorySubtree`·`TreeRevision` 추가 |
| `internal/store/tree_test.go` | `LastPayload` 참조 갱신 |
| `internal/store/store_test.go` | `LastPayload` 참조 갱신 |
| `app.go` | `SetFocus` 바인딩, flush focus 필터, 트리·레이트 티커, focus 리셋 |
| `frontend/src/types.ts` | `TreeNode.preview`, `FocusBatch`, `RateEvent` |
| `frontend/src/store/appStore.ts` | `liveMessages`·`clearedAt` 제거, `focusMessages`·`rate`·`dropped`·`summaryTopic` 추가 |
| `frontend/src/bridge/events.ts` | 새 `mqtt:messages` 형태, `mqtt:rate` 구독 |
| `frontend/src/components/TopicTree.tsx` | 렌더 이탈 6건 차단 + `applyFocus` 연결 |
| `frontend/src/components/MessageList.tsx` | all-topics 뷰 제거, focusMessages 렌더, 백엔드 rate 사용 |
| `frontend/src/components/PublishPanel.tsx` | 발행 후 토픽 선택을 `applyFocus`로 전환 (`selectTopic` 제거에 따른 필수 변경) |
| `frontend/src/lib/i18n.ts` | 신규 문구 4개 (ko/en 동시) |
| `frontend/src/App.css` | 요약 패널·드롭 배지 스타일 |
| `docs/MANUAL_TESTING.md` | 수용 기준 추가 |

### 태스크 순서 근거

Task 1–4는 **순수 추가**라 기존 동작을 건드리지 않는다(항상 green). Task 5–7이 계약 변경 구간이고, **Task 6과 Task 7은 짝**이다 — Task 6 커밋만으로는 프론트가 새 이벤트 형태를 못 읽으므로 그 사이에 앱을 실행하지 말 것. Task 8–11이 UI, Task 12가 검증이다.

---

## Task 1: payload → preview 변환

`LastPayload`(≈1KB 전문)를 트리에서 없애기 위한 선행 작업. 프론트는 이 값을 34자로 잘라 쓰고 버리므로 백엔드가 처음부터 짧게 만든다.

**Files:**
- Create: `internal/store/preview.go`
- Test: `internal/store/preview_test.go`

- [ ] **Step 1: 실패하는 테스트 작성**

`internal/store/preview_test.go`:

```go
package store

import (
	"strings"
	"testing"
	"unicode/utf8"
)

func TestPreviewOfPassesShortText(t *testing.T) {
	if got := previewOf([]byte(`{"a":1}`)); got != `{"a":1}` {
		t.Fatalf(`want {"a":1}, got %q`, got)
	}
}

func TestPreviewOfTruncatesAtRuneBoundary(t *testing.T) {
	// 50 Korean runes, 3 bytes each — must cut at 48 runes, never mid-rune.
	got := previewOf([]byte(strings.Repeat("가", 50)))
	if n := utf8.RuneCountInString(got); n != previewRunes {
		t.Fatalf("want %d runes, got %d (%q)", previewRunes, n, got)
	}
	if !utf8.ValidString(got) {
		t.Fatalf("preview must stay valid UTF-8, got %q", got)
	}
}

func TestPreviewOfRendersBinaryAsHex(t *testing.T) {
	if got := previewOf([]byte{0x00, 0x01, 0xff}); got != "0001ff" {
		t.Fatalf("want 0001ff, got %q", got)
	}
}

func TestPreviewOfCapsHexLength(t *testing.T) {
	got := previewOf(make([]byte, 64)) // all NUL -> binary
	if len(got) != previewHexBytes*2 {
		t.Fatalf("want %d hex chars, got %d", previewHexBytes*2, len(got))
	}
}

func TestPreviewOfKeepsNewlinesAsText(t *testing.T) {
	// \n (0x0a) and \r (0x0d) are inside the allowed 9..13 range: still text.
	if got := previewOf([]byte("a\nb")); got != "a\nb" {
		t.Fatalf("want a\\nb, got %q", got)
	}
}

func TestPreviewOfEmpty(t *testing.T) {
	if got := previewOf(nil); got != "" {
		t.Fatalf("want empty string, got %q", got)
	}
}
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `go test ./internal/store/ -run TestPreviewOf -v`
Expected: FAIL — `undefined: previewOf`

- [ ] **Step 3: 구현**

`internal/store/preview.go`:

```go
package store

import (
	"encoding/hex"
	"strings"
	"unicode/utf8"
)

const (
	// previewRunes caps the text preview shown per tree node. The frontend used
	// to decode the full payload just to slice 34 chars off it; the backend now
	// sends only what is displayable.
	previewRunes = 48
	// previewHexBytes caps the hex rendering of binary payloads.
	previewHexBytes = 16
)

// previewOf renders a short, display-safe summary of a payload for the topic tree.
// Binary payloads render as hex; text payloads are truncated on a rune boundary so
// the frontend never receives a split code point.
func previewOf(payload []byte) string {
	if len(payload) == 0 {
		return ""
	}
	if isBinary(payload) {
		n := len(payload)
		if n > previewHexBytes {
			n = previewHexBytes
		}
		return hex.EncodeToString(payload[:n])
	}
	var b strings.Builder
	for i, count := 0, 0; i < len(payload) && count < previewRunes; count++ {
		r, size := utf8.DecodeRune(payload[i:])
		if r == utf8.RuneError && size == 1 {
			break // invalid UTF-8 tail: stop at the last whole rune
		}
		b.WriteRune(r)
		i += size
	}
	return b.String()
}

// isBinary mirrors the frontend's detectFormat heuristic (payload.ts:28-30): any
// byte below 9 or between 14 and 31 means the payload is not displayable text.
func isBinary(payload []byte) bool {
	for _, c := range payload {
		if c < 9 || (c > 13 && c < 32) {
			return true
		}
	}
	return false
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `go test ./internal/store/ -run TestPreviewOf -v`
Expected: PASS (6 tests)

- [ ] **Step 5: 커밋**

```bash
git add internal/store/preview.go internal/store/preview_test.go
git commit -m "feat(store): add payload preview renderer for tree nodes"
```

---

## Task 2: 링버퍼 subtree 병합

중간 노드(로봇)를 선택했을 때 하위 토픽들의 이력을 시간순으로 합쳐 돌려준다.

**Files:**
- Modify: `internal/store/ringbuffer.go`
- Test: `internal/store/ringbuffer_test.go` (기존 파일에 추가)

- [ ] **Step 1: 실패하는 테스트 작성**

`internal/store/ringbuffer_test.go` 끝에 추가:

```go
func TestGetSubtreeMergesChronologically(t *testing.T) {
	rb := NewRingBuffer(10)
	rb.Append("a/b/x", mqtt.Message{Topic: "a/b/x", Payload: []byte("1"), Timestamp: time.Unix(1, 0)})
	rb.Append("a/b/y", mqtt.Message{Topic: "a/b/y", Payload: []byte("2"), Timestamp: time.Unix(2, 0)})
	rb.Append("a/b/x", mqtt.Message{Topic: "a/b/x", Payload: []byte("3"), Timestamp: time.Unix(3, 0)})

	got := rb.GetSubtree("a/b", 10)
	if len(got) != 3 {
		t.Fatalf("want 3 merged messages, got %d", len(got))
	}
	if string(got[0].Payload) != "1" || string(got[1].Payload) != "2" || string(got[2].Payload) != "3" {
		t.Fatalf("want ascending 1,2,3, got %s,%s,%s", got[0].Payload, got[1].Payload, got[2].Payload)
	}
}

func TestGetSubtreeEnforcesSeparator(t *testing.T) {
	rb := NewRingBuffer(10)
	rb.Append("a/robot", mqtt.Message{Topic: "a/robot", Timestamp: time.Unix(1, 0)})
	rb.Append("a/robot2", mqtt.Message{Topic: "a/robot2", Timestamp: time.Unix(2, 0)})
	rb.Append("a/robot/x", mqtt.Message{Topic: "a/robot/x", Timestamp: time.Unix(3, 0)})

	got := rb.GetSubtree("a/robot", 10)
	if len(got) != 2 {
		t.Fatalf("want exact topic + descendants only, got %d", len(got))
	}
	for _, m := range got {
		if m.Topic == "a/robot2" {
			t.Fatal("a/robot2 must not match focus a/robot")
		}
	}
}

func TestGetSubtreeKeepsNewestWithinLimit(t *testing.T) {
	rb := NewRingBuffer(10)
	for i := 0; i < 6; i++ {
		rb.Append("t/a", mqtt.Message{Topic: "t/a", Payload: []byte{byte('0' + i)}, Timestamp: time.Unix(int64(i), 0)})
	}
	got := rb.GetSubtree("t", 2)
	if len(got) != 2 || string(got[0].Payload) != "4" || string(got[1].Payload) != "5" {
		t.Fatalf("want newest two (4,5), got %v", got)
	}
}

func TestGetSubtreeRejectsEmptyPrefix(t *testing.T) {
	rb := NewRingBuffer(10)
	rb.Append("a", mqtt.Message{Topic: "a"})
	if got := rb.GetSubtree("", 10); got != nil {
		t.Fatalf("empty prefix must return nil, got %d messages", len(got))
	}
}

func TestGetSubtreeIsolatesPayloadBytes(t *testing.T) {
	rb := NewRingBuffer(10)
	rb.Append("a/b", mqtt.Message{Topic: "a/b", Payload: []byte("abc"), Timestamp: time.Unix(1, 0)})
	rb.GetSubtree("a", 10)[0].Payload[0] = 'X'
	if got := rb.GetSubtree("a", 10); string(got[0].Payload) != "abc" {
		t.Fatalf("store corrupted by mutating returned copy: got %s", got[0].Payload)
	}
}
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `go test ./internal/store/ -run TestGetSubtree -v`
Expected: FAIL — `rb.GetSubtree undefined`

- [ ] **Step 3: 구현**

`internal/store/ringbuffer.go` 상단 import를 다음으로 교체:

```go
import (
	"sort"
	"strings"
	"sync"

	"github.com/kenshin579/mqtt-insight/internal/mqtt"
)
```

파일 끝(`Clear` 아래)에 추가:

```go
// GetSubtree merges the buffers of every topic at or below prefix into one
// chronological slice, returning at most the newest `limit` messages. The "/"
// separator is enforced so "a/robot" does not match "a/robot2".
//
// Message structs are shallow-copied under the lock; payload byte slices are
// deep-copied only for the messages actually returned. That is safe because
// Append never writes into an already-stored payload array — it allocates a
// fresh one per message.
func (r *RingBuffer) GetSubtree(prefix string, limit int) []mqtt.Message {
	if prefix == "" || limit < 1 {
		return nil
	}
	r.mu.RLock()
	var out []mqtt.Message
	for topic, buf := range r.byTopic {
		if topic != prefix && !strings.HasPrefix(topic, prefix+"/") {
			continue
		}
		out = append(out, buf...)
	}
	r.mu.RUnlock()

	sort.SliceStable(out, func(i, j int) bool { return out[i].Timestamp.Before(out[j].Timestamp) })
	if len(out) > limit {
		out = out[len(out)-limit:]
	}
	for i := range out {
		out[i].Payload = append([]byte(nil), out[i].Payload...)
	}
	return out
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `go test ./internal/store/ -run TestGetSubtree -v`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add internal/store/ringbuffer.go internal/store/ringbuffer_test.go
git commit -m "feat(store): merge ring buffers across a topic subtree"
```

---

## Task 3: focus 매칭 규칙

`focus == ""`가 "전체"가 아니라 **"아무것도 안 보냄"**이라는 것이 이 태스크의 핵심이다. 기본 상태에서 브릿지 트래픽이 0이 되는 근거가 여기다.

**Files:**
- Create: `internal/app/focus.go`
- Test: `internal/app/focus_test.go`

- [ ] **Step 1: 실패하는 테스트 작성**

`internal/app/focus_test.go`:

```go
package app

import (
	"testing"

	"github.com/kenshin579/mqtt-insight/internal/mqtt"
)

func TestMatchesFocusEmptyMatchesNothing(t *testing.T) {
	if MatchesFocus("a/b", "") {
		t.Fatal("empty focus must match nothing, not everything")
	}
}

func TestMatchesFocusExactTopic(t *testing.T) {
	if !MatchesFocus("a/b", "a/b") {
		t.Fatal("exact topic must match")
	}
}

func TestMatchesFocusDescendant(t *testing.T) {
	if !MatchesFocus("a/b/c", "a/b") {
		t.Fatal("descendant must match")
	}
}

func TestMatchesFocusEnforcesSeparator(t *testing.T) {
	if MatchesFocus("a/robot2", "a/robot") {
		t.Fatal("a/robot2 must not match focus a/robot")
	}
}

func TestMatchesFocusRejectsAncestor(t *testing.T) {
	if MatchesFocus("a", "a/b") {
		t.Fatal("ancestor must not match a deeper focus")
	}
}

func TestFilterFocusKeepsOrderAndDropsOthers(t *testing.T) {
	ms := []mqtt.Message{
		{Topic: "a/b/1"},
		{Topic: "z/other"},
		{Topic: "a/b/2"},
	}
	got := FilterFocus(ms, "a/b")
	if len(got) != 2 || got[0].Topic != "a/b/1" || got[1].Topic != "a/b/2" {
		t.Fatalf("want a/b/1 then a/b/2, got %+v", got)
	}
}

func TestFilterFocusEmptyReturnsNil(t *testing.T) {
	if got := FilterFocus([]mqtt.Message{{Topic: "a"}}, ""); got != nil {
		t.Fatalf("empty focus must return nil, got %d", len(got))
	}
}
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `go test ./internal/app/ -run 'TestMatchesFocus|TestFilterFocus' -v`
Expected: FAIL — `undefined: MatchesFocus`

- [ ] **Step 3: 구현**

`internal/app/focus.go`:

```go
package app

import (
	"strings"

	"github.com/kenshin579/mqtt-insight/internal/mqtt"
)

// MatchesFocus reports whether a topic belongs to the focused subtree.
//
// An empty focus matches nothing. "No topic selected" means "send nothing" —
// not "send everything" — and that is what keeps the bridge idle by default.
// The "/" separator is required so "a/robot" does not capture "a/robot2".
func MatchesFocus(topic, focus string) bool {
	if focus == "" {
		return false
	}
	return topic == focus || strings.HasPrefix(topic, focus+"/")
}

// FilterFocus returns the messages of a batch that belong to the focused
// subtree, preserving arrival order.
func FilterFocus(ms []mqtt.Message, focus string) []mqtt.Message {
	if focus == "" {
		return nil
	}
	var out []mqtt.Message
	for _, m := range ms {
		if MatchesFocus(m.Topic, focus) {
			out = append(out, m)
		}
	}
	return out
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `go test ./internal/app/ -run 'TestMatchesFocus|TestFilterFocus' -v`
Expected: PASS (7 tests)

- [ ] **Step 5: 커밋**

```bash
git add internal/app/focus.go internal/app/focus_test.go
git commit -m "feat(app): add focus matching rules for the message stream"
```

---

## Task 4: msg/s 슬라이딩 윈도우 카운터

현재 프론트는 500개 배열을 훑으며 `new Date()`를 초당 1만 번 파싱하고, 버퍼가 1초치밖에 안 담겨 표시값이 100 msg/s를 넘지 못한다. 정수 증감으로 바꾸면 두 문제가 함께 사라진다.

**Files:**
- Create: `internal/app/rate.go`
- Test: `internal/app/rate_test.go`

- [ ] **Step 1: 실패하는 테스트 작성**

`internal/app/rate_test.go`:

```go
package app

import "testing"

func TestRateCounterAveragesOverWindow(t *testing.T) {
	c := NewRateCounter()
	c.AddGlobal(500)
	c.AddFocused(50)
	g, f := c.Rates()
	if g != 100 {
		t.Fatalf("want global 100 msg/s (500 over 5s), got %v", g)
	}
	if f != 10 {
		t.Fatalf("want focused 10 msg/s, got %v", f)
	}
}

func TestRateCounterDecaysToZero(t *testing.T) {
	c := NewRateCounter()
	c.AddGlobal(500)
	for i := 0; i < rateBuckets; i++ {
		c.Advance()
	}
	if g, _ := c.Rates(); g != 0 {
		t.Fatalf("want 0 after the window rotates fully, got %v", g)
	}
}

func TestRateCounterKeepsRecentBuckets(t *testing.T) {
	c := NewRateCounter()
	c.AddGlobal(500)
	c.Advance() // only the bucket we land on is cleared
	if g, _ := c.Rates(); g != 100 {
		t.Fatalf("want 100 still inside the window, got %v", g)
	}
}

func TestRateCounterReset(t *testing.T) {
	c := NewRateCounter()
	c.AddGlobal(500)
	c.AddFocused(500)
	c.Reset()
	if g, f := c.Rates(); g != 0 || f != 0 {
		t.Fatalf("want 0/0 after reset, got %v/%v", g, f)
	}
}
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `go test ./internal/app/ -run TestRateCounter -v`
Expected: FAIL — `undefined: NewRateCounter`

- [ ] **Step 3: 구현**

`internal/app/rate.go`:

```go
package app

import "sync"

// rateBuckets is the number of 1-second buckets in the sliding window; the
// window is therefore rateBuckets seconds wide.
const rateBuckets = 5

// RateCounter tracks messages/second over a sliding window using one bucket per
// second. Advance rotates the ring — callers drive it from a 1s ticker so the
// rate decays back to zero when traffic stops.
//
// Counting integers here (rather than re-scanning a message buffer in the UI)
// is also what removes the old display cap: the frontend buffer held ~1s of
// traffic while the window was 5s, so the shown rate could never exceed 100.
type RateCounter struct {
	mu      sync.Mutex
	global  [rateBuckets]int
	focused [rateBuckets]int
	cursor  int
}

// NewRateCounter creates an empty counter.
func NewRateCounter() *RateCounter { return &RateCounter{} }

// AddGlobal records n messages received from the broker.
func (c *RateCounter) AddGlobal(n int) {
	c.mu.Lock()
	c.global[c.cursor] += n
	c.mu.Unlock()
}

// AddFocused records n messages that passed the focus filter.
func (c *RateCounter) AddFocused(n int) {
	c.mu.Lock()
	c.focused[c.cursor] += n
	c.mu.Unlock()
}

// Advance rotates to the next bucket, clearing the one it lands on.
func (c *RateCounter) Advance() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.cursor = (c.cursor + 1) % rateBuckets
	c.global[c.cursor] = 0
	c.focused[c.cursor] = 0
}

// Rates returns messages/second over the window for the global and focused streams.
func (c *RateCounter) Rates() (global, focused float64) {
	c.mu.Lock()
	defer c.mu.Unlock()
	var g, f int
	for i := 0; i < rateBuckets; i++ {
		g += c.global[i]
		f += c.focused[i]
	}
	return float64(g) / rateBuckets, float64(f) / rateBuckets
}

// Reset clears every bucket. Used when a connection is torn down so a new
// session does not inherit the previous one's rate.
func (c *RateCounter) Reset() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.global = [rateBuckets]int{}
	c.focused = [rateBuckets]int{}
	c.cursor = 0
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `go test ./internal/app/ -run TestRateCounter -v`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add internal/app/rate.go internal/app/rate_test.go
git commit -m "feat(app): add sliding-window message rate counter"
```

---

## Task 5: 트리 스냅샷 다이어트 + 변경 감지

3배 목표에서 트리 스냅샷은 790 KB → ~60 KB가 된다. `revision`은 변화가 없을 때 emit을 건너뛰기 위한 것이다.

프론트 타입과 `TopicTree.tsx:66`도 **이 태스크에서 함께** 고친다. 그래야 커밋 하나가 계약 변경을 end-to-end로 담고 빌드가 계속 green이다.

**Files:**
- Modify: `internal/store/tree.go`
- Modify: `internal/store/store.go`
- Modify: `internal/store/tree_test.go:36-38`
- Modify: `internal/store/store_test.go:32-35`
- Modify: `frontend/src/types.ts:18`
- Modify: `frontend/src/components/TopicTree.tsx:4,66`

- [ ] **Step 1: 실패하는 테스트 작성**

`internal/store/tree_test.go`의 `TestTreeInsertUpdatesLeafStats` 안에서 `LastPayload` 블록을 교체:

```go
	if leaf.Preview != "2" {
		t.Fatalf("want last preview 2, got %q", leaf.Preview)
	}
```

`internal/store/store_test.go`의 `TestMemoryStoreIsolatesPayloadBytes` 안에서 `LastPayload` 블록을 교체:

```go
	leaf := s.TreeSnapshot().Children[0]
	if leaf.Preview != "abc" {
		t.Fatalf("tree preview corrupted by caller mutation: got %q", leaf.Preview)
	}
```

`internal/store/tree_test.go` 끝에 revision 테스트 추가:

```go
func TestTreeRevisionAdvancesOnInsertOnly(t *testing.T) {
	tr := NewTree()
	start := tr.Revision()

	tr.Insert(mqtt.Message{Topic: "a/b", Payload: []byte("1"), Timestamp: time.Unix(1, 0)})
	afterInsert := tr.Revision()
	if afterInsert == start {
		t.Fatal("Insert must advance the revision")
	}

	tr.Snapshot()
	if tr.Revision() != afterInsert {
		t.Fatal("Snapshot must not advance the revision")
	}

	tr.Clear()
	if tr.Revision() == afterInsert {
		t.Fatal("Clear must advance the revision so the emptied tree is emitted")
	}
}
```

`internal/store/store_test.go` 끝에 추가:

```go
func TestMemoryStoreHistorySubtree(t *testing.T) {
	s := NewMemoryStore(5)
	s.Record(mqtt.Message{Topic: "r/1/a", Payload: []byte("x"), Timestamp: time.Unix(1, 0)})
	s.Record(mqtt.Message{Topic: "r/1/b", Payload: []byte("y"), Timestamp: time.Unix(2, 0)})
	s.Record(mqtt.Message{Topic: "r/2/a", Payload: []byte("z"), Timestamp: time.Unix(3, 0)})

	got := s.HistorySubtree("r/1", 10)
	if len(got) != 2 {
		t.Fatalf("want 2 messages under r/1, got %d", len(got))
	}
	if s.TreeRevision() == 0 {
		t.Fatal("TreeRevision must reflect recorded messages")
	}
}
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `go test ./internal/store/ -v`
Expected: FAIL — `leaf.Preview undefined`, `tr.Revision undefined`, `s.HistorySubtree undefined`

- [ ] **Step 3: `internal/store/tree.go` 구현**

`Node` 구조체의 `LastPayload` 줄을 교체:

```go
	Preview      string    `json:"preview,omitempty"`
```

`Tree` 구조체에 revision 필드 추가:

```go
// Tree is a thread-safe aggregating topic tree.
type Tree struct {
	mu       sync.RWMutex
	root     *Node
	revision uint64
}
```

`Insert`의 leaf 갱신 블록(`cur.MessageCount++` 이하)을 교체:

```go
	cur.MessageCount++
	cur.Preview = previewOf(m.Payload)
	cur.LastSeen = m.Timestamp
	cur.Retained = m.Retained
	t.revision++
```

`copyNode`의 필드 복사를 교체:

```go
	cp := &Node{
		Name: n.Name, FullTopic: n.FullTopic, MessageCount: n.MessageCount,
		Preview: n.Preview, LastSeen: n.LastSeen, Retained: n.Retained,
	}
```

`Clear`를 교체하고 `Revision`을 추가:

```go
// Clear resets the tree.
func (t *Tree) Clear() {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.root = &Node{Name: "", childIndex: map[string]*Node{}}
	t.revision++
}

// Revision increments on every mutation. The emitter compares it against the
// last emitted value so an unchanged tree is never re-serialized.
func (t *Tree) Revision() uint64 {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return t.revision
}
```

- [ ] **Step 4: `internal/store/store.go` 구현**

인터페이스와 구현을 교체:

```go
// MessageStore is the abstraction the app depends on. Swappable for v2 persistence.
type MessageStore interface {
	Record(m mqtt.Message)
	History(topic string) []mqtt.Message
	HistorySubtree(prefix string, limit int) []mqtt.Message
	TreeSnapshot() *Node
	TreeRevision() uint64
	Clear()
	SetCapacity(n int)
}
```

`History` 아래에 추가:

```go
func (s *MemoryStore) HistorySubtree(prefix string, limit int) []mqtt.Message {
	return s.ring.GetSubtree(prefix, limit)
}
func (s *MemoryStore) TreeRevision() uint64 { return s.tree.Revision() }
```

- [ ] **Step 5: Go 테스트 통과 확인**

Run: `go test ./internal/store/ -v`
Expected: PASS (기존 테스트 전부 + 신규 2건)

- [ ] **Step 6: 프론트 타입 갱신**

`frontend/src/types.ts:18`을 교체:

```ts
  preview?: string; // backend-truncated display string (see internal/store/preview.go)
```

`frontend/src/components/TopicTree.tsx:66`을 교체:

```ts
      preview: node.preview ?? "",
```

`frontend/src/components/TopicTree.tsx:4`의 import를 삭제 (더 이상 쓰지 않음):

```ts
import { bytesToString } from "../lib/payload";
```

- [ ] **Step 7: 프론트 타입체크 통과 확인**

Run: `cd frontend && npx tsc --noEmit`
Expected: 출력 없음 (성공)

- [ ] **Step 8: 커밋**

```bash
git add internal/store/ frontend/src/types.ts frontend/src/components/TopicTree.tsx
git commit -m "perf(store): drop full payloads from the tree snapshot

The frontend decoded every leaf's ~1KB payload just to slice 34 chars off
it, 20 times a second. The backend now stores and ships a short preview
string instead, and a revision counter lets the emitter skip unchanged
trees entirely."
```

---

## Task 6: 백엔드 트랙 분리 (app.go)

> **주의:** 이 커밋은 `mqtt:messages`의 형태를 바꾼다. Task 7이 프론트를 맞출 때까지 앱을 실행하지 말 것. 두 태스크는 짝이다.

**Files:**
- Modify: `app.go`

- [ ] **Step 1: 상수와 필드 추가**

`app.go`의 `App` 구조체에 3개 필드를 추가 (`updating` 아래):

```go
	focus      string             // focused topic subtree; "" = stream nothing (protected by mu)
	rate       *app.RateCounter   // sliding-window msg/s
	tickStop   chan struct{}      // stops the tree/rate tickers
```

`import` 블록 바로 아래에 상수 블록을 추가:

```go
// Emission budget — see docs/superpowers/specs/2026-07-25-high-volume-performance-design.md §2.1
const (
	treeEmitInterval    = 500 * time.Millisecond
	rateEmitInterval    = time.Second
	maxPerFlush         = 100 // per 50ms flush = 2,000 msg/s ceiling on the focused stream
	subtreeHistoryLimit = 500
)

// focusBatch is the mqtt:messages payload. Focus travels with the batch so a
// frontend that has already moved on can discard it without any locking.
type focusBatch struct {
	Focus    string         `json:"focus"`
	Messages []mqtt.Message `json:"messages"`
	Dropped  int            `json:"dropped"`
}
```

- [ ] **Step 2: startup의 배처 콜백을 교체**

`app.go:51-61`의 `a.batcher = app.NewBatcher(...)` 부터 `a.batcher.Start()` 까지를 교체:

```go
	a.rate = app.NewRateCounter()
	a.batcher = app.NewBatcher(50*time.Millisecond, a.flush)
	a.batcher.Start()
	stop := make(chan struct{})
	a.tickStop = stop
	go a.treeLoop(stop)
	go a.rateLoop(stop)
```

- [ ] **Step 3: flush와 티커 구현**

`shutdown` 함수 바로 위에 추가:

```go
// flush records every received message and forwards only the focused subtree to
// the frontend. Collection is unconditional; the bridge is not.
func (a *App) flush(ms []mqtt.Message) {
	for _, m := range ms {
		a.store.Record(m)
		if a.recorder != nil {
			a.recorder.Record(m)
		}
	}
	a.rate.AddGlobal(len(ms))

	a.mu.Lock()
	f := a.focus
	a.mu.Unlock()
	if f == "" {
		return // nothing selected: the bridge stays idle
	}

	out := app.FilterFocus(ms, f)
	if len(out) == 0 {
		return
	}
	a.rate.AddFocused(len(out))

	dropped := 0
	if len(out) > maxPerFlush {
		dropped = len(out) - maxPerFlush
		out = out[len(out)-maxPerFlush:]
	}
	runtime.EventsEmit(a.ctx, "mqtt:messages", focusBatch{Focus: f, Messages: out, Dropped: dropped})
}

// treeLoop emits the topic tree on its own slower cadence, and only when it
// actually changed. Tree badges tolerate half a second of lag; messages do not.
//
// stop is passed in rather than read from a.tickStop each iteration, so shutdown
// can clear the field without racing the loop.
func (a *App) treeLoop(stop <-chan struct{}) {
	tk := time.NewTicker(treeEmitInterval)
	defer tk.Stop()
	var last uint64
	for {
		select {
		case <-tk.C:
			if a.store == nil {
				continue
			}
			rev := a.store.TreeRevision()
			if rev == last {
				continue
			}
			last = rev
			runtime.EventsEmit(a.ctx, "mqtt:tree", a.store.TreeSnapshot())
		case <-stop:
			return
		}
	}
}

// rateLoop publishes the sliding-window rate and rotates the counter.
func (a *App) rateLoop(stop <-chan struct{}) {
	tk := time.NewTicker(rateEmitInterval)
	defer tk.Stop()
	for {
		select {
		case <-tk.C:
			g, f := a.rate.Rates()
			runtime.EventsEmit(a.ctx, "mqtt:rate", map[string]any{"global": g, "focused": f})
			a.rate.Advance()
		case <-stop:
			return
		}
	}
}

// resetStream clears focus and rate so a new connection never inherits the
// previous session's stream.
func (a *App) resetStream() {
	a.mu.Lock()
	a.focus = ""
	a.mu.Unlock()
	if a.rate != nil {
		a.rate.Reset()
	}
}
```

- [ ] **Step 4: shutdown에서 티커 정지**

`shutdown` 본문 맨 앞에 추가:

```go
	if a.tickStop != nil {
		close(a.tickStop)
		a.tickStop = nil
	}
```

- [ ] **Step 5: SetFocus 바인딩 추가**

`History` 함수 바로 아래에 추가:

```go
// SetFocus scopes the live message stream to a topic subtree and returns the
// buffered history for it, so selection costs one round trip instead of two.
// An empty topic stops the stream.
func (a *App) SetFocus(topic string) []mqtt.Message {
	a.mu.Lock()
	a.focus = topic
	a.mu.Unlock()
	if topic == "" || a.store == nil {
		return nil
	}
	return a.store.HistorySubtree(topic, subtreeHistoryLimit)
}
```

- [ ] **Step 6: 연결 전환 시 focus 초기화**

`Connect` 안의 `a.store.Clear()` 바로 아래에 추가:

```go
	a.resetStream()
```

`Disconnect` 안의 `a.mu.Unlock()` 바로 아래(=`if cancel != nil` 위)에 추가:

```go
	a.resetStream()
```

- [ ] **Step 7: 빌드와 테스트 확인**

Run: `go vet ./... && go test ./...`
Expected: PASS, vet 경고 없음

- [ ] **Step 8: Wails 바인딩 재생성**

Run: `wails generate module`
Expected: `frontend/wailsjs/go/main/App.d.ts`에 `SetFocus` 추가됨

확인: `grep -n "SetFocus" frontend/wailsjs/go/main/App.d.ts`

- [ ] **Step 9: 커밋**

```bash
git add app.go frontend/wailsjs
git commit -m "perf(app): split emission into message, tree and rate tracks

Collection stays on the 50ms batcher, but the tree now emits every 500ms
and only when its revision changed, and messages only cross the bridge for
the focused subtree. With nothing selected the bridge is silent.

NOTE: mqtt:messages changes shape here; the frontend is updated in the
next commit."
```

---

## Task 7: 프론트 상태 재구성

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/store/appStore.ts`
- Modify: `frontend/src/bridge/events.ts`
- Create: `frontend/src/bridge/focus.ts`
- Create: `frontend/src/store/appStore.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/store/appStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore, MAX_FOCUS } from "./appStore";
import type { Message } from "../types";

function msg(topic: string, ts: string): Message {
  return { topic, payload: "", qos: 0, retained: false, timestamp: ts };
}

describe("appStore focus stream", () => {
  beforeEach(() => {
    useAppStore.getState().resetSession();
  });

  it("drops a batch whose focus no longer matches the selection", () => {
    const st = useAppStore.getState();
    st.focusTopic("a/b", true, []);
    st.pushMessages({ focus: "stale/topic", messages: [msg("stale/topic", "t")], dropped: 0 });
    expect(useAppStore.getState().focusMessages).toHaveLength(0);
  });

  it("appends a batch that matches the selection", () => {
    const st = useAppStore.getState();
    st.focusTopic("a/b", true, []);
    st.pushMessages({ focus: "a/b", messages: [msg("a/b", "t")], dropped: 0 });
    expect(useAppStore.getState().focusMessages).toHaveLength(1);
  });

  it("caps focusMessages at MAX_FOCUS", () => {
    const st = useAppStore.getState();
    st.focusTopic("a/b", true, []);
    const many = Array.from({ length: MAX_FOCUS + 50 }, (_, i) => msg("a/b", String(i)));
    st.pushMessages({ focus: "a/b", messages: many, dropped: 0 });
    expect(useAppStore.getState().focusMessages).toHaveLength(MAX_FOCUS);
  });

  it("accumulates dropped counts", () => {
    const st = useAppStore.getState();
    st.focusTopic("a/b", true, []);
    st.pushMessages({ focus: "a/b", messages: [], dropped: 7 });
    st.pushMessages({ focus: "a/b", messages: [], dropped: 3 });
    expect(useAppStore.getState().dropped).toBe(10);
  });

  it("focusTopic selects the newest message and clears the summary", () => {
    const st = useAppStore.getState();
    st.showSubtreeSummary("a");
    st.focusTopic("a/b", true, [msg("a/b", "1"), msg("a/b", "2")]);
    const after = useAppStore.getState();
    expect(after.selectedMsg?.timestamp).toBe("2");
    expect(after.summaryTopic).toBeNull();
  });

  it("showSubtreeSummary clears the stream state", () => {
    const st = useAppStore.getState();
    st.focusTopic("a/b", true, [msg("a/b", "1")]);
    st.showSubtreeSummary("a");
    const after = useAppStore.getState();
    expect(after.selectedTopic).toBeNull();
    expect(after.focusMessages).toHaveLength(0);
    expect(after.summaryTopic).toBe("a");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd frontend && npx vitest run src/store/appStore.test.ts`
Expected: FAIL — `MAX_FOCUS` / `focusTopic` / `showSubtreeSummary` 없음

- [ ] **Step 3: `frontend/src/types.ts`에 이벤트 타입 추가**

파일 끝에 추가:

```ts
/** mqtt:messages payload — messages already scoped to `focus` by the backend. */
export interface FocusBatch {
  focus: string;
  messages: Message[];
  dropped: number;
}

/** mqtt:rate payload — backend-computed messages/second over a 5s window. */
export interface RateEvent {
  global: number;
  focused: number;
}
```

- [ ] **Step 4: `frontend/src/store/appStore.ts` 갱신**

import에 `FocusBatch`, `RateEvent`를 추가:

```ts
import type { Message, TreeNode, Status, UpdateInfo, FocusBatch, RateEvent } from "../types";
```

`AppState`의 data 블록(`tree` ~ `msgSource`)을 교체:

```ts
  // data
  tree: TreeNode | null;
  focusMessages: Message[]; // messages of the focused subtree only
  rate: RateEvent;          // backend-computed msg/s
  dropped: number;          // messages the backend skipped to hold the emit cap
  subs: Sub[]; recording: Set<string>;
  selectedTopic: string | null;  // streaming selection (also the backend focus)
  selectedIsLeaf: boolean;       // false = subtree selection, so rows show their topic
  summaryTopic: string | null;   // selection too wide to stream — summary shown instead
  selectedMsg: Message | null;
  msgSource: MsgSource;
```

`clearedAt` 필드 선언(`ui` 블록 안)을 삭제한다.

액션 선언에서 `setTree` 아래의 `pushMessages`/`selectTopic`을 교체하고 두 개를 추가:

```ts
  setTree: (t: TreeNode) => void;
  pushMessages: (batch: FocusBatch) => void;
  setRate: (r: RateEvent) => void;
  focusTopic: (t: string | null, isLeaf: boolean, msgs: Message[]) => void;
  showSubtreeSummary: (t: string) => void;
```

`clearMessages: (topic: string | null) => void;` 선언을 교체:

```ts
  clearMessages: () => void;
```

`const MAX_LIVE = 500;` 를 교체:

```ts
/** Ring cap for the focused stream. Display bound — unrelated to settings.ringBufferSize,
 *  which is how many messages the Go store keeps per topic. */
export const MAX_FOCUS = 500;
```

초기 상태의 data 줄들을 교체:

```ts
  tree: null, focusMessages: [], rate: { global: 0, focused: 0 }, dropped: 0,
  subs: [], recording: new Set<string>(),
  selectedTopic: null, selectedIsLeaf: true, summaryTopic: null,
  selectedMsg: null, msgSource: "live",
```

`ui` 초기값 줄에서 `clearedAt: {},` 를 삭제한다.

`pushMessages`와 `selectTopic` 구현(주석 포함, 88-99행)을 교체:

```ts
  // A batch carries the focus it was filtered with, so one comparison discards
  // anything produced before the user moved to another topic.
  pushMessages: (batch) => {
    const st = get();
    if (batch.focus !== (st.selectedTopic ?? "")) return;
    set({
      focusMessages: [...st.focusMessages, ...batch.messages].slice(-MAX_FOCUS),
      dropped: st.dropped + batch.dropped,
    });
  },
  setRate: (r) => set({ rate: r }),
  focusTopic: (t, isLeaf, msgs) => {
    const rows = msgs.slice(-MAX_FOCUS);
    set({
      selectedTopic: t, selectedIsLeaf: isLeaf, summaryTopic: null,
      focusMessages: rows, selectedMsg: rows.length ? rows[rows.length - 1] : null,
      dropped: 0, msgSource: "live", paused: false,
      ...(t ? { pubTopic: t, pubHint: true } : {}),
    });
  },
  showSubtreeSummary: (t) =>
    set({
      summaryTopic: t, selectedTopic: null, selectedIsLeaf: true,
      focusMessages: [], selectedMsg: null, dropped: 0, msgSource: "live", paused: false,
    }),
```

`clearMessages` 구현(주석 포함)을 교체:

```ts
  // Clear wipes the displayed stream only — the Go store and any recording keep
  // everything. New pushes simply append after it.
  clearMessages: () => set({ focusMessages: [], selectedMsg: null, dropped: 0 }),
```

`resetSession` 구현을 교체:

```ts
  resetSession: () =>
    set({
      tree: null, focusMessages: [], rate: { global: 0, focused: 0 }, dropped: 0,
      subs: [], selectedTopic: null, selectedIsLeaf: true, summaryTopic: null,
      selectedMsg: null, msgSource: "live", paused: false,
      searchOpen: false, searchQuery: "",
      pubTopic: "", pubHint: false, connectError: null, attempt: 0,
    }),
```

- [ ] **Step 5: `frontend/src/bridge/events.ts` 갱신**

import 타입 줄과 두 핸들러, cleanup을 교체:

```ts
import type { TreeNode, StatusEvent, UpdateInfo, FocusBatch, RateEvent } from "../types";
```

```ts
  EventsOn("mqtt:messages", (b: FocusBatch) => useAppStore.getState().pushMessages(b));
  EventsOn("mqtt:tree", (t: TreeNode) => useAppStore.getState().setTree(t));
  EventsOn("mqtt:rate", (r: RateEvent) => useAppStore.getState().setRate(r));
```

```ts
  return () =>
    EventsOff("mqtt:messages", "mqtt:tree", "mqtt:rate", "mqtt:status", "update:available", "update:progress", "update:error");
```

- [ ] **Step 6: `frontend/src/bridge/focus.ts` 생성**

```ts
import { SetFocus } from "../../wailsjs/go/main/App";
import { useAppStore } from "../store/appStore";
import { STREAM_LEAF_THRESHOLD } from "../lib/subtree";
import type { Message } from "../types";

/**
 * The single entry point for topic selection.
 *
 * Selection and backend focus must always move together — if some component
 * set the selection without calling SetFocus, the stream would silently stay
 * on the previous topic. Routing every selection through here also keeps the
 * subtree size guard in one place.
 */
export async function applyFocus(topic: string | null, isLeaf: boolean, leaves: number): Promise<void> {
  const st = useAppStore.getState();

  // Too wide to stream: stop the stream and show a summary instead, so an
  // accidental click on a parent node cannot re-create the firehose.
  if (topic && leaves > STREAM_LEAF_THRESHOLD) {
    await SetFocus("");
    st.showSubtreeSummary(topic);
    return;
  }

  const msgs = (await SetFocus(topic ?? "")) as unknown as Message[] | null;
  st.focusTopic(topic, isLeaf, msgs ?? []);
}
```

> `STREAM_LEAF_THRESHOLD`는 Task 8에서 만든다. 이 태스크의 타입체크는 Task 8 이후에 통과한다 — Step 9 참고.

- [ ] **Step 7: PublishPanel의 selectTopic 사용 전환**

`selectTopic`은 스토어에서 사라지므로, 이를 쓰는 곳을 전부 옮겨야 한다. `TopicTree`는 Task 10에서, `PublishPanel`은 여기서 처리한다 — 발행 직후 그 토픽을 선택하는 동작이라 backend focus도 함께 옮겨가야 한다.

`frontend/src/components/PublishPanel.tsx:4` 아래에 import 추가:

```ts
import { applyFocus } from "../bridge/focus";
```

`frontend/src/components/PublishPanel.tsx:23`을 삭제:

```ts
  const selectTopic = useAppStore((s) => s.selectTopic);
```

`frontend/src/components/PublishPanel.tsx:55`를 교체:

```ts
    setTimeout(() => void applyFocus(pubTopic, true, 1), 30);
```

> 발행 대상은 항상 정확한 토픽 하나이므로 `isLeaf=true`, `leaves=1`이다. 크기 가드에 걸릴 일이 없다.

- [ ] **Step 8: 스토어 테스트 통과 확인**

Run: `cd frontend && npx vitest run src/store/appStore.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 9: 커밋**

이 시점에서 `npx tsc --noEmit`은 아직 실패한다 (`subtree.ts` 미생성, `MessageList`/`TopicTree` 미갱신). 정상이며 Task 8–11에서 해소된다.

```bash
git add frontend/src/types.ts frontend/src/store/appStore.ts frontend/src/store/appStore.test.ts frontend/src/bridge/ frontend/src/components/PublishPanel.tsx
git commit -m "refactor(frontend): replace the global live buffer with a focused stream"
```

---

## Task 8: subtree 유틸

**Files:**
- Create: `frontend/src/lib/subtree.ts`
- Test: `frontend/src/lib/subtree.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/lib/subtree.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { leafCount, findNode, topTopics, STREAM_LEAF_THRESHOLD } from "./subtree";
import type { TreeNode } from "../types";

function leaf(fullTopic: string, count: number, preview = ""): TreeNode {
  const name = fullTopic.split("/").pop() as string;
  return { name, fullTopic, messageCount: count, preview, lastSeen: "", retained: false };
}
function branch(fullTopic: string, children: TreeNode[]): TreeNode {
  const name = fullTopic.split("/").pop() as string;
  return { name, fullTopic, children, messageCount: 0, lastSeen: "", retained: false };
}

const tree: TreeNode = branch("", [
  branch("arc", [
    branch("arc/robot", [
      branch("arc/robot/r1", [leaf("arc/robot/r1/report", 5), leaf("arc/robot/r1/bb", 3)]),
      branch("arc/robot/r2", [leaf("arc/robot/r2/report", 9)]),
    ]),
  ]),
]);

describe("subtree", () => {
  it("counts a leaf as one", () => {
    expect(leafCount(leaf("a/b", 1))).toBe(1);
  });
  it("counts leaves below a branch", () => {
    expect(leafCount(tree)).toBe(3);
    expect(leafCount(findNode(tree, "arc/robot/r1") as TreeNode)).toBe(2);
  });
  it("finds a node by full topic", () => {
    expect(findNode(tree, "arc/robot/r2/report")?.messageCount).toBe(9);
    expect(findNode(tree, "nope")).toBeNull();
    expect(findNode(null, "arc")).toBeNull();
  });
  it("ranks leaves by message count and applies the limit", () => {
    const top = topTopics(findNode(tree, "arc") as TreeNode, 2);
    expect(top.map((r) => r.topic)).toEqual(["arc/robot/r2/report", "arc/robot/r1/report"]);
  });
  it("exposes the guard threshold", () => {
    expect(STREAM_LEAF_THRESHOLD).toBe(20);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd frontend && npx vitest run src/lib/subtree.test.ts`
Expected: FAIL — cannot resolve `./subtree`

- [ ] **Step 3: 구현**

`frontend/src/lib/subtree.ts`:

```ts
import type { TreeNode } from "../types";

/**
 * Above this many leaf topics a selection is summarized instead of streamed.
 * The bound is on subtree *size*, not depth, so it holds for any broker's
 * topic layout — a depth rule would only be correct for one of them.
 */
export const STREAM_LEAF_THRESHOLD = 20;

/** Number of leaf topics at or below a node (a leaf counts as one). */
export function leafCount(node: TreeNode): number {
  if (!node.children || node.children.length === 0) return 1;
  return node.children.reduce((sum, c) => sum + leafCount(c), 0);
}

/** Find a node by its full topic path. Returns null when absent. */
export function findNode(root: TreeNode | null, fullTopic: string): TreeNode | null {
  if (!root) return null;
  const stack: TreeNode[] = root.children ? [...root.children] : [];
  while (stack.length) {
    const n = stack.pop() as TreeNode;
    if (n.fullTopic === fullTopic) return n;
    if (n.children) stack.push(...n.children);
  }
  return null;
}

export interface TopTopic {
  topic: string;
  count: number;
  preview: string;
}

/** The busiest leaf topics below a node, for the subtree summary panel. */
export function topTopics(node: TreeNode, limit: number): TopTopic[] {
  const out: TopTopic[] = [];
  const walk = (n: TreeNode) => {
    if (!n.children || n.children.length === 0) {
      out.push({ topic: n.fullTopic, count: n.messageCount, preview: n.preview ?? "" });
      return;
    }
    n.children.forEach(walk);
  };
  walk(node);
  out.sort((a, b) => b.count - a.count);
  return out.slice(0, limit);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd frontend && npx vitest run src/lib/subtree.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/lib/subtree.ts frontend/src/lib/subtree.test.ts
git commit -m "feat(frontend): add topic subtree helpers and the stream size guard"
```

---

## Task 9: i18n 문구 추가

TopicTree/MessageList/SubtreeSummary가 모두 참조하므로 UI 태스크보다 먼저 넣는다. `i18n.test.ts`가 ko/en 키 일치를 검사하니 **반드시 양쪽에 동일한 키**를 넣을 것.

**Files:**
- Modify: `frontend/src/lib/i18n.ts`

- [ ] **Step 1: ko 사전에 추가**

`updError: '업데이트 실패: {msg}',` 바로 아래에 추가:

```ts
    headerNone: '선택된 토픽 없음',
    droppedRows: '표시 한도 초과 — {n}건 생략',
    ssTopics: '{n}개 토픽',
    ssHint: '토픽이 많아 실시간 스트림을 표시하지 않아요. 아래에서 토픽을 고르거나 트리를 더 펼쳐 보세요.',
```

- [ ] **Step 2: en 사전에 추가**

`updError: 'Update failed: {msg}',` 바로 아래에 추가:

```ts
    headerNone: 'No topic selected',
    droppedRows: 'display cap reached — {n} skipped',
    ssTopics: '{n} topics',
    ssHint: 'Too many topics to stream. Pick one below, or expand the tree further.',
```

- [ ] **Step 3: 키 일치 테스트 통과 확인**

Run: `cd frontend && npx vitest run src/lib/i18n.test.ts`
Expected: PASS (6 tests) — "ko and en have identical key sets" 포함

- [ ] **Step 4: 커밋**

```bash
git add frontend/src/lib/i18n.ts
git commit -m "feat(i18n): add copy for the empty header, drop badge and subtree summary"
```

---

## Task 10: TopicTree 렌더 이탈 차단

**Files:**
- Modify: `frontend/src/components/TopicTree.tsx`

- [ ] **Step 1: import 정리**

1~12행 import 블록을 교체:

```tsx
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Tree, NodeApi } from "react-arborist";
import { useAppStore } from "../store/appStore";
import { matchesAny, type Sub } from "../lib/mqttMatch";
import { t } from "../lib/i18n";
import type { TreeNode } from "../types";
import { EnableRecording, DisableRecording, Publish, SaveSettings } from "../../wailsjs/go/main/App";
import { mqtt, config } from "../../wailsjs/go/models";
import { applyFocus } from "../bridge/focus";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { SubscriptionChips, TreeEmptyState } from "./SubscriptionChips";
import { Toast } from "./Toast";

/** localeCompare builds a fresh collator on every call; one shared instance
 *  serves every comparison in the sort below. */
const collator = new Intl.Collator();
```

- [ ] **Step 2: ArboristNode에 leaf 수 추가**

`interface ArboristNode` 를 교체:

```tsx
interface ArboristNode {
  id: string;
  name: string;
  isLeaf: boolean;
  count: number; // leaf = own messageCount; branch = recursive sum of descendant leaf counts (F5)
  leaves: number; // leaf topics at or below this node — drives the stream size guard
  retained: boolean;
  preview: string; // leaf only, backend-truncated
  dim: boolean; // leaf: unsubscribed; branch: every descendant leaf dim
  children?: ArboristNode[];
}
```

`toArborist`를 교체:

```tsx
function toArborist(node: TreeNode, subs: Sub[]): ArboristNode {
  const isLeaf = !node.children || node.children.length === 0;
  if (isLeaf) {
    return {
      id: node.fullTopic,
      name: node.name,
      isLeaf: true,
      count: node.messageCount,
      leaves: 1,
      retained: node.retained,
      preview: node.preview ?? "",
      dim: !matchesAny(node.fullTopic, subs),
    };
  }
  const children = [...node.children!]
    .sort((a, b) => collator.compare(a.name, b.name))
    .map((c) => toArborist(c, subs));
  return {
    id: node.fullTopic,
    name: node.name,
    isLeaf: false,
    count: children.reduce((s, c) => s + c.count, 0), // recursive sum
    leaves: children.reduce((s, c) => s + c.leaves, 0),
    retained: node.retained,
    preview: "",
    dim: children.every((c) => c.dim),
    children,
  };
}
```

- [ ] **Step 3: 행의 표시 부분만 memo 컴포넌트로 분리**

`leafCountOf` 함수 바로 아래에 추가:

```tsx
/**
 * The non-interactive part of a tree row.
 *
 * Only the presentation is memoized — the wrapping <div> keeps its click and
 * context-menu handlers inline, because those need the live NodeApi (for
 * expand/collapse) and would defeat memoization by changing identity every
 * render. `d` and the two booleans are stable within a tree snapshot, so the
 * default comparator is correct here.
 */
const RowContent = memo(function RowContent({
  d, isOpen, isRec,
}: {
  d: ArboristNode;
  isOpen: boolean;
  isRec: boolean;
}) {
  return (
    <>
      <span className="tt-caret">{d.isLeaf ? "" : isOpen ? "▾" : "▸"}</span>
      {isRec && <span className="tt-recdot">●</span>}
      <span className={"tt-name " + (d.isLeaf ? "leaf" : "branch")}>{d.name}</span>
      {d.count > 0 && <span className="tt-count">{d.count}</span>}
      {d.retained && <span className="tt-retained" title={t("retainedTip")}>R</span>}
      {d.isLeaf && d.preview && <span className="tt-preview">{d.preview}</span>}
    </>
  );
});
```

- [ ] **Step 4: 컴포넌트 상태 구독과 클릭 처리 교체**

`export function TopicTree()` 안에서 `const liveMessages = ...` 줄(94행)을 삭제하고, `const selectedTopic = ...` 줄을 다음으로 교체:

```tsx
  const selectedTopic = useAppStore((s) => s.selectedTopic);
  const summaryTopic = useAppStore((s) => s.summaryTopic);
```

`const selectTopic = useAppStore((s) => s.selectTopic);` 줄을 삭제한다.

`handleRowClick` 함수 전체를 교체:

```tsx
  // Selection always goes through applyFocus: it sets the backend focus, pulls
  // the subtree history in the same round trip, and applies the size guard.
  // Branch rows still toggle, so the collapsed-by-default tree stays navigable.
  function handleRowClick(node: NodeApi<ArboristNode>) {
    const d = node.data;
    if (!d.isLeaf) node.toggle();
    void applyFocus(d.id, d.isLeaf, d.leaves);
  }
```

- [ ] **Step 5: Tree 렌더 교체**

`<Tree ...>` 블록 전체(220~263행)를 교체:

```tsx
          <Tree
            key={filter ? "filtered" : "browse"}
            data={data}
            openByDefault={!!filter}
            width="100%"
            height={height || 400}
            rowHeight={26}
          >
            {({ node, style }) => {
              const d = node.data;
              const selected = (selectedTopic ?? summaryTopic) === d.id;
              return (
                <div
                  style={{ ...style, paddingLeft: 8 + node.level * 15 }}
                  className={["tt-row", selected && "sel", d.dim && "dim"].filter(Boolean).join(" ")}
                  onClick={() => handleRowClick(node)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenu({ x: e.clientX, y: e.clientY, node: d });
                  }}
                >
                  <RowContent d={d} isOpen={node.isOpen} isRec={recording.has(d.id)} />
                  <button
                    className="tt-menu-btn"
                    title={t("rowMenuTitle")}
                    onClick={(e) => {
                      e.stopPropagation();
                      const r = e.currentTarget.getBoundingClientRect();
                      setMenu({ x: r.left, y: r.bottom + 4, node: d });
                    }}
                  >
                    ⋯
                  </button>
                </div>
              );
            }}
          </Tree>
```

> `dragHandle`을 넘기지 않는다. 이 트리는 드래그를 쓰지 않는데 react-arborist의 드래그 감지가 붙어 있어 클릭이 삼켜질 수 있었다.
> `key`가 필터 유무에서만 바뀌므로, 필터를 켜면 매칭 결과가 펼쳐진 채로, 끄면 접힌 채로 시작한다. 키 입력마다 remount되지는 않는다.
> 행 클릭이 branch를 toggle하는 동작은 유지한다. 트리가 기본 접힘이 되었으므로 이것이 유일한 펼치기 수단이다 — caret은 우리가 그리는 장식일 뿐 react-arborist가 클릭을 처리해 주지 않는다.

- [ ] **Step 6: 타입체크 확인**

Run: `cd frontend && npx tsc --noEmit`
Expected: `MessageList.tsx` 관련 오류만 남음 (Task 11에서 해소). `TopicTree.tsx` 오류는 0건이어야 한다.

- [ ] **Step 7: 커밋**

```bash
git add frontend/src/components/TopicTree.tsx
git commit -m "perf(frontend): stop the topic tree from re-rendering 20x per second

Drops the liveMessages subscription that forced a full tree re-render on
every batch, removes the unused drag handle that could swallow clicks,
reuses one Intl.Collator instead of building one per comparison, memoizes
rows, and stops expanding every node by default."
```

---

## Task 11: MessageList를 focus 스트림으로 전환

**Files:**
- Modify: `frontend/src/components/MessageList.tsx` (전체 교체)

- [ ] **Step 1: 파일 전체를 교체**

`frontend/src/components/MessageList.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { FixedSizeList } from "react-window";
import { useAppStore } from "../store/appStore";
import { QueryRecorded } from "../../wailsjs/go/main/App";
import { bytesToString } from "../lib/payload";
import { formatTime, useNowTick } from "../lib/time";
import { t } from "../lib/i18n";
import { MessageDetail } from "./MessageDetail";
import { SubtreeSummary } from "./SubtreeSummary";
import { SearchBar } from "./SearchBar";
import { SegmentedControl } from "./SegmentedControl";
import type { Message } from "../types";

export function MessageList() {
  const selectedTopic = useAppStore((s) => s.selectedTopic);
  const selectedIsLeaf = useAppStore((s) => s.selectedIsLeaf);
  const summaryTopic = useAppStore((s) => s.summaryTopic);
  const focusMessages = useAppStore((s) => s.focusMessages);
  const dropped = useAppStore((s) => s.dropped);
  const rate = useAppStore((s) => s.rate);
  const paused = useAppStore((s) => s.paused);
  const togglePaused = useAppStore((s) => s.togglePaused);
  const clearMessages = useAppStore((s) => s.clearMessages);
  const recording = useAppStore((s) => s.recording);
  const msgSource = useAppStore((s) => s.msgSource);
  const setMsgSource = useAppStore((s) => s.setMsgSource);
  const searchOpen = useAppStore((s) => s.searchOpen);
  const searchQuery = useAppStore((s) => s.searchQuery);
  const setSearch = useAppStore((s) => s.setSearch);
  const selectedMsg = useAppStore((s) => s.selectedMsg);
  const selectMsg = useAppStore((s) => s.selectMsg);
  const settings = useAppStore((s) => s.settings);

  const [recorded, setRecorded] = useState<Message[]>([]);
  const isRecordable = !!selectedTopic && recording.has(selectedTopic);

  // G13: stuck guard — if the topic stops being recordable (or is deselected) while
  // viewing Recorded, the Live/Recorded toggle disappears; fall back to live so the
  // view can never get stuck showing a control that no longer exists.
  useEffect(() => {
    if (!isRecordable && msgSource === "recorded") setMsgSource("live");
  }, [isRecordable, msgSource, setMsgSource]);

  function loadRecorded() {
    if (!selectedTopic) return;
    // Backend returns newest-first; renderer expects ascending rows.
    QueryRecorded(selectedTopic, 500).then((r) =>
      setRecorded(((r || []) as unknown as Message[]).slice().reverse()),
    );
  }

  // G3: auto-load whenever the toggle flips to Recorded (or the topic changes while on it).
  useEffect(() => {
    if (msgSource === "recorded") loadRecorded();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msgSource, selectedTopic]);

  // Live rows are pushed by the backend for the focused subtree only — no polling.
  const sourceRows: Message[] = msgSource === "recorded" ? recorded : focusMessages;

  // F24: pause freezes the displayed rows at a snapshot; ingestion continues live.
  const snapshotRef = useRef<Message[]>([]);
  const wasPaused = useRef(false);
  if (paused && !wasPaused.current) snapshotRef.current = sourceRows;
  wasPaused.current = paused;
  const baseRows = msgSource === "recorded" ? sourceRows : paused ? snapshotRef.current : sourceRows;

  // F1: once rows exist for a selected topic with nothing selected yet, pick the newest.
  useEffect(() => {
    if (selectedTopic && !selectedMsg && baseRows.length > 0) selectMsg(baseRows[baseRows.length - 1]);
  }, [selectedTopic, selectedMsg, baseRows, selectMsg]);

  // C26/C27/F9: payload search; topic search too when a subtree is selected.
  const q = searchQuery.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return baseRows;
    return baseRows.filter(
      (m) => bytesToString(m.payload).toLowerCase().includes(q) || (!selectedIsLeaf && m.topic.toLowerCase().includes(q)),
    );
  }, [baseRows, q, selectedIsLeaf]);

  // D61: newest-first by default; oldest-first reverses the render order only.
  const displayRows = settings.messageOrder === "oldest" ? filtered : filtered.slice().reverse();

  // B36: the message immediately preceding the current selection in the same topic's
  // (ascending, pre-search) history — used by MessageDetail's Diff mode.
  const prevMsg = useMemo(() => {
    if (!selectedMsg) return null;
    const idx = baseRows.findIndex((m) => m.topic === selectedMsg.topic && m.timestamp === selectedMsg.timestamp);
    if (idx <= 0) return null;
    for (let i = idx - 1; i >= 0; i--) if (baseRows[i].topic === selectedMsg.topic) return baseRows[i];
    return null;
  }, [baseRows, selectedMsg]);

  useNowTick(settings.timestampFormat === "relative"); // F25

  // Rate comes from the backend, so it is no longer bounded by what the UI buffers.
  const shownRate = selectedTopic ? rate.focused : rate.global;

  // A13/B31: search-no-match takes priority, then unselected, then no-messages.
  let emptyIcon = "", emptyTitle = "", emptyHint = "";
  if (q && baseRows.length > 0 && displayRows.length === 0) {
    emptyIcon = "⌕"; emptyTitle = t("searchNoRes"); emptyHint = t("searchNoResHint");
  } else if (!selectedTopic) {
    emptyIcon = "←"; emptyTitle = t("msgSelectTitle"); emptyHint = t("msgSelectHint");
  } else if (msgSource === "recorded") {
    emptyIcon = "◇"; emptyTitle = t("recEmptyTitle"); emptyHint = t("recEmptyHint");
  } else {
    emptyIcon = "◇"; emptyTitle = t("msgEmptyTitle"); emptyHint = t("msgEmptyHint");
  }

  const areaRef = useRef<HTMLDivElement>(null);
  const [rowsHeight, setRowsHeight] = useState(0);
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setRowsHeight(entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="msg-list">
      <div className="msg-toolbar">
        <span className={"toolbar-topic mono" + (selectedTopic || summaryTopic ? " accent" : " dim")}>
          {selectedTopic || summaryTopic || t("headerNone")}
        </span>
        {shownRate > 0 && <span className="msg-rate mono">{shownRate.toFixed(1)} msg/s</span>}
        {dropped > 0 && <span className="msg-drop mono">{t("droppedRows", { n: dropped })}</span>}
        {isRecordable && (
          <>
            <span className="rec-badge">● {t("recBadge")}</span>
            <SegmentedControl
              size="sm"
              options={[
                { value: "live" as const, label: t("srcLive") },
                { value: "recorded" as const, label: t("srcRec") },
              ]}
              value={msgSource}
              onChange={setMsgSource}
            />
          </>
        )}
        <span className="spacer" />
        {selectedTopic && (
          <>
            <button
              className={"msg-tool-btn" + (searchOpen ? " on" : "")}
              title={t("searchTitle")}
              onClick={() => setSearch(!searchOpen)}
            >
              ⌕
            </button>
            {msgSource === "recorded" ? (
              <button className="msg-tool-btn" onClick={loadRecorded}>{t("refresh")}</button>
            ) : (
              <>
                <button className={"msg-tool-btn" + (paused ? " on" : "")} onClick={togglePaused}>
                  {paused ? t("btnResume") : t("btnPause")}
                </button>
                <button className="msg-tool-btn" onClick={clearMessages}>{t("btnClear")}</button>
              </>
            )}
          </>
        )}
      </div>

      {searchOpen && selectedTopic && <SearchBar matches={displayRows.length} total={baseRows.length} />}

      <div className="msg-split">
        <div className="msg-rows-pane" ref={areaRef}>
          {summaryTopic ? (
            <SubtreeSummary topic={summaryTopic} />
          ) : displayRows.length === 0 ? (
            <div className="msg-empty">
              <div className="empty-state">
                <span className="empty-icon">{emptyIcon}</span>
                <div className="empty-title">{emptyTitle}</div>
                <div className="empty-hint">{emptyHint}</div>
              </div>
            </div>
          ) : (
            <FixedSizeList height={rowsHeight || 1} width="100%" itemCount={displayRows.length} itemSize={23}>
              {({ index, style }: { index: number; style: React.CSSProperties }) => {
                const m = displayRows[index];
                const isSel = !!selectedMsg && selectedMsg.topic === m.topic && selectedMsg.timestamp === m.timestamp;
                return (
                  <div style={style} className={"msg-row" + (isSel ? " sel" : "")} onClick={() => selectMsg(m)}>
                    <span className="mr-time">{formatTime(m.timestamp, settings.timestampFormat, settings.lang)}</span>
                    {!selectedIsLeaf && <span className="mr-topic">{m.topic}</span>}
                    <span className="mr-preview">{bytesToString(m.payload).slice(0, 60)}</span>
                    {m.retained && <span className="r-badge" title={t("retainedTip")}>R</span>}
                    <span className="mr-qos" title={t("qosTip")}>q{m.qos}</span>
                  </div>
                );
              }}
            </FixedSizeList>
          )}
        </div>
        {selectedMsg && !summaryTopic && <MessageDetail msg={selectedMsg} prev={prevMsg} rows={baseRows} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 타입체크 확인**

Run: `cd frontend && npx tsc --noEmit`
Expected: `SubtreeSummary` 모듈을 찾을 수 없다는 오류 1건만 남음 (Task 12에서 해소)

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/components/MessageList.tsx
git commit -m "perf(frontend): render only the focused topic's messages

Removes the all-topics firehose, the 20Hz History() polling loop, and the
per-render Date parsing that computed msg/s. Rate now comes from the
backend, so the display is no longer capped at 100 msg/s by the size of
the UI buffer."
```

---

## Task 12: subtree 요약 패널 + 스타일

**Files:**
- Create: `frontend/src/components/SubtreeSummary.tsx`
- Modify: `frontend/src/App.css`

- [ ] **Step 1: 컴포넌트 생성**

`frontend/src/components/SubtreeSummary.tsx`:

```tsx
import { useMemo } from "react";
import { useAppStore } from "../store/appStore";
import { findNode, leafCount, topTopics } from "../lib/subtree";
import { applyFocus } from "../bridge/focus";
import { t } from "../lib/i18n";

const TOP_N = 10;

/**
 * Shown instead of a message stream when the selected node covers more topics
 * than the guard allows. Computed entirely from the tree already in the store,
 * so it costs nothing on the bridge — and it answers the question a firehose
 * could not: which topic is actually busy.
 */
export function SubtreeSummary({ topic }: { topic: string }) {
  const tree = useAppStore((s) => s.tree);
  const rate = useAppStore((s) => s.rate);
  const node = useMemo(() => findNode(tree, topic), [tree, topic]);
  const rows = useMemo(() => (node ? topTopics(node, TOP_N) : []), [node]);

  if (!node) return null;

  return (
    <div className="subtree-summary">
      <div className="ss-head">
        <span className="ss-stat">{t("ssTopics", { n: leafCount(node) })}</span>
        <span className="ss-stat mono">{rate.global.toFixed(1)} msg/s</span>
      </div>
      <div className="ss-hint">{t("ssHint")}</div>
      <div className="ss-list">
        {rows.map((r) => (
          <button key={r.topic} className="ss-row" onClick={() => void applyFocus(r.topic, true, 1)}>
            <span className="ss-count mono">{r.count}</span>
            <span className="ss-name mono">{r.topic}</span>
            <span className="ss-prev mono">{r.preview}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 스타일 추가**

`frontend/src/App.css`의 `.msg-empty` 규칙(294행) 바로 아래에 추가:

```css
.msg-drop { font-size: 10.5px; color: var(--err, #e5534b); font-family: var(--font-mono); white-space: nowrap; flex: none; }

.subtree-summary { height: 100%; overflow-y: auto; padding: 16px 12px; display: flex; flex-direction: column; gap: 10px; }
.ss-head { display: flex; align-items: center; gap: 10px; }
.ss-stat { font-size: 12px; color: var(--dim); }
.ss-hint { font-size: 11.5px; color: var(--faint); line-height: 1.5; }
.ss-list { display: flex; flex-direction: column; gap: 1px; margin-top: 4px; }
.ss-row { display: flex; align-items: center; gap: 8px; width: 100%; padding: 5px 8px; background: none; border: none; border-radius: 4px; cursor: pointer; text-align: left; color: inherit; }
.ss-row:hover { background: var(--hover, rgba(127, 127, 127, 0.12)); }
.ss-count { flex: none; min-width: 44px; text-align: right; font-size: 10.5px; color: var(--dim2); }
.ss-name { flex: none; font-size: 11.5px; color: #6ba0ff; }
.ss-prev { flex: 1; min-width: 0; font-size: 10.5px; color: var(--faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
```

- [ ] **Step 3: 전체 테스트 통과 확인**

Run: `make test`
Expected: PASS — `go vet`/`go test` 무경고, vitest 전체 통과, `tsc --noEmit` 오류 0건

- [ ] **Step 4: 커밋**

```bash
git add frontend/src/components/SubtreeSummary.tsx frontend/src/App.css
git commit -m "feat(frontend): add the subtree summary panel

Clicking a node that covers more topics than the guard allows now lands on
a summary of the busiest topics instead of a dead end, computed from the
tree already in the store."
```

---

## Task 13: 실측 검증과 문서화

수치를 확인하지 않은 성능 작업은 완료가 아니다. 이 태스크는 실제 브로커에 붙어 수용 기준을 검증하고 결과를 스펙에 기록한다.

**Files:**
- Modify: `docs/MANUAL_TESTING.md`
- Modify: `docs/superpowers/specs/2026-07-25-high-volume-performance-design.md` (§7.3 측정치 기록)

- [ ] **Step 1: 브릿지 트래픽 임시 계측 추가**

`app.go`의 `flush` 함수 안, `runtime.EventsEmit(a.ctx, "mqtt:messages", ...)` 바로 위에 임시로 추가:

```go
	// TEMP measurement — remove before committing
	if b, err := json.Marshal(focusBatch{Focus: f, Messages: out, Dropped: dropped}); err == nil {
		log.Printf("bridge msgs: %d bytes (%d messages, %d dropped)", len(b), len(out), dropped)
	}
```

`treeLoop`의 `runtime.EventsEmit(a.ctx, "mqtt:tree", ...)` 바로 위에도 추가:

```go
	// TEMP measurement — remove before committing
	if b, err := json.Marshal(a.store.TreeSnapshot()); err == nil {
		log.Printf("bridge tree: %d bytes", len(b))
	}
```

import에 `"encoding/json"`을 추가한다.

- [ ] **Step 2: 앱을 띄워 측정**

Run: `make dev`

브로커 `localhost:1884`에 연결(MQTT 3.1.1 또는 5.0, 프로필의 host=localhost / port=1884)한 뒤 `#` 구독. 다음을 각각 20초씩 관찰하고 로그를 기록한다:

1. **토픽 미선택 상태** — `bridge msgs:` 로그가 **한 줄도 나오지 않아야 한다**
2. **로봇 노드 선택** (예: `arc/robot/arc-0114911`) — `bridge msgs:` 줄의 바이트 합계
3. **`bridge tree:`** 줄의 바이트 × 초당 발생 횟수

- [ ] **Step 3: 수용 기준 확인**

| 기준 | 확인 방법 |
|---|---|
| 유휴 상태 emit 0건 | 위 1번에서 `bridge msgs:` 로그 없음 |
| 토픽 클릭 → 화면 반영 200ms 이내 | 클릭 후 center에 즉시 행이 채워짐 |
| 트리 스크롤·클릭이 끊기지 않음 | 트리를 위아래로 스크롤, 여러 로봇을 연속 클릭 |
| `arc/robot` 클릭 시 요약 표시 | 스트림이 아니라 상위 발신 토픽 목록이 뜸 |
| 로봇 노드 = 두 토픽 혼합 | `report`와 `bt-blackboard`가 섞여 보이고 각 행에 토픽명 표시 |
| msg/s가 실제값 표시 | 미선택 시 헤더에 ~467 msg/s (기존 100 상한 없음) |

- [ ] **Step 4: 임시 계측 제거**

Step 1에서 넣은 두 블록과 `"encoding/json"` import를 삭제한다.

Run: `go vet ./... && git diff --stat app.go`
Expected: `app.go` 변경 없음 (계측이 완전히 제거됨)

- [ ] **Step 5: 스펙에 측정치 기록**

`docs/superpowers/specs/2026-07-25-high-volume-performance-design.md`의 §7.3 "수용 기준" 마지막 항목을 실제 측정치로 교체:

```markdown
- 브릿지 트래픽 실측 (2026-07-25, localhost:1884 · 104토픽 · 467 msg/s):
  - 변경 전: 트리 132 KB × 20/s = 2.6 MB/s, 메시지 ~370 KB/s
  - 변경 후: 트리 <실측> KB × <실측>/s, 메시지 <실측> KB/s (로봇 1대 선택)
  - 유휴(미선택) 상태 메시지 emit: 0건
```

`<실측>` 자리를 Step 2의 로그 값으로 채운다.

- [ ] **Step 6: 수동 테스트 체크리스트 추가**

`docs/MANUAL_TESTING.md` 끝에 추가:

```markdown
## 대용량 트래픽 (2026-07-25 성능 개선)

고부하 브로커(수백 msg/s 이상)에 연결한 뒤 확인한다.

- [ ] 구독 직후 center가 빈 상태("토픽을 선택하세요")이고, 메시지가 그려지지 않는다
- [ ] 좌측 트리가 접힌 채로 시작한다
- [ ] 필터에 토픽 일부를 입력하면 매칭 결과가 펼쳐진 채로 보인다
- [ ] leaf 토픽을 클릭하면 그 토픽의 메시지만 즉시(200ms 이내) 표시된다
- [ ] leaf 선택 시 행에 토픽 컬럼이 없다
- [ ] 하위 토픽이 20개 이하인 중간 노드를 클릭하면 하위 토픽들이 시간순으로 섞여 표시되고, 각 행에 토픽명이 보인다
- [ ] 하위 토픽이 20개를 넘는 노드를 클릭하면 스트림 대신 요약 패널이 뜬다
- [ ] 요약 패널의 토픽 행을 클릭하면 그 토픽 스트리밍으로 넘어간다
- [ ] 헤더 msg/s가 100을 넘어 실제 값으로 표시된다
- [ ] 토픽을 빠르게 여러 번 바꿔도 이전 토픽의 메시지가 섞이지 않는다
- [ ] Pause 중 다른 토픽을 선택하면 Pause가 해제된다
- [ ] 연결 해제 후 재연결하면 선택과 메시지가 초기화된다
- [ ] 트리를 빠르게 스크롤해도 끊김이 없다
```

- [ ] **Step 7: 전체 테스트 재확인**

Run: `make test`
Expected: PASS

- [ ] **Step 8: 커밋**

```bash
git add docs/
git commit -m "docs: record measured bridge traffic and add high-volume test checklist"
```

---

## 완료 후

1. `git log --oneline main..HEAD`로 13개 커밋 확인
2. PR 생성 (글로벌 정책: `gh pr create` + HEREDOC, `--reviewer` 사용 금지)
3. **후속 이슈 등록** — 스펙 §8의 재연결 버그(`app.go`의 cancel/Disconnect 순서). 본 작업 범위 밖이며 systematic-debugging으로 재현 절차부터 세울 것
