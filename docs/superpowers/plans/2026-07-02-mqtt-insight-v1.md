# mqtt-insight v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** IoT/임베디드 개발자를 위한 단일 연결 MQTT 디버깅 클라이언트(Wails v2 데스크톱 앱)를 만든다 — 토픽 트리 탐색, 메시지 히스토리 확인, 발행.

**Architecture:** Go 백엔드가 MQTT 연결·토픽 트리·링버퍼를 소유(진실의 원천)하고, 수신 메시지를 50ms 배치로 묶어 Wails 이벤트로 React 프론트엔드에 emit한다. 프론트엔드는 Wails 바인딩으로 연결/구독/발행 명령을 호출한다. MQTT 3.1.1/5.0은 `MQTTClient` 인터페이스로 추상화해 버전별 구현체를 스왑한다.

**Tech Stack:** Wails v2.11 · Go 1.26 · React + TypeScript + Vite · Zustand · react-arborist · react-window · eclipse/paho.mqtt.golang(v3) · eclipse/paho.golang(v5) · modernc.org/sqlite

---

## File Structure

**Go 백엔드** (모듈: `github.com/kenshin579/mqtt-insight`)
- `main.go` — Wails 진입점, 프론트엔드 embed, Bind.
- `app.go` — `App` 구조체, startup/shutdown, 프론트엔드에 노출하는 바인딩 메서드, 배치 이벤트 브리지.
- `internal/mqtt/message.go` — 버전 무관 공통 `Message` 타입.
- `internal/mqtt/client.go` — `MQTTClient` 인터페이스, `ConnectionConfig`, 콜백 타입.
- `internal/mqtt/v3.go` — paho.mqtt.golang 기반 3.1.1 구현체.
- `internal/mqtt/v5.go` — paho.golang/autopaho 기반 5.0 구현체.
- `internal/store/tree.go` — 스레드 안전 토픽 트리.
- `internal/store/ringbuffer.go` — 토픽별 링버퍼.
- `internal/store/store.go` — `MessageStore` 인터페이스 + 인메모리 구현.
- `internal/store/sqlite.go` — 선택적 SQLite 기록 구현.
- `internal/config/config.go` — 프로필/설정 JSON 로드·저장.
- `internal/config/paths.go` — OS별 앱 데이터 디렉터리 결정.

**React 프론트엔드** (`frontend/src/`)
- `App.tsx` — 3-pane 레이아웃.
- `store/appStore.ts` — Zustand 스토어(연결 상태, 트리 스냅샷, 선택 토픽).
- `bridge/events.ts` — Wails 이벤트 구독 → 스토어 반영.
- `lib/payload.ts` — payload 포맷 자동감지·변환 유틸.
- `components/ConnectionBar.tsx`, `ConnectionForm.tsx`, `TopicTree.tsx`, `MessageList.tsx`, `MessageDetail.tsx`, `PublishPanel.tsx`, `SettingsModal.tsx`.

---

## Phase 0 — 프로젝트 스캐폴딩

### Task 0: Wails 프로젝트 초기화

**Files:**
- Create: 전체 Wails react-ts 스캐폴드 (`main.go`, `app.go`, `frontend/`, `wails.json`, `go.mod`)

- [ ] **Step 1: Wails 프로젝트를 임시 폴더에 생성 후 현재 저장소로 병합**

기존 저장소(README/docs/.gitignore)를 보존하기 위해 임시 위치에 생성한 뒤 파일만 옮긴다.

```bash
cd /Users/user/GolandProjects
wails init -n mqtt-insight-scaffold -t react-ts
# 생성된 파일을 기존 저장소로 복사 (이미 있는 .gitignore/README/docs는 덮어쓰지 않음)
rsync -av --exclude='.git' --ignore-existing mqtt-insight-scaffold/ mqtt-insight/
rm -rf mqtt-insight-scaffold
```

- [ ] **Step 2: go.mod 모듈 경로 확인/수정**

`go.mod`의 module 라인을 저장소에 맞춘다.

```bash
cd /Users/user/GolandProjects/mqtt-insight
go mod edit -module github.com/kenshin579/mqtt-insight
```

- [ ] **Step 3: 빌드 도구 동작 확인 (dev 아님, 컴파일만)**

Run: `cd /Users/user/GolandProjects/mqtt-insight && wails build -clean -s`
Expected: 빌드 성공, `build/bin/` 아래 바이너리 생성. (`-s`는 프론트엔드 설치 스킵 없이 정상 빌드 확인용; 실패 시 `frontend/` 에서 `npm install` 먼저)

- [ ] **Step 4: 추가 의존성 설치**

```bash
cd /Users/user/GolandProjects/mqtt-insight
go get github.com/eclipse/paho.mqtt.golang
go get github.com/eclipse/paho.golang/autopaho
go get github.com/eclipse/paho.golang/paho
go get modernc.org/sqlite
go mod tidy
cd frontend && npm install zustand react-arborist react-window && npm install -D @types/react-window
```

- [ ] **Step 5: Commit**

```bash
cd /Users/user/GolandProjects/mqtt-insight
git add -A
git commit -m "chore: scaffold Wails v2 react-ts project with dependencies"
```

---

## Phase 1 — 백엔드 코어 (TDD)

### Task 1: 공통 Message 타입

**Files:**
- Create: `internal/mqtt/message.go`
- Test: `internal/mqtt/message_test.go`

- [ ] **Step 1: 실패하는 테스트 작성**

```go
package mqtt

import "testing"

func TestMessageSizeBytes(t *testing.T) {
	m := Message{Topic: "a/b", Payload: []byte("hello")}
	if m.SizeBytes() != 5 {
		t.Fatalf("want 5, got %d", m.SizeBytes())
	}
}
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `go test ./internal/mqtt/ -run TestMessageSizeBytes -v`
Expected: FAIL — `undefined: Message`

- [ ] **Step 3: 최소 구현**

```go
package mqtt

import "time"

// UserProperty is an MQTT 5.0 user property key/value pair.
type UserProperty struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

// Message is a version-agnostic representation of a received or published MQTT message.
type Message struct {
	Topic       string         `json:"topic"`
	Payload     []byte         `json:"payload"`
	QoS         byte           `json:"qos"`
	Retained    bool           `json:"retained"`
	Timestamp   time.Time      `json:"timestamp"`
	ContentType string         `json:"contentType,omitempty"` // v5
	UserProps   []UserProperty `json:"userProps,omitempty"`   // v5
}

// SizeBytes returns the payload size in bytes.
func (m Message) SizeBytes() int { return len(m.Payload) }
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `go test ./internal/mqtt/ -run TestMessageSizeBytes -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/mqtt/message.go internal/mqtt/message_test.go
git commit -m "feat: add version-agnostic MQTT Message type"
```

---

### Task 2: 토픽 트리

**Files:**
- Create: `internal/store/tree.go`
- Test: `internal/store/tree_test.go`

- [ ] **Step 1: 실패하는 테스트 작성**

```go
package store

import (
	"testing"
	"time"

	"github.com/kenshin579/mqtt-insight/internal/mqtt"
)

func TestTreeInsertBuildsHierarchy(t *testing.T) {
	tr := NewTree()
	tr.Insert(mqtt.Message{Topic: "sensors/room1/temp", Payload: []byte("23.4"), Timestamp: time.Unix(1, 0)})
	tr.Insert(mqtt.Message{Topic: "sensors/room1/humid", Payload: []byte("61"), Timestamp: time.Unix(2, 0)})

	root := tr.Snapshot()
	sensors := findChild(root, "sensors")
	if sensors == nil {
		t.Fatal("expected 'sensors' node")
	}
	room1 := findChild(sensors, "room1")
	if room1 == nil || len(room1.Children) != 2 {
		t.Fatalf("expected room1 with 2 children, got %+v", room1)
	}
}

func TestTreeInsertUpdatesLeafStats(t *testing.T) {
	tr := NewTree()
	tr.Insert(mqtt.Message{Topic: "a/b", Payload: []byte("1"), Timestamp: time.Unix(1, 0)})
	tr.Insert(mqtt.Message{Topic: "a/b", Payload: []byte("2"), Timestamp: time.Unix(2, 0)})

	root := tr.Snapshot()
	leaf := findChild(findChild(root, "a"), "b")
	if leaf.MessageCount != 2 {
		t.Fatalf("want count 2, got %d", leaf.MessageCount)
	}
	if string(leaf.LastPayload) != "2" {
		t.Fatalf("want last payload 2, got %s", leaf.LastPayload)
	}
}

func findChild(n *Node, name string) *Node {
	if n == nil {
		return nil
	}
	for _, c := range n.Children {
		if c.Name == name {
			return c
		}
	}
	return nil
}
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `go test ./internal/store/ -run TestTree -v`
Expected: FAIL — `undefined: NewTree`

- [ ] **Step 3: 최소 구현**

```go
package store

import (
	"strings"
	"sync"
	"time"

	"github.com/kenshin579/mqtt-insight/internal/mqtt"
)

// Node is one segment of the topic hierarchy. Leaf nodes carry the latest stats.
type Node struct {
	Name         string    `json:"name"`
	FullTopic    string    `json:"fullTopic"`
	Children     []*Node   `json:"children,omitempty"`
	MessageCount int       `json:"messageCount"`
	LastPayload  []byte    `json:"lastPayload,omitempty"`
	LastSeen     time.Time `json:"lastSeen"`
	Retained     bool      `json:"retained"`

	childIndex map[string]*Node // internal, not serialized
}

// Tree is a thread-safe aggregating topic tree.
type Tree struct {
	mu   sync.RWMutex
	root *Node
}

// NewTree creates an empty topic tree.
func NewTree() *Tree {
	return &Tree{root: &Node{Name: "", childIndex: map[string]*Node{}}}
}

// Insert adds/updates the tree with a received message.
func (t *Tree) Insert(m mqtt.Message) {
	t.mu.Lock()
	defer t.mu.Unlock()

	segments := strings.Split(m.Topic, "/")
	cur := t.root
	var full strings.Builder
	for i, seg := range segments {
		if i > 0 {
			full.WriteByte('/')
		}
		full.WriteString(seg)
		child, ok := cur.childIndex[seg]
		if !ok {
			child = &Node{Name: seg, FullTopic: full.String(), childIndex: map[string]*Node{}}
			cur.childIndex[seg] = child
			cur.Children = append(cur.Children, child)
		}
		cur = child
	}
	// cur is the leaf for this topic
	cur.MessageCount++
	cur.LastPayload = m.Payload
	cur.LastSeen = m.Timestamp
	cur.Retained = m.Retained
}

// Snapshot returns a deep copy of the tree safe to serialize/send to the frontend.
func (t *Tree) Snapshot() *Node {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return copyNode(t.root)
}

func copyNode(n *Node) *Node {
	cp := &Node{
		Name: n.Name, FullTopic: n.FullTopic, MessageCount: n.MessageCount,
		LastPayload: n.LastPayload, LastSeen: n.LastSeen, Retained: n.Retained,
	}
	for _, c := range n.Children {
		cp.Children = append(cp.Children, copyNode(c))
	}
	return cp
}

// Clear resets the tree.
func (t *Tree) Clear() {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.root = &Node{Name: "", childIndex: map[string]*Node{}}
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `go test ./internal/store/ -run TestTree -v`
Expected: PASS (both tests)

- [ ] **Step 5: Commit**

```bash
git add internal/store/tree.go internal/store/tree_test.go
git commit -m "feat: add thread-safe aggregating topic tree"
```

---

### Task 3: 토픽별 링버퍼

**Files:**
- Create: `internal/store/ringbuffer.go`
- Test: `internal/store/ringbuffer_test.go`

- [ ] **Step 1: 실패하는 테스트 작성**

```go
package store

import (
	"testing"
	"time"

	"github.com/kenshin579/mqtt-insight/internal/mqtt"
)

func TestRingBufferKeepsLastN(t *testing.T) {
	rb := NewRingBuffer(3)
	for i := 0; i < 5; i++ {
		rb.Append("a/b", mqtt.Message{Topic: "a/b", Payload: []byte{byte('0' + i)}, Timestamp: time.Unix(int64(i), 0)})
	}
	got := rb.Get("a/b")
	if len(got) != 3 {
		t.Fatalf("want 3 messages, got %d", len(got))
	}
	// oldest kept should be '2', newest '4' (FIFO eviction)
	if string(got[0].Payload) != "2" || string(got[2].Payload) != "4" {
		t.Fatalf("unexpected order: %s..%s", got[0].Payload, got[2].Payload)
	}
}

func TestRingBufferPerTopicIsolation(t *testing.T) {
	rb := NewRingBuffer(10)
	rb.Append("a", mqtt.Message{Topic: "a"})
	rb.Append("b", mqtt.Message{Topic: "b"})
	if len(rb.Get("a")) != 1 || len(rb.Get("b")) != 1 {
		t.Fatal("topics must not share buffers")
	}
	if len(rb.Get("missing")) != 0 {
		t.Fatal("unknown topic must return empty slice")
	}
}
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `go test ./internal/store/ -run TestRingBuffer -v`
Expected: FAIL — `undefined: NewRingBuffer`

- [ ] **Step 3: 최소 구현**

```go
package store

import (
	"sync"

	"github.com/kenshin579/mqtt-insight/internal/mqtt"
)

// RingBuffer keeps the last N messages per topic in memory.
type RingBuffer struct {
	mu       sync.RWMutex
	capacity int
	byTopic  map[string][]mqtt.Message
}

// NewRingBuffer creates a per-topic ring buffer keeping `capacity` messages each.
func NewRingBuffer(capacity int) *RingBuffer {
	if capacity < 1 {
		capacity = 1
	}
	return &RingBuffer{capacity: capacity, byTopic: map[string][]mqtt.Message{}}
}

// Append stores a message for a topic, evicting the oldest when over capacity.
func (r *RingBuffer) Append(topic string, m mqtt.Message) {
	r.mu.Lock()
	defer r.mu.Unlock()
	buf := append(r.byTopic[topic], m)
	if len(buf) > r.capacity {
		buf = buf[len(buf)-r.capacity:]
	}
	r.byTopic[topic] = buf
}

// Get returns a copy of the stored messages for a topic (nil-safe).
func (r *RingBuffer) Get(topic string) []mqtt.Message {
	r.mu.RLock()
	defer r.mu.RUnlock()
	src := r.byTopic[topic]
	out := make([]mqtt.Message, len(src))
	copy(out, src)
	return out
}

// Clear removes all buffered messages.
func (r *RingBuffer) Clear() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.byTopic = map[string][]mqtt.Message{}
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `go test ./internal/store/ -run TestRingBuffer -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/store/ringbuffer.go internal/store/ringbuffer_test.go
git commit -m "feat: add per-topic ring buffer for message history"
```

---

### Task 4: MessageStore 인터페이스 + 인메모리 구현

**Files:**
- Create: `internal/store/store.go`
- Test: `internal/store/store_test.go`

- [ ] **Step 1: 실패하는 테스트 작성**

```go
package store

import (
	"testing"
	"time"

	"github.com/kenshin579/mqtt-insight/internal/mqtt"
)

func TestMemoryStoreRecordUpdatesTreeAndBuffer(t *testing.T) {
	s := NewMemoryStore(5)
	s.Record(mqtt.Message{Topic: "a/b", Payload: []byte("x"), Timestamp: time.Unix(1, 0)})

	if got := s.History("a/b"); len(got) != 1 {
		t.Fatalf("want 1 history entry, got %d", len(got))
	}
	if s.TreeSnapshot() == nil || len(s.TreeSnapshot().Children) != 1 {
		t.Fatal("tree should have one top-level node")
	}
}
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `go test ./internal/store/ -run TestMemoryStore -v`
Expected: FAIL — `undefined: NewMemoryStore`

- [ ] **Step 3: 최소 구현**

```go
package store

import "github.com/kenshin579/mqtt-insight/internal/mqtt"

// MessageStore is the abstraction the app depends on. Swappable for v2 persistence.
type MessageStore interface {
	Record(m mqtt.Message)
	History(topic string) []mqtt.Message
	TreeSnapshot() *Node
	Clear()
}

// MemoryStore is the v1 in-memory implementation: tree + ring buffer.
type MemoryStore struct {
	tree *Tree
	ring *RingBuffer
}

// NewMemoryStore creates an in-memory store keeping `perTopic` messages per topic.
func NewMemoryStore(perTopic int) *MemoryStore {
	return &MemoryStore{tree: NewTree(), ring: NewRingBuffer(perTopic)}
}

func (s *MemoryStore) Record(m mqtt.Message) {
	s.tree.Insert(m)
	s.ring.Append(m.Topic, m)
}

func (s *MemoryStore) History(topic string) []mqtt.Message { return s.ring.Get(topic) }
func (s *MemoryStore) TreeSnapshot() *Node                 { return s.tree.Snapshot() }

func (s *MemoryStore) Clear() {
	s.tree.Clear()
	s.ring.Clear()
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `go test ./internal/store/ -run TestMemoryStore -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/store/store.go internal/store/store_test.go
git commit -m "feat: add MessageStore interface with in-memory implementation"
```

---

### Task 5: 설정/프로필 영속화

**Files:**
- Create: `internal/config/paths.go`, `internal/config/config.go`
- Test: `internal/config/config_test.go`

- [ ] **Step 1: 실패하는 테스트 작성**

```go
package config

import (
	"path/filepath"
	"testing"
)

func TestSaveLoadRoundTrip(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.json")

	in := &Config{
		Settings: Settings{Theme: "dark", RingBufferSize: 500, DefaultFormat: "json"},
		Profiles: []Profile{{
			Name: "local", Host: "localhost", Port: 1883,
			Transport: "tcp", Version: "5.0", ClientID: "c1",
		}},
	}
	if err := Save(path, in); err != nil {
		t.Fatalf("save: %v", err)
	}
	out, err := Load(path)
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if len(out.Profiles) != 1 || out.Profiles[0].Host != "localhost" {
		t.Fatalf("profile not round-tripped: %+v", out.Profiles)
	}
	if out.Settings.Theme != "dark" {
		t.Fatalf("settings not round-tripped: %+v", out.Settings)
	}
}

func TestLoadMissingReturnsDefaults(t *testing.T) {
	out, err := Load(filepath.Join(t.TempDir(), "nope.json"))
	if err != nil {
		t.Fatalf("missing file should not error: %v", err)
	}
	if out.Settings.RingBufferSize == 0 {
		t.Fatal("expected default ring buffer size")
	}
}
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `go test ./internal/config/ -v`
Expected: FAIL — `undefined: Config`

- [ ] **Step 3: paths.go 구현**

```go
package config

import (
	"os"
	"path/filepath"
)

// AppConfigPath returns the OS-appropriate config file path, creating the dir.
func AppConfigPath() (string, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(base, "mqtt-insight")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	return filepath.Join(dir, "config.json"), nil
}
```

- [ ] **Step 4: config.go 구현**

```go
package config

import (
	"encoding/json"
	"errors"
	"os"
)

// Profile is a saved broker connection profile.
type Profile struct {
	Name         string `json:"name"`
	Host         string `json:"host"`
	Port         int    `json:"port"`
	Transport    string `json:"transport"` // tcp | tls | ws | wss
	Version      string `json:"version"`   // 3.1.1 | 5.0
	ClientID     string `json:"clientId"`
	Username     string `json:"username"`
	Password     string `json:"password"`
	KeepAlive    int    `json:"keepAlive"`    // seconds
	CleanSession bool   `json:"cleanSession"`
	AutoReconnect bool  `json:"autoReconnect"`
	CACertPath   string `json:"caCertPath"`
	UseSystemCAs bool   `json:"useSystemCAs"`
	SkipVerify   bool   `json:"skipVerify"`
	WSPath       string `json:"wsPath"` // for ws/wss, e.g. /mqtt
	WillTopic    string `json:"willTopic"`
	WillPayload  string `json:"willPayload"`
	WillQoS      byte   `json:"willQos"`
	WillRetained bool   `json:"willRetained"`
}

// Settings holds app-wide preferences.
type Settings struct {
	Theme          string `json:"theme"`          // dark | light
	RingBufferSize int    `json:"ringBufferSize"` // per-topic message cap
	DefaultFormat  string `json:"defaultFormat"`  // plain | json | hex | base64
}

// Config is the whole persisted document.
type Config struct {
	Settings Settings  `json:"settings"`
	Profiles []Profile `json:"profiles"`
}

func defaults() *Config {
	return &Config{Settings: Settings{Theme: "dark", RingBufferSize: 200, DefaultFormat: "plain"}}
}

// Load reads config from path, returning defaults if the file is absent.
func Load(path string) (*Config, error) {
	b, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return defaults(), nil
	}
	if err != nil {
		return nil, err
	}
	cfg := defaults()
	if err := json.Unmarshal(b, cfg); err != nil {
		return nil, err
	}
	return cfg, nil
}

// Save writes config to path as indented JSON.
func Save(path string, cfg *Config) error {
	b, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, b, 0o600)
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `go test ./internal/config/ -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add internal/config/
git commit -m "feat: add config/profile persistence with OS-appropriate paths"
```

---

## Phase 2 — MQTT 클라이언트 추상화

### Task 6: MQTTClient 인터페이스 + 연결 설정 타입

**Files:**
- Create: `internal/mqtt/client.go`
- Test: `internal/mqtt/client_test.go`

- [ ] **Step 1: 실패하는 테스트 작성 (URL 빌더 검증)**

```go
package mqtt

import "testing"

func TestBrokerURL(t *testing.T) {
	cases := []struct {
		cfg  ConnectionConfig
		want string
	}{
		{ConnectionConfig{Host: "h", Port: 1883, Transport: "tcp"}, "tcp://h:1883"},
		{ConnectionConfig{Host: "h", Port: 8883, Transport: "tls"}, "ssl://h:8883"},
		{ConnectionConfig{Host: "h", Port: 8080, Transport: "ws", WSPath: "/mqtt"}, "ws://h:8080/mqtt"},
		{ConnectionConfig{Host: "h", Port: 443, Transport: "wss", WSPath: "/mqtt"}, "wss://h:443/mqtt"},
	}
	for _, c := range cases {
		if got := c.cfg.BrokerURL(); got != c.want {
			t.Errorf("BrokerURL()=%q want %q", got, c.want)
		}
	}
}
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `go test ./internal/mqtt/ -run TestBrokerURL -v`
Expected: FAIL — `undefined: ConnectionConfig`

- [ ] **Step 3: 최소 구현**

```go
package mqtt

import (
	"context"
	"fmt"
)

// ConnectionConfig is the version-agnostic connection input.
type ConnectionConfig struct {
	Host          string
	Port          int
	Transport     string // tcp | tls | ws | wss
	Version       string // 3.1.1 | 5.0
	ClientID      string
	Username      string
	Password      string
	KeepAlive     int
	CleanSession  bool
	AutoReconnect bool
	CACertPath    string
	UseSystemCAs  bool
	SkipVerify    bool
	WSPath        string
	WillTopic     string
	WillPayload   string
	WillQoS       byte
	WillRetained  bool
}

// BrokerURL builds the scheme://host:port[/path] URL from the config.
func (c ConnectionConfig) BrokerURL() string {
	scheme := map[string]string{"tcp": "tcp", "tls": "ssl", "ws": "ws", "wss": "wss"}[c.Transport]
	url := fmt.Sprintf("%s://%s:%d", scheme, c.Host, c.Port)
	if (c.Transport == "ws" || c.Transport == "wss") && c.WSPath != "" {
		url += c.WSPath
	}
	return url
}

// Subscription describes one topic subscription.
type Subscription struct {
	Topic string
	QoS   byte
}

// Callbacks are event hooks the client invokes.
type Callbacks struct {
	OnMessage      func(Message)
	OnConnect      func()
	OnConnectionLost func(error)
}

// MQTTClient abstracts a version-specific MQTT connection.
type MQTTClient interface {
	Connect(ctx context.Context, cfg ConnectionConfig, cb Callbacks) error
	Subscribe(sub Subscription) error
	Unsubscribe(topic string) error
	Publish(m Message) error
	Disconnect() error
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `go test ./internal/mqtt/ -run TestBrokerURL -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/mqtt/client.go internal/mqtt/client_test.go
git commit -m "feat: add MQTTClient interface and connection config"
```

---

### Task 7: TLS 설정 헬퍼

**Files:**
- Create: `internal/mqtt/tlsconfig.go`
- Test: `internal/mqtt/tlsconfig_test.go`

- [ ] **Step 1: 실패하는 테스트 작성**

```go
package mqtt

import "testing"

func TestBuildTLSConfigSkipVerify(t *testing.T) {
	cfg := ConnectionConfig{SkipVerify: true, UseSystemCAs: true}
	tc, err := BuildTLSConfig(cfg)
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if !tc.InsecureSkipVerify {
		t.Fatal("expected InsecureSkipVerify true")
	}
}

func TestBuildTLSConfigBadCAPath(t *testing.T) {
	cfg := ConnectionConfig{CACertPath: "/no/such/ca.pem"}
	if _, err := BuildTLSConfig(cfg); err == nil {
		t.Fatal("expected error for missing CA file")
	}
}
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `go test ./internal/mqtt/ -run TestBuildTLS -v`
Expected: FAIL — `undefined: BuildTLSConfig`

- [ ] **Step 3: 최소 구현**

```go
package mqtt

import (
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"os"
)

// BuildTLSConfig constructs a *tls.Config from the connection config.
// Returns nil (no error) when the transport is not TLS-based.
func BuildTLSConfig(c ConnectionConfig) (*tls.Config, error) {
	if c.Transport != "tls" && c.Transport != "wss" {
		return nil, nil
	}
	tc := &tls.Config{InsecureSkipVerify: c.SkipVerify}

	var pool *x509.CertPool
	if c.UseSystemCAs {
		if p, err := x509.SystemCertPool(); err == nil && p != nil {
			pool = p
		}
	}
	if c.CACertPath != "" {
		pem, err := os.ReadFile(c.CACertPath)
		if err != nil {
			return nil, fmt.Errorf("read CA cert: %w", err)
		}
		if pool == nil {
			pool = x509.NewCertPool()
		}
		if !pool.AppendCertsFromPEM(pem) {
			return nil, fmt.Errorf("failed to parse CA cert %q", c.CACertPath)
		}
	}
	tc.RootCAs = pool
	return tc, nil
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `go test ./internal/mqtt/ -run TestBuildTLS -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/mqtt/tlsconfig.go internal/mqtt/tlsconfig_test.go
git commit -m "feat: add TLS config builder for MQTT connections"
```

---

### Task 8: MQTT 3.1.1 구현체 (paho.mqtt.golang)

**Files:**
- Create: `internal/mqtt/v3.go`

> 실제 브로커 통합 테스트는 Task 10에서 다룬다. 이 태스크는 컴파일과 인터페이스 만족에 집중.

- [ ] **Step 1: 구현 작성**

```go
package mqtt

import (
	"context"
	"fmt"
	"time"

	paho3 "github.com/eclipse/paho.mqtt.golang"
)

// v3Client implements MQTTClient over MQTT 3.1.1.
type v3Client struct {
	client paho3.Client
	cb     Callbacks
}

func newV3Client() *v3Client { return &v3Client{} }

func (v *v3Client) Connect(ctx context.Context, cfg ConnectionConfig, cb Callbacks) error {
	v.cb = cb
	opts := paho3.NewClientOptions()
	opts.AddBroker(cfg.BrokerURL())
	opts.SetClientID(cfg.ClientID)
	opts.SetUsername(cfg.Username)
	opts.SetPassword(cfg.Password)
	opts.SetKeepAlive(time.Duration(cfg.KeepAlive) * time.Second)
	opts.SetCleanSession(cfg.CleanSession)
	opts.SetAutoReconnect(cfg.AutoReconnect)
	opts.SetConnectTimeout(30 * time.Second)

	tc, err := BuildTLSConfig(cfg)
	if err != nil {
		return err
	}
	if tc != nil {
		opts.SetTLSConfig(tc)
	}
	if cfg.WillTopic != "" {
		opts.SetWill(cfg.WillTopic, cfg.WillPayload, cfg.WillQoS, cfg.WillRetained)
	}
	opts.SetOnConnectHandler(func(paho3.Client) {
		if v.cb.OnConnect != nil {
			v.cb.OnConnect()
		}
	})
	opts.SetConnectionLostHandler(func(_ paho3.Client, err error) {
		if v.cb.OnConnectionLost != nil {
			v.cb.OnConnectionLost(err)
		}
	})

	v.client = paho3.NewClient(opts)
	t := v.client.Connect()
	if !t.WaitTimeout(30 * time.Second) {
		return fmt.Errorf("connect timeout")
	}
	return t.Error()
}

func (v *v3Client) Subscribe(sub Subscription) error {
	t := v.client.Subscribe(sub.Topic, sub.QoS, func(_ paho3.Client, m paho3.Message) {
		if v.cb.OnMessage != nil {
			v.cb.OnMessage(Message{
				Topic: m.Topic(), Payload: m.Payload(), QoS: m.Qos(),
				Retained: m.Retained(), Timestamp: time.Now(),
			})
		}
	})
	t.Wait()
	return t.Error()
}

func (v *v3Client) Unsubscribe(topic string) error {
	t := v.client.Unsubscribe(topic)
	t.Wait()
	return t.Error()
}

func (v *v3Client) Publish(m Message) error {
	t := v.client.Publish(m.Topic, m.QoS, m.Retained, m.Payload)
	t.Wait()
	return t.Error()
}

func (v *v3Client) Disconnect() error {
	if v.client != nil && v.client.IsConnected() {
		v.client.Disconnect(250)
	}
	return nil
}
```

- [ ] **Step 2: 컴파일 확인**

Run: `go build ./internal/mqtt/`
Expected: 성공 (에러 없음)

- [ ] **Step 3: Commit**

```bash
git add internal/mqtt/v3.go
git commit -m "feat: add MQTT 3.1.1 client implementation"
```

---

### Task 9: MQTT 5.0 구현체 (paho.golang/autopaho)

**Files:**
- Create: `internal/mqtt/v5.go`

- [ ] **Step 1: 구현 작성**

```go
package mqtt

import (
	"context"
	"fmt"
	"net/url"
	"sync"
	"time"

	"github.com/eclipse/paho.golang/autopaho"
	"github.com/eclipse/paho.golang/paho"
)

// v5Client implements MQTTClient over MQTT 5.0 using autopaho.
type v5Client struct {
	cm     *autopaho.ConnectionManager
	cb     Callbacks
	ctx    context.Context
	mu     sync.Mutex
	subs   []Subscription // remembered so OnConnectionUp can re-apply
}

func newV5Client() *v5Client { return &v5Client{} }

func (v *v5Client) Connect(ctx context.Context, cfg ConnectionConfig, cb Callbacks) error {
	v.cb = cb
	v.ctx = ctx

	u, err := url.Parse(cfg.BrokerURL())
	if err != nil {
		return fmt.Errorf("parse url: %w", err)
	}
	tc, err := BuildTLSConfig(cfg)
	if err != nil {
		return err
	}

	acfg := autopaho.ClientConfig{
		ServerUrls:                    []*url.URL{u},
		KeepAlive:                     uint16(cfg.KeepAlive),
		CleanStartOnInitialConnection: cfg.CleanSession,
		TlsCfg:                        tc,
		OnConnectionUp: func(cm *autopaho.ConnectionManager, _ *paho.Connack) {
			if v.cb.OnConnect != nil {
				v.cb.OnConnect()
			}
			v.mu.Lock()
			subs := append([]Subscription(nil), v.subs...)
			v.mu.Unlock()
			for _, s := range subs {
				_, _ = cm.Subscribe(ctx, &paho.Subscribe{
					Subscriptions: []paho.SubscribeOptions{{Topic: s.Topic, QoS: s.QoS}},
				})
			}
		},
		OnConnectError: func(err error) {
			if v.cb.OnConnectionLost != nil {
				v.cb.OnConnectionLost(err)
			}
		},
		ClientConfig: paho.ClientConfig{
			ClientID: cfg.ClientID,
			OnClientError: func(err error) {
				if v.cb.OnConnectionLost != nil {
					v.cb.OnConnectionLost(err)
				}
			},
			OnPublishReceived: []func(paho.PublishReceived) (bool, error){
				func(pr paho.PublishReceived) (bool, error) {
					p := pr.Packet
					msg := Message{
						Topic: p.Topic, Payload: p.Payload, QoS: p.QoS,
						Retained: p.Retain, Timestamp: time.Now(),
					}
					if p.Properties != nil {
						msg.ContentType = p.Properties.ContentType
						for _, up := range p.Properties.User {
							msg.UserProps = append(msg.UserProps, UserProperty{Key: up.Key, Value: up.Value})
						}
					}
					if v.cb.OnMessage != nil {
						v.cb.OnMessage(msg)
					}
					return true, nil
				},
			},
		},
	}
	if cfg.Username != "" {
		acfg.ConnectUsername = cfg.Username
		acfg.ConnectPassword = []byte(cfg.Password)
	}

	cm, err := autopaho.NewConnection(ctx, acfg)
	if err != nil {
		return err
	}
	v.cm = cm
	connCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	return cm.AwaitConnection(connCtx)
}

func (v *v5Client) Subscribe(sub Subscription) error {
	v.mu.Lock()
	v.subs = append(v.subs, sub)
	v.mu.Unlock()
	_, err := v.cm.Subscribe(v.ctx, &paho.Subscribe{
		Subscriptions: []paho.SubscribeOptions{{Topic: sub.Topic, QoS: sub.QoS}},
	})
	return err
}

func (v *v5Client) Unsubscribe(topic string) error {
	v.mu.Lock()
	for i, s := range v.subs {
		if s.Topic == topic {
			v.subs = append(v.subs[:i], v.subs[i+1:]...)
			break
		}
	}
	v.mu.Unlock()
	_, err := v.cm.Unsubscribe(v.ctx, &paho.Unsubscribe{Topics: []string{topic}})
	return err
}

func (v *v5Client) Publish(m Message) error {
	pub := &paho.Publish{Topic: m.Topic, QoS: m.QoS, Retain: m.Retained, Payload: m.Payload}
	if m.ContentType != "" || len(m.UserProps) > 0 {
		props := &paho.PublishProperties{ContentType: m.ContentType}
		for _, up := range m.UserProps {
			props.User = append(props.User, paho.UserProperty{Key: up.Key, Value: up.Value})
		}
		pub.Properties = props
	}
	_, err := v.cm.Publish(v.ctx, pub)
	return err
}

func (v *v5Client) Disconnect() error {
	if v.cm != nil {
		return v.cm.Disconnect(context.Background())
	}
	return nil
}
```

- [ ] **Step 2: 팩토리 함수 추가 (client.go에 append)**

`internal/mqtt/client.go` 끝에 추가:

```go
// New returns a version-specific client. Defaults to 5.0 for unknown versions.
func New(version string) MQTTClient {
	if version == "3.1.1" {
		return newV3Client()
	}
	return newV5Client()
}
```

- [ ] **Step 3: 컴파일 확인**

Run: `go build ./internal/mqtt/`
Expected: 성공

- [ ] **Step 4: Commit**

```bash
git add internal/mqtt/v5.go internal/mqtt/client.go
git commit -m "feat: add MQTT 5.0 client implementation and version factory"
```

---

### Task 10: 통합 테스트 (로컬 Mosquitto)

**Files:**
- Create: `internal/mqtt/integration_test.go`

- [ ] **Step 1: 통합 테스트 작성 (빌드 태그로 분리)**

```go
//go:build integration

package mqtt

import (
	"context"
	"testing"
	"time"
)

// Requires a broker at localhost:1883. Run: go test -tags=integration ./internal/mqtt/
func TestPubSubRoundTrip(t *testing.T) {
	for _, version := range []string{"3.1.1", "5.0"} {
		t.Run(version, func(t *testing.T) {
			cli := New(version)
			got := make(chan Message, 1)
			cfg := ConnectionConfig{
				Host: "localhost", Port: 1883, Transport: "tcp", Version: version,
				ClientID: "it-" + version, KeepAlive: 30, CleanSession: true,
			}
			err := cli.Connect(context.Background(), cfg, Callbacks{
				OnMessage: func(m Message) { got <- m },
			})
			if err != nil {
				t.Fatalf("connect: %v", err)
			}
			defer cli.Disconnect()

			if err := cli.Subscribe(Subscription{Topic: "it/test", QoS: 1}); err != nil {
				t.Fatalf("subscribe: %v", err)
			}
			time.Sleep(200 * time.Millisecond)
			if err := cli.Publish(Message{Topic: "it/test", Payload: []byte("hi"), QoS: 1}); err != nil {
				t.Fatalf("publish: %v", err)
			}
			select {
			case m := <-got:
				if string(m.Payload) != "hi" {
					t.Fatalf("want hi, got %s", m.Payload)
				}
			case <-time.After(3 * time.Second):
				t.Fatal("timed out waiting for message")
			}
		})
	}
}
```

- [ ] **Step 2: 로컬 브로커 기동 후 실행**

```bash
docker run -d --name mosq -p 1883:1883 eclipse-mosquitto:2 \
  sh -c "printf 'listener 1883\nallow_anonymous true\n' > /mosquitto/config/mosquitto.conf && exec mosquitto -c /mosquitto/config/mosquitto.conf"
go test -tags=integration ./internal/mqtt/ -v
docker rm -f mosq
```

Expected: 두 서브테스트(3.1.1, 5.0) PASS. 실패 시 해당 버전 구현체의 콜백/구독 타이밍을 디버깅(systematic-debugging 스킬).

- [ ] **Step 3: Commit**

```bash
git add internal/mqtt/integration_test.go
git commit -m "test: add MQTT pub/sub integration test for both versions"
```

---

## Phase 3 — Wails 바인딩 & 이벤트 브리지

### Task 11: 앱 상태 + 배치 이벤트 디바운서

**Files:**
- Create: `internal/app/emitter.go`
- Test: `internal/app/emitter_test.go`

> 배치 로직을 Wails runtime과 분리해 단위 테스트 가능하게 만든다. emit 함수를 주입한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```go
package app

import (
	"sync"
	"testing"
	"time"

	"github.com/kenshin579/mqtt-insight/internal/mqtt"
)

func TestBatcherFlushesGroupedMessages(t *testing.T) {
	var mu sync.Mutex
	var batches [][]mqtt.Message
	b := NewBatcher(20*time.Millisecond, func(ms []mqtt.Message) {
		mu.Lock()
		batches = append(batches, ms)
		mu.Unlock()
	})
	b.Start()
	defer b.Stop()

	b.Add(mqtt.Message{Topic: "a"})
	b.Add(mqtt.Message{Topic: "b"})
	time.Sleep(60 * time.Millisecond)

	mu.Lock()
	defer mu.Unlock()
	total := 0
	for _, batch := range batches {
		total += len(batch)
	}
	if total != 2 {
		t.Fatalf("want 2 total messages flushed, got %d (batches=%d)", total, len(batches))
	}
}
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `go test ./internal/app/ -run TestBatcher -v`
Expected: FAIL — `undefined: NewBatcher`

- [ ] **Step 3: 최소 구현**

```go
package app

import (
	"sync"
	"time"

	"github.com/kenshin579/mqtt-insight/internal/mqtt"
)

// Batcher groups messages and flushes them on an interval to avoid render floods.
type Batcher struct {
	interval time.Duration
	flush    func([]mqtt.Message)
	mu       sync.Mutex
	buf      []mqtt.Message
	stop     chan struct{}
}

// NewBatcher creates a batcher that calls flush with grouped messages every interval.
func NewBatcher(interval time.Duration, flush func([]mqtt.Message)) *Batcher {
	return &Batcher{interval: interval, flush: flush, stop: make(chan struct{})}
}

// Add queues a message for the next flush.
func (b *Batcher) Add(m mqtt.Message) {
	b.mu.Lock()
	b.buf = append(b.buf, m)
	b.mu.Unlock()
}

// Start begins the flush loop.
func (b *Batcher) Start() {
	go func() {
		t := time.NewTicker(b.interval)
		defer t.Stop()
		for {
			select {
			case <-t.C:
				b.mu.Lock()
				if len(b.buf) == 0 {
					b.mu.Unlock()
					continue
				}
				out := b.buf
				b.buf = nil
				b.mu.Unlock()
				b.flush(out)
			case <-b.stop:
				return
			}
		}
	}()
}

// Stop halts the flush loop.
func (b *Batcher) Stop() { close(b.stop) }
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `go test ./internal/app/ -run TestBatcher -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/app/emitter.go internal/app/emitter_test.go
git commit -m "feat: add message batcher for debounced frontend emits"
```

---

### Task 12: App 바인딩 (연결/구독/발행/스냅샷)

**Files:**
- Modify: `app.go` (스캐폴드에서 생성된 파일 전체 교체)

- [ ] **Step 1: app.go 구현**

```go
package main

import (
	"context"
	"time"

	"github.com/kenshin579/mqtt-insight/internal/app"
	"github.com/kenshin579/mqtt-insight/internal/config"
	"github.com/kenshin579/mqtt-insight/internal/mqtt"
	"github.com/kenshin579/mqtt-insight/internal/store"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App is the Wails-bound application.
type App struct {
	ctx     context.Context
	cfg     *config.Config
	cfgPath string
	client  mqtt.MQTTClient
	store   store.MessageStore
	batcher *app.Batcher
}

// NewApp creates the app, loading persisted config.
func NewApp() *App {
	path, _ := config.AppConfigPath()
	cfg, _ := config.Load(path)
	return &App{cfg: cfg, cfgPath: path}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.store = store.NewMemoryStore(a.cfg.Settings.RingBufferSize)
	a.batcher = app.NewBatcher(50*time.Millisecond, func(ms []mqtt.Message) {
		for _, m := range ms {
			a.store.Record(m)
		}
		runtime.EventsEmit(a.ctx, "mqtt:messages", ms)
		runtime.EventsEmit(a.ctx, "mqtt:tree", a.store.TreeSnapshot())
	})
	a.batcher.Start()
}

func (a *App) shutdown(ctx context.Context) {
	if a.batcher != nil {
		a.batcher.Stop()
	}
	if a.client != nil {
		_ = a.client.Disconnect()
	}
}

// --- Bound methods (exposed to frontend) ---

// GetProfiles returns saved connection profiles.
func (a *App) GetProfiles() []config.Profile { return a.cfg.Profiles }

// GetSettings returns app settings.
func (a *App) GetSettings() config.Settings { return a.cfg.Settings }

// SaveProfile upserts a profile by name and persists.
func (a *App) SaveProfile(p config.Profile) error {
	replaced := false
	for i := range a.cfg.Profiles {
		if a.cfg.Profiles[i].Name == p.Name {
			a.cfg.Profiles[i] = p
			replaced = true
			break
		}
	}
	if !replaced {
		a.cfg.Profiles = append(a.cfg.Profiles, p)
	}
	return config.Save(a.cfgPath, a.cfg)
}

// DeleteProfile removes a profile by name.
func (a *App) DeleteProfile(name string) error {
	for i := range a.cfg.Profiles {
		if a.cfg.Profiles[i].Name == name {
			a.cfg.Profiles = append(a.cfg.Profiles[:i], a.cfg.Profiles[i+1:]...)
			break
		}
	}
	return config.Save(a.cfgPath, a.cfg)
}

// SaveSettings persists settings.
func (a *App) SaveSettings(s config.Settings) error {
	a.cfg.Settings = s
	return config.Save(a.cfgPath, a.cfg)
}

// Connect opens a connection using a profile.
func (a *App) Connect(p config.Profile) error {
	if a.client != nil {
		_ = a.client.Disconnect()
	}
	a.store.Clear()
	a.client = mqtt.New(p.Version)
	cfg := mqtt.ConnectionConfig{
		Host: p.Host, Port: p.Port, Transport: p.Transport, Version: p.Version,
		ClientID: p.ClientID, Username: p.Username, Password: p.Password,
		KeepAlive: p.KeepAlive, CleanSession: p.CleanSession, AutoReconnect: p.AutoReconnect,
		CACertPath: p.CACertPath, UseSystemCAs: p.UseSystemCAs, SkipVerify: p.SkipVerify,
		WSPath: p.WSPath, WillTopic: p.WillTopic, WillPayload: p.WillPayload,
		WillQoS: p.WillQoS, WillRetained: p.WillRetained,
	}
	return a.client.Connect(a.ctx, cfg, mqtt.Callbacks{
		OnMessage:        func(m mqtt.Message) { a.batcher.Add(m) },
		OnConnect:        func() { runtime.EventsEmit(a.ctx, "mqtt:status", "connected") },
		OnConnectionLost: func(err error) { runtime.EventsEmit(a.ctx, "mqtt:status", "disconnected: "+err.Error()) },
	})
}

// Disconnect closes the active connection.
func (a *App) Disconnect() error {
	if a.client == nil {
		return nil
	}
	return a.client.Disconnect()
}

// Subscribe subscribes to a topic filter.
func (a *App) Subscribe(topic string, qos byte) error {
	return a.client.Subscribe(mqtt.Subscription{Topic: topic, QoS: qos})
}

// Unsubscribe removes a subscription.
func (a *App) Unsubscribe(topic string) error { return a.client.Unsubscribe(topic) }

// Publish publishes a message.
func (a *App) Publish(m mqtt.Message) error { return a.client.Publish(m) }

// History returns buffered messages for a topic.
func (a *App) History(topic string) []mqtt.Message { return a.store.History(topic) }
```

- [ ] **Step 2: main.go 갱신 (Bind + 라이프사이클)**

`main.go`에서 `app := NewApp()` 사용 및 `OnStartup: app.startup`, `OnShutdown: app.shutdown`, `Bind: []interface{}{app}` 확인. 스캐폴드가 `app := NewApp()`를 이미 쓰면 startup/shutdown 훅만 연결.

- [ ] **Step 3: 컴파일 + 바인딩 생성 확인**

Run: `wails build -clean`
Expected: 빌드 성공. `frontend/wailsjs/go/main/App.d.ts`에 `Connect`, `Subscribe`, `Publish` 등 노출 확인.

- [ ] **Step 4: Commit**

```bash
git add app.go main.go frontend/wailsjs
git commit -m "feat: wire App bindings for connect/subscribe/publish and event bridge"
```

---

## Phase 4 — 프론트엔드

### Task 13: payload 포맷 유틸 (TDD)

**Files:**
- Create: `frontend/src/lib/payload.ts`
- Test: `frontend/src/lib/payload.test.ts`
- Modify: `frontend/package.json` (vitest)

- [ ] **Step 1: vitest 설치**

```bash
cd frontend && npm install -D vitest
npm pkg set scripts.test="vitest run"
```

- [ ] **Step 2: 실패하는 테스트 작성**

```ts
import { describe, it, expect } from "vitest";
import { detectFormat, formatPayload, bytesToString } from "./payload";

describe("payload", () => {
  it("detects JSON", () => {
    expect(detectFormat(bytesToBase64('{"a":1}'))).toBe("json");
  });
  it("detects plain text", () => {
    expect(detectFormat(bytesToBase64("hello"))).toBe("plain");
  });
  it("pretty-prints JSON", () => {
    const out = formatPayload(bytesToBase64('{"a":1}'), "json");
    expect(out).toContain('"a": 1');
  });
  it("renders hex", () => {
    const out = formatPayload(bytesToBase64("AB"), "hex");
    expect(out).toBe("41 42");
  });
});

// helper: Go sends payload as base64 (Go []byte marshals to base64 in JSON)
function bytesToBase64(s: string): string {
  return btoa(s);
}
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `cd frontend && npx vitest run src/lib/payload.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: 구현**

> Go의 `[]byte`는 JSON에서 base64 문자열로 직렬화된다. 프론트엔드는 base64를 받아 디코드한다.

```ts
export type Format = "plain" | "json" | "hex" | "base64";

/** Decode a base64 string (Go []byte JSON encoding) to a byte array. */
export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64 || "");
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

/** Decode base64 payload to a UTF-8 string. */
export function bytesToString(b64: string): string {
  return new TextDecoder().decode(base64ToBytes(b64));
}

/** Auto-detect the best display format from a base64 payload. */
export function detectFormat(b64: string): Format {
  const s = bytesToString(b64).trim();
  if (s.startsWith("{") || s.startsWith("[")) {
    try {
      JSON.parse(s);
      return "json";
    } catch {
      /* fall through */
    }
  }
  // non-printable bytes -> hex
  const bytes = base64ToBytes(b64);
  for (const byte of bytes) {
    if (byte < 9 || (byte > 13 && byte < 32)) return "hex";
  }
  return "plain";
}

/** Format a base64 payload for display in the chosen format. */
export function formatPayload(b64: string, fmt: Format): string {
  switch (fmt) {
    case "json":
      try {
        return JSON.stringify(JSON.parse(bytesToString(b64)), null, 2);
      } catch {
        return bytesToString(b64); // fallback to plain
      }
    case "hex":
      return Array.from(base64ToBytes(b64))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(" ")
        .toUpperCase();
    case "base64":
      return b64;
    case "plain":
    default:
      return bytesToString(b64);
  }
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd frontend && npx vitest run src/lib/payload.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/payload.ts frontend/src/lib/payload.test.ts frontend/package.json frontend/package-lock.json
git commit -m "feat: add payload format detection and conversion utils"
```

---

### Task 14: Zustand 스토어 + 이벤트 브리지

**Files:**
- Create: `frontend/src/store/appStore.ts`, `frontend/src/bridge/events.ts`
- Create: `frontend/src/types.ts`

- [ ] **Step 1: 타입 정의**

```ts
// frontend/src/types.ts — mirrors Go structs sent over Wails
export interface Message {
  topic: string;
  payload: string; // base64 (Go []byte)
  qos: number;
  retained: boolean;
  timestamp: string;
  contentType?: string;
  userProps?: { key: string; value: string }[];
}

export interface TreeNode {
  name: string;
  fullTopic: string;
  children?: TreeNode[];
  messageCount: number;
  lastPayload?: string; // base64
  lastSeen: string;
  retained: boolean;
}

export type Status = "disconnected" | "connecting" | "connected";
```

- [ ] **Step 2: 스토어 구현**

```ts
// frontend/src/store/appStore.ts
import { create } from "zustand";
import type { Message, TreeNode, Status } from "../types";

interface AppState {
  status: Status;
  statusText: string;
  tree: TreeNode | null;
  selectedTopic: string | null;
  paused: boolean;
  liveMessages: Message[]; // most recent across all topics
  setStatus: (s: Status, text?: string) => void;
  setTree: (t: TreeNode) => void;
  selectTopic: (t: string | null) => void;
  togglePaused: () => void;
  pushMessages: (ms: Message[]) => void;
  clear: () => void;
}

const MAX_LIVE = 500;

export const useAppStore = create<AppState>((set, get) => ({
  status: "disconnected",
  statusText: "",
  tree: null,
  selectedTopic: null,
  paused: false,
  liveMessages: [],
  setStatus: (s, text = "") => set({ status: s, statusText: text }),
  setTree: (t) => set({ tree: t }),
  selectTopic: (t) => set({ selectedTopic: t }),
  togglePaused: () => set({ paused: !get().paused }),
  pushMessages: (ms) => {
    if (get().paused) return;
    const next = [...get().liveMessages, ...ms].slice(-MAX_LIVE);
    set({ liveMessages: next });
  },
  clear: () => set({ liveMessages: [], tree: null }),
}));
```

- [ ] **Step 3: 이벤트 브리지 구현**

```ts
// frontend/src/bridge/events.ts
import { EventsOn, EventsOff } from "../../wailsjs/runtime/runtime";
import { useAppStore } from "../store/appStore";
import type { Message, TreeNode } from "../types";

/** Wire Wails backend events into the Zustand store. Call once on mount. */
export function initEventBridge(): () => void {
  EventsOn("mqtt:messages", (ms: Message[]) => useAppStore.getState().pushMessages(ms));
  EventsOn("mqtt:tree", (t: TreeNode) => useAppStore.getState().setTree(t));
  EventsOn("mqtt:status", (text: string) => {
    const connected = text === "connected";
    useAppStore.getState().setStatus(connected ? "connected" : "disconnected", text);
  });
  return () => EventsOff("mqtt:messages", "mqtt:tree", "mqtt:status");
}
```

- [ ] **Step 4: 컴파일 확인**

Run: `cd frontend && npx tsc --noEmit`
Expected: 타입 에러 없음 (wailsjs 바인딩이 Task 12에서 생성됨)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types.ts frontend/src/store frontend/src/bridge
git commit -m "feat: add Zustand store and Wails event bridge"
```

---

### Task 15: 3-Pane 레이아웃 + 연결 바

**Files:**
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/components/ConnectionBar.tsx`
- Create: `frontend/src/App.css` (레이아웃 스타일)

- [ ] **Step 1: ConnectionBar 구현**

```tsx
// frontend/src/components/ConnectionBar.tsx
import { useAppStore } from "../store/appStore";
import { Disconnect } from "../../wailsjs/go/main/App";

export function ConnectionBar({ onOpenConnect }: { onOpenConnect: () => void }) {
  const { status, statusText } = useAppStore();
  return (
    <div className="conn-bar">
      <span className={`dot ${status}`} />
      <span className="conn-text">{status === "connected" ? "Connected" : statusText || "Disconnected"}</span>
      {status === "connected" ? (
        <button onClick={() => Disconnect()}>Disconnect</button>
      ) : (
        <button onClick={onOpenConnect}>Connect…</button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: App.tsx 레이아웃 구현**

```tsx
// frontend/src/App.tsx
import { useEffect, useState } from "react";
import { initEventBridge } from "./bridge/events";
import { ConnectionBar } from "./components/ConnectionBar";
import { ConnectionForm } from "./components/ConnectionForm";
import { TopicTree } from "./components/TopicTree";
import { MessageList } from "./components/MessageList";
import { PublishPanel } from "./components/PublishPanel";
import "./App.css";

function App() {
  const [showConnect, setShowConnect] = useState(false);
  useEffect(() => initEventBridge(), []);

  return (
    <div className="layout">
      <ConnectionBar onOpenConnect={() => setShowConnect(true)} />
      <div className="panes">
        <div className="pane tree-pane"><TopicTree /></div>
        <div className="right-col">
          <div className="pane msg-pane"><MessageList /></div>
          <div className="pane pub-pane"><PublishPanel /></div>
        </div>
      </div>
      {showConnect && <ConnectionForm onClose={() => setShowConnect(false)} />}
    </div>
  );
}

export default App;
```

- [ ] **Step 3: App.css 레이아웃 스타일**

```css
/* frontend/src/App.css */
:root { --bg: #1e1e24; --panel: #26262e; --border: #3a3a44; --text: #e4e4ec; --accent: #4f8cff; }
* { box-sizing: border-box; }
body, #root { margin: 0; height: 100vh; background: var(--bg); color: var(--text); font-family: system-ui, sans-serif; font-size: 13px; }
.layout { display: flex; flex-direction: column; height: 100vh; }
.conn-bar { display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: var(--panel); border-bottom: 1px solid var(--border); }
.conn-bar .dot { width: 10px; height: 10px; border-radius: 50%; background: #888; }
.conn-bar .dot.connected { background: #43c463; }
.conn-bar .conn-text { flex: 1; }
.panes { display: flex; flex: 1; min-height: 0; }
.pane { background: var(--panel); overflow: auto; }
.tree-pane { flex: 0 0 320px; border-right: 1px solid var(--border); }
.right-col { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.msg-pane { flex: 1; border-bottom: 1px solid var(--border); }
.pub-pane { flex: 0 0 200px; }
button { background: var(--accent); color: #fff; border: 0; padding: 4px 12px; border-radius: 4px; cursor: pointer; }
```

- [ ] **Step 4: 컴파일 확인 (아직 하위 컴포넌트 stub 필요 → 다음 태스크 전 임시 stub)**

임시로 `TopicTree`, `MessageList`, `PublishPanel`, `ConnectionForm`을 빈 컴포넌트로 만들어 빌드가 통과하는지 확인하고, 이후 태스크에서 실제 구현으로 교체.

Run: `cd frontend && npx tsc --noEmit`
Expected: stub 생성 후 에러 없음

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx frontend/src/App.css frontend/src/components/ConnectionBar.tsx
git commit -m "feat: add 3-pane layout and connection bar"
```

---

### Task 16: 연결 폼 (프로필 관리)

**Files:**
- Create: `frontend/src/components/ConnectionForm.tsx`

- [ ] **Step 1: 구현**

```tsx
// frontend/src/components/ConnectionForm.tsx
import { useEffect, useState } from "react";
import { GetProfiles, SaveProfile, Connect } from "../../wailsjs/go/main/App";
import { config } from "../../wailsjs/go/models";
import { useAppStore } from "../store/appStore";

const empty: config.Profile = {
  name: "", host: "localhost", port: 1883, transport: "tcp", version: "5.0",
  clientId: "mqtt-insight", username: "", password: "", keepAlive: 60,
  cleanSession: true, autoReconnect: true, caCertPath: "", useSystemCAs: true,
  skipVerify: false, wsPath: "/mqtt", willTopic: "", willPayload: "",
  willQos: 0, willRetained: false,
} as config.Profile;

export function ConnectionForm({ onClose }: { onClose: () => void }) {
  const [profiles, setProfiles] = useState<config.Profile[]>([]);
  const [p, setP] = useState<config.Profile>(empty);
  const setStatus = useAppStore((s) => s.setStatus);

  useEffect(() => { GetProfiles().then((r) => setProfiles(r || [])); }, []);

  const upd = (k: keyof config.Profile, v: unknown) => setP({ ...p, [k]: v } as config.Profile);

  async function connect() {
    await SaveProfile(p);
    setStatus("connecting", "connecting…");
    try {
      await Connect(p);
      onClose();
    } catch (e) {
      setStatus("disconnected", String(e));
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Connect to Broker</h3>
        <div className="saved">
          {profiles.map((sp) => (
            <button key={sp.name} onClick={() => setP(sp)}>{sp.name || sp.host}</button>
          ))}
        </div>
        <label>Name <input value={p.name} onChange={(e) => upd("name", e.target.value)} /></label>
        <label>Host <input value={p.host} onChange={(e) => upd("host", e.target.value)} /></label>
        <label>Port <input type="number" value={p.port} onChange={(e) => upd("port", +e.target.value)} /></label>
        <label>Transport
          <select value={p.transport} onChange={(e) => upd("transport", e.target.value)}>
            <option value="tcp">tcp</option><option value="tls">tls</option>
            <option value="ws">ws</option><option value="wss">wss</option>
          </select>
        </label>
        <label>Version
          <select value={p.version} onChange={(e) => upd("version", e.target.value)}>
            <option value="5.0">5.0</option><option value="3.1.1">3.1.1</option>
          </select>
        </label>
        <label>Client ID <input value={p.clientId} onChange={(e) => upd("clientId", e.target.value)} /></label>
        <label>Username <input value={p.username} onChange={(e) => upd("username", e.target.value)} /></label>
        <label>Password <input type="password" value={p.password} onChange={(e) => upd("password", e.target.value)} /></label>
        {(p.transport === "tls" || p.transport === "wss") && (
          <label><input type="checkbox" checked={p.skipVerify} onChange={(e) => upd("skipVerify", e.target.checked)} /> Skip TLS verification (dev)</label>
        )}
        <div className="modal-actions">
          <button onClick={connect}>Connect</button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 모달 CSS를 App.css에 추가**

```css
.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.5); display: flex; align-items: center; justify-content: center; }
.modal { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 16px; width: 360px; max-height: 90vh; overflow: auto; display: flex; flex-direction: column; gap: 8px; }
.modal label { display: flex; flex-direction: column; gap: 2px; font-size: 12px; }
.modal input, .modal select { background: var(--bg); border: 1px solid var(--border); color: var(--text); padding: 4px; border-radius: 4px; }
.modal-actions { display: flex; gap: 8px; margin-top: 8px; }
.saved { display: flex; gap: 4px; flex-wrap: wrap; }
```

- [ ] **Step 3: 컴파일 확인**

Run: `cd frontend && npx tsc --noEmit`
Expected: 에러 없음 (`wailsjs/go/models`는 SaveProfile 바인딩 생성 시 함께 생성됨)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ConnectionForm.tsx frontend/src/App.css
git commit -m "feat: add connection form with profile save/select"
```

---

### Task 17: 토픽 트리 컴포넌트

**Files:**
- Create: `frontend/src/components/TopicTree.tsx`

- [ ] **Step 1: 구현 (react-arborist)**

```tsx
// frontend/src/components/TopicTree.tsx
import { useMemo, useState } from "react";
import { Tree, NodeApi } from "react-arborist";
import { useAppStore } from "../store/appStore";
import { bytesToString } from "../lib/payload";
import type { TreeNode } from "../types";
import { Subscribe } from "../../wailsjs/go/main/App";

interface ArboristNode { id: string; name: string; count: number; preview: string; children?: ArboristNode[]; }

function toArborist(node: TreeNode | undefined): ArboristNode[] {
  if (!node?.children) return [];
  return node.children.map((c) => ({
    id: c.fullTopic,
    name: c.name,
    count: c.messageCount,
    preview: c.lastPayload ? bytesToString(c.lastPayload).slice(0, 40) : "",
    children: c.children ? toArborist(c) : undefined,
  }));
}

export function TopicTree() {
  const tree = useAppStore((s) => s.tree);
  const selectTopic = useAppStore((s) => s.selectTopic);
  const [filter, setFilter] = useState("");
  const data = useMemo(() => toArborist(tree ?? undefined), [tree]);

  return (
    <div className="topic-tree">
      <div className="tree-toolbar">
        <input placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <button title="Subscribe to #" onClick={() => Subscribe("#", 0)}>Sub #</button>
      </div>
      <Tree data={data} searchTerm={filter} openByDefault={false} width="100%" height={600} rowHeight={26}
        onSelect={(nodes: NodeApi<ArboristNode>[]) => nodes[0] && selectTopic(nodes[0].id)}>
        {({ node, style, dragHandle }) => (
          <div style={style} ref={dragHandle} className="tree-row" onClick={() => node.toggle()}>
            <span className="tree-name">{node.data.name}</span>
            {node.data.count > 0 && <span className="tree-count">{node.data.count}</span>}
            {node.data.preview && <span className="tree-preview">{node.data.preview}</span>}
          </div>
        )}
      </Tree>
    </div>
  );
}
```

- [ ] **Step 2: 트리 CSS를 App.css에 추가**

```css
.tree-toolbar { display: flex; gap: 4px; padding: 6px; }
.tree-toolbar input { flex: 1; background: var(--bg); border: 1px solid var(--border); color: var(--text); padding: 3px; border-radius: 4px; }
.tree-row { display: flex; align-items: center; gap: 6px; padding: 0 6px; cursor: pointer; white-space: nowrap; }
.tree-row:hover { background: rgba(255,255,255,.05); }
.tree-count { font-size: 10px; background: var(--accent); border-radius: 8px; padding: 0 5px; }
.tree-preview { color: #8a8a96; font-size: 11px; overflow: hidden; text-overflow: ellipsis; }
```

- [ ] **Step 3: 컴파일 확인**

Run: `cd frontend && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/TopicTree.tsx frontend/src/App.css
git commit -m "feat: add topic tree component with filter and subscribe"
```

---

### Task 18: 메시지 리스트 + 상세

**Files:**
- Create: `frontend/src/components/MessageList.tsx`, `frontend/src/components/MessageDetail.tsx`

- [ ] **Step 1: MessageDetail 구현**

```tsx
// frontend/src/components/MessageDetail.tsx
import { useState } from "react";
import { formatPayload, detectFormat, type Format } from "../lib/payload";
import type { Message } from "../types";

export function MessageDetail({ msg }: { msg: Message }) {
  const [fmt, setFmt] = useState<Format>(detectFormat(msg.payload));
  return (
    <div className="msg-detail">
      <div className="detail-toolbar">
        {(["plain", "json", "hex", "base64"] as Format[]).map((f) => (
          <button key={f} className={f === fmt ? "on" : ""} onClick={() => setFmt(f)}>{f}</button>
        ))}
      </div>
      <pre className="payload">{formatPayload(msg.payload, fmt)}</pre>
      {msg.contentType && <div className="meta">content-type: {msg.contentType}</div>}
      {msg.userProps?.map((u, i) => <div key={i} className="meta">{u.key}: {u.value}</div>)}
    </div>
  );
}
```

- [ ] **Step 2: MessageList 구현 (선택 토픽 히스토리, 가상화)**

```tsx
// frontend/src/components/MessageList.tsx
import { useEffect, useMemo, useState } from "react";
import { FixedSizeList } from "react-window";
import { useAppStore } from "../store/appStore";
import { History } from "../../wailsjs/go/main/App";
import { bytesToString } from "../lib/payload";
import { MessageDetail } from "./MessageDetail";
import type { Message } from "../types";

export function MessageList() {
  const selectedTopic = useAppStore((s) => s.selectedTopic);
  const liveMessages = useAppStore((s) => s.liveMessages);
  const paused = useAppStore((s) => s.paused);
  const togglePaused = useAppStore((s) => s.togglePaused);
  const clear = useAppStore((s) => s.clear);
  const [history, setHistory] = useState<Message[]>([]);
  const [selected, setSelected] = useState<Message | null>(null);

  // Load buffered history when topic selection changes, then keep it fresh from live stream.
  useEffect(() => {
    if (selectedTopic) History(selectedTopic).then((h) => setHistory(h || []));
    else setHistory([]);
  }, [selectedTopic]);

  const rows = useMemo(() => {
    if (!selectedTopic) return liveMessages;
    const live = liveMessages.filter((m) => m.topic === selectedTopic);
    return [...history, ...live];
  }, [selectedTopic, history, liveMessages]);

  return (
    <div className="msg-list">
      <div className="msg-toolbar">
        <span>{selectedTopic || "All topics (live)"}</span>
        <button onClick={togglePaused}>{paused ? "Resume" : "Pause"}</button>
        <button onClick={clear}>Clear</button>
      </div>
      <div className="msg-split">
        <FixedSizeList height={300} width="100%" itemCount={rows.length} itemSize={22}>
          {({ index, style }) => {
            const m = rows[rows.length - 1 - index]; // newest first
            return (
              <div style={style} className="msg-row" onClick={() => setSelected(m)}>
                <span className="ts">{new Date(m.timestamp).toLocaleTimeString()}</span>
                <span className="topic">{m.topic}</span>
                <span className="preview">{bytesToString(m.payload).slice(0, 60)}</span>
                {m.retained && <span className="badge">R</span>}
                <span className="qos">q{m.qos}</span>
              </div>
            );
          }}
        </FixedSizeList>
        {selected && <MessageDetail msg={selected} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 메시지 CSS를 App.css에 추가**

```css
.msg-toolbar, .detail-toolbar { display: flex; gap: 6px; align-items: center; padding: 4px 8px; border-bottom: 1px solid var(--border); }
.msg-toolbar span:first-child { flex: 1; }
.msg-split { display: flex; height: calc(100% - 30px); }
.msg-row { display: flex; gap: 8px; align-items: center; padding: 0 8px; font-family: monospace; cursor: pointer; }
.msg-row:hover { background: rgba(255,255,255,.05); }
.msg-row .ts { color: #8a8a96; }
.msg-row .topic { color: var(--accent); }
.msg-row .badge { background: #d9822b; border-radius: 3px; padding: 0 4px; font-size: 10px; }
.msg-detail { flex: 0 0 45%; border-left: 1px solid var(--border); overflow: auto; }
.payload { margin: 0; padding: 8px; white-space: pre-wrap; word-break: break-all; }
.detail-toolbar button.on { background: var(--accent); }
.detail-toolbar button { background: var(--border); }
.meta { padding: 2px 8px; color: #8a8a96; font-size: 11px; }
```

- [ ] **Step 4: 컴파일 확인**

Run: `cd frontend && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/MessageList.tsx frontend/src/components/MessageDetail.tsx frontend/src/App.css
git commit -m "feat: add virtualized message list and payload detail view"
```

---

### Task 19: 발행 패널

**Files:**
- Create: `frontend/src/components/PublishPanel.tsx`

- [ ] **Step 1: 구현**

```tsx
// frontend/src/components/PublishPanel.tsx
import { useState } from "react";
import { Publish } from "../../wailsjs/go/main/App";
import { mqtt } from "../../wailsjs/go/models";
import { useAppStore } from "../store/appStore";

export function PublishPanel() {
  const selectedTopic = useAppStore((s) => s.selectedTopic);
  const [topic, setTopic] = useState("");
  const [payload, setPayload] = useState("");
  const [qos, setQos] = useState(0);
  const [retained, setRetained] = useState(false);

  async function publish() {
    const t = topic || selectedTopic || "";
    if (!t) return;
    // Go []byte expects base64 in JSON; Wails models expect number[] — send via btoa->Uint8Array
    const bytes = Array.from(new TextEncoder().encode(payload));
    await Publish(
      mqtt.Message.createFrom({
        topic: t,
        payload: bytes, // Wails serializes number[] to []byte
        qos,
        retained,
        timestamp: new Date().toISOString(),
      }),
    );
  }

  return (
    <div className="publish-panel">
      <div className="pub-row">
        <input placeholder={selectedTopic || "topic"} value={topic} onChange={(e) => setTopic(e.target.value)} />
        <select value={qos} onChange={(e) => setQos(+e.target.value)}>
          <option value={0}>QoS 0</option><option value={1}>QoS 1</option><option value={2}>QoS 2</option>
        </select>
        <label><input type="checkbox" checked={retained} onChange={(e) => setRetained(e.target.checked)} /> retain</label>
        <button onClick={publish}>Publish</button>
      </div>
      <textarea placeholder="payload" value={payload} onChange={(e) => setPayload(e.target.value)} />
    </div>
  );
}
```

> **주의(구현 시 확인):** Wails가 Go `[]byte`를 TS 바인딩에서 어떻게 표현하는지 실제 생성된 `models.ts`를 확인한다. 일반적으로 `number[]`로 생성되며 위 코드가 맞다. 만약 `string`(base64)로 생성되면 `payload: btoa(payload)`로 바꾼다. 이 확인은 Task 12 이후 `frontend/wailsjs/go/models.ts`를 열어 수행.

- [ ] **Step 2: 발행 패널 CSS를 App.css에 추가**

```css
.publish-panel { display: flex; flex-direction: column; height: 100%; padding: 6px; gap: 6px; }
.pub-row { display: flex; gap: 6px; align-items: center; }
.pub-row input { flex: 1; background: var(--bg); border: 1px solid var(--border); color: var(--text); padding: 4px; border-radius: 4px; }
.publish-panel textarea { flex: 1; background: var(--bg); border: 1px solid var(--border); color: var(--text); padding: 6px; border-radius: 4px; resize: none; font-family: monospace; }
```

- [ ] **Step 3: 컴파일 확인**

Run: `cd frontend && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/PublishPanel.tsx frontend/src/App.css
git commit -m "feat: add publish panel"
```

---

### Task 20: 수동 E2E 검증 (실 브로커)

- [ ] **Step 1: 로컬 브로커 기동**

```bash
docker run -d --name mosq -p 1883:1883 eclipse-mosquitto:2 \
  sh -c "printf 'listener 1883\nallow_anonymous true\n' > /mosquitto/config/mosquitto.conf && exec mosquitto -c /mosquitto/config/mosquitto.conf"
```

- [ ] **Step 2: 앱 실행**

Run: `cd /Users/user/GolandProjects/mqtt-insight && wails dev`
Expected: 데스크톱 창이 뜨고 3-pane 레이아웃 표시.

- [ ] **Step 3: 시나리오 검증**

1. Connect… → localhost:1883, version 5.0 → Connect. 상단 점이 초록으로.
2. "Sub #" 클릭.
3. 별도 터미널에서: `docker exec mosq mosquitto_pub -t sensors/room1/temp -m 23.4 -q 1`
4. 트리에 `sensors/room1/temp` 노드가 나타나고 카운트/미리보기 갱신 확인.
5. 노드 선택 → 우상 메시지 리스트에 메시지, 클릭 시 상세(JSON/hex 포맷 전환) 확인.
6. 발행 패널에서 topic/payload 입력 → Publish → 리스트에 반영 확인.
7. version 3.1.1로도 재연결해 동일 시나리오 확인.

- [ ] **Step 4: 브로커 정리**

```bash
docker rm -f mosq
```

- [ ] **Step 5: 검증 결과를 커밋 메시지로 남길 변경이 있으면 커밋** (없으면 스킵)

---

## Phase 5 — 선택적 SQLite 기록

### Task 21: SQLite 기록 스토어

**Files:**
- Create: `internal/store/sqlite.go`
- Test: `internal/store/sqlite_test.go`

- [ ] **Step 1: 실패하는 테스트 작성**

```go
package store

import (
	"path/filepath"
	"testing"
	"time"

	"github.com/kenshin579/mqtt-insight/internal/mqtt"
)

func TestSQLiteRecorderPersists(t *testing.T) {
	path := filepath.Join(t.TempDir(), "rec.db")
	r, err := NewSQLiteRecorder(path)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer r.Close()

	r.Enable("a/b")
	r.Record(mqtt.Message{Topic: "a/b", Payload: []byte("x"), QoS: 1, Timestamp: time.Unix(1, 0)})
	r.Record(mqtt.Message{Topic: "other", Payload: []byte("y"), Timestamp: time.Unix(2, 0)}) // not enabled -> ignored

	got, err := r.Query("a/b", 10)
	if err != nil {
		t.Fatalf("query: %v", err)
	}
	if len(got) != 1 || string(got[0].Payload) != "x" {
		t.Fatalf("want 1 persisted msg 'x', got %+v", got)
	}
	if other, _ := r.Query("other", 10); len(other) != 0 {
		t.Fatal("non-enabled topic must not be recorded")
	}
}
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `go test ./internal/store/ -run TestSQLite -v`
Expected: FAIL — `undefined: NewSQLiteRecorder`

- [ ] **Step 3: 구현**

```go
package store

import (
	"database/sql"
	"sync"

	_ "modernc.org/sqlite"

	"github.com/kenshin579/mqtt-insight/internal/mqtt"
)

// SQLiteRecorder persists messages for explicitly enabled topics.
type SQLiteRecorder struct {
	db      *sql.DB
	mu      sync.RWMutex
	enabled map[string]bool
}

// NewSQLiteRecorder opens (creating if needed) the recording DB.
func NewSQLiteRecorder(path string) (*SQLiteRecorder, error) {
	db, err := sql.Open("sqlite", "file:"+path+"?_pragma=journal_mode(WAL)")
	if err != nil {
		return nil, err
	}
	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS messages (
		topic TEXT NOT NULL, payload BLOB, qos INTEGER, retained INTEGER, ts INTEGER
	); CREATE INDEX IF NOT EXISTS idx_topic_ts ON messages(topic, ts);`)
	if err != nil {
		return nil, err
	}
	return &SQLiteRecorder{db: db, enabled: map[string]bool{}}, nil
}

// Enable turns on recording for a topic.
func (r *SQLiteRecorder) Enable(topic string) {
	r.mu.Lock()
	r.enabled[topic] = true
	r.mu.Unlock()
}

// Disable turns off recording for a topic.
func (r *SQLiteRecorder) Disable(topic string) {
	r.mu.Lock()
	delete(r.enabled, topic)
	r.mu.Unlock()
}

// Record persists a message if its topic is enabled.
func (r *SQLiteRecorder) Record(m mqtt.Message) {
	r.mu.RLock()
	on := r.enabled[m.Topic]
	r.mu.RUnlock()
	if !on {
		return
	}
	_, _ = r.db.Exec(`INSERT INTO messages(topic,payload,qos,retained,ts) VALUES(?,?,?,?,?)`,
		m.Topic, m.Payload, m.QoS, m.Retained, m.Timestamp.UnixNano())
}

// Query returns up to `limit` most-recent persisted messages for a topic.
func (r *SQLiteRecorder) Query(topic string, limit int) ([]mqtt.Message, error) {
	rows, err := r.db.Query(`SELECT payload,qos,retained,ts FROM messages WHERE topic=? ORDER BY ts DESC LIMIT ?`, topic, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []mqtt.Message
	for rows.Next() {
		var m mqtt.Message
		var ret int
		var ts int64
		if err := rows.Scan(&m.Payload, &m.QoS, &ret, &ts); err != nil {
			return nil, err
		}
		m.Topic = topic
		m.Retained = ret != 0
		out = append(out, m)
	}
	return out, rows.Err()
}

// Close closes the DB.
func (r *SQLiteRecorder) Close() error { return r.db.Close() }
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `go test ./internal/store/ -run TestSQLite -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/store/sqlite.go internal/store/sqlite_test.go
git commit -m "feat: add optional SQLite recorder for enabled topics"
```

---

### Task 22: 기록 토글 바인딩 + 트리 컨텍스트 메뉴 연결

**Files:**
- Modify: `app.go` (recorder 필드 + Enable/Disable 바인딩 + batcher에서 Record 호출)
- Modify: `frontend/src/components/TopicTree.tsx` (우클릭 컨텍스트 메뉴에 "Record" 토글)

- [ ] **Step 1: app.go에 recorder 통합**

`App` 구조체에 `recorder *store.SQLiteRecorder` 추가. `startup`에서 `config.AppConfigPath` 디렉터리 옆에 `recordings.db`를 열어 초기화:

```go
// startup 내부, batcher 생성 전에:
recPath := filepath.Join(filepath.Dir(a.cfgPath), "recordings.db")
if rec, err := store.NewSQLiteRecorder(recPath); err == nil {
	a.recorder = rec
}
```

batcher flush 콜백에서 store.Record 뒤에 추가:

```go
for _, m := range ms {
	a.store.Record(m)
	if a.recorder != nil {
		a.recorder.Record(m)
	}
}
```

shutdown에 `if a.recorder != nil { a.recorder.Close() }` 추가. import에 `"path/filepath"` 추가.

- [ ] **Step 2: 기록 토글 바인딩 추가 (app.go)**

```go
// EnableRecording starts persisting a topic to SQLite.
func (a *App) EnableRecording(topic string) {
	if a.recorder != nil {
		a.recorder.Enable(topic)
	}
}

// DisableRecording stops persisting a topic.
func (a *App) DisableRecording(topic string) {
	if a.recorder != nil {
		a.recorder.Disable(topic)
	}
}
```

- [ ] **Step 3: 컴파일 + 바인딩 재생성**

Run: `wails build -clean`
Expected: 성공. `App.d.ts`에 `EnableRecording`, `DisableRecording` 노출.

- [ ] **Step 4: TopicTree에 우클릭 메뉴 추가**

`TopicTree.tsx`의 `tree-row` div에 `onContextMenu` 핸들러를 붙여 간단한 메뉴(구독/기록 토글)를 띄운다. 최소 구현으로 `window.confirm` 대신 인라인 상태 기반 메뉴:

```tsx
// tree-row onClick 옆에 추가
onContextMenu={(e) => {
  e.preventDefault();
  EnableRecording(node.data.id); // v1: 토글 UI는 단순히 활성화. 비활성화는 SettingsModal에서.
}}
```

상단 import에 `import { Subscribe, EnableRecording } from "../../wailsjs/go/main/App";`

- [ ] **Step 5: Commit**

```bash
git add app.go frontend/src/components/TopicTree.tsx frontend/wailsjs
git commit -m "feat: wire optional per-topic SQLite recording toggle"
```

---

## Phase 6 — 마무리

### Task 23: 설정 모달 (테마/버퍼 크기)

**Files:**
- Create: `frontend/src/components/SettingsModal.tsx`
- Modify: `frontend/src/App.tsx` (설정 버튼 + 테마 적용)

- [ ] **Step 1: SettingsModal 구현**

```tsx
// frontend/src/components/SettingsModal.tsx
import { useEffect, useState } from "react";
import { GetSettings, SaveSettings } from "../../wailsjs/go/main/App";
import { config } from "../../wailsjs/go/models";

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<config.Settings | null>(null);
  useEffect(() => { GetSettings().then(setS); }, []);
  if (!s) return null;

  async function save() {
    await SaveSettings(s!);
    document.documentElement.dataset.theme = s!.theme;
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Settings</h3>
        <label>Theme
          <select value={s.theme} onChange={(e) => setS({ ...s, theme: e.target.value })}>
            <option value="dark">dark</option><option value="light">light</option>
          </select>
        </label>
        <label>Ring buffer size (per topic)
          <input type="number" value={s.ringBufferSize} onChange={(e) => setS({ ...s, ringBufferSize: +e.target.value })} />
        </label>
        <label>Default format
          <select value={s.defaultFormat} onChange={(e) => setS({ ...s, defaultFormat: e.target.value })}>
            <option value="plain">plain</option><option value="json">json</option>
            <option value="hex">hex</option><option value="base64">base64</option>
          </select>
        </label>
        <div className="modal-actions"><button onClick={save}>Save</button><button onClick={onClose}>Cancel</button></div>
      </div>
    </div>
  );
}
```

> **주의:** 버퍼 크기 변경은 앱 재시작 시 반영된다(스토어가 startup에서 생성됨). v1에서는 이 동작을 모달에 한 줄로 안내한다("Restart to apply buffer size").

- [ ] **Step 2: App.tsx에 설정 버튼 + 라이트 테마 CSS**

`ConnectionBar`에 gear 버튼을 추가하거나 App 상단에 버튼을 두고 `showSettings` 상태로 모달 토글. App.css에 라이트 테마 변수 추가:

```css
:root[data-theme="light"] { --bg: #f5f5f7; --panel: #ffffff; --border: #d0d0d8; --text: #1a1a1f; }
```

앱 시작 시 저장된 테마 적용: `App.tsx`의 `useEffect`에서 `GetSettings().then(s => document.documentElement.dataset.theme = s.theme)`.

- [ ] **Step 3: 컴파일 확인**

Run: `cd frontend && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/SettingsModal.tsx frontend/src/App.tsx frontend/src/App.css
git commit -m "feat: add settings modal with theme and buffer size"
```

---

### Task 24: README + 크로스플랫폼 빌드 확인

**Files:**
- Modify: `README.md`

- [ ] **Step 1: README 작성**

`README.md`에 프로젝트 소개, 기능(연결/트리/발행/기록), 개발 방법(`wails dev`), 빌드(`wails build`), 지원 플랫폼, 라이선스(향후 결정) 섹션을 작성.

- [ ] **Step 2: 프로덕션 빌드 확인**

Run: `cd /Users/user/GolandProjects/mqtt-insight && wails build -clean`
Expected: `build/bin/`에 실행 파일 생성, 실행 시 앱 정상 구동.

- [ ] **Step 3: 전체 Go 테스트 통과 확인**

Run: `go test ./...`
Expected: 모든 단위 테스트 PASS (integration 태그 테스트는 제외됨)

- [ ] **Step 4: 프론트엔드 테스트 통과 확인**

Run: `cd frontend && npm test`
Expected: payload 유틸 테스트 PASS

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: add README with usage and build instructions"
```

---

## Self-Review 결과

**Spec coverage:**
- 연결 관리(프로필/transport/버전/TLS/LWT/자동재연결) → Task 5, 6, 7, 8, 9, 12, 16 ✅
- 토픽 트리(집계/검색/미리보기) → Task 2, 17 ✅
- 메시지 뷰(히스토리/포맷/속성/가상화/pause) → Task 3, 13, 18 ✅
- 발행(topic/payload/qos/retained/v5 속성) → Task 19 ✅ (v5 user properties 발행은 Message 타입에 포함; UI는 v1에서 기본 payload 중심, 속성 편집은 최소 — 스펙 6.4의 "response topic" 등 고급 입력은 v1 UI에서 생략하고 v2로. → 아래 갭 참조)
- 3.1.1 + 5.0 → Task 8, 9, 10 ✅
- 하이브리드 저장(인메모리 + 선택적 SQLite) → Task 4, 21, 22 ✅
- TCP/TLS/WebSocket → Task 6(URL), 7(TLS) ✅
- 3-Pane 레이아웃 → Task 15 ✅
- 다크/라이트 테마·설정 → Task 23 ✅
- 배치 emit(고빈도 대응) → Task 11 ✅
- 테스트 전략(단위/통합/프론트/E2E) → Task 1–5, 10, 13, 20, 24 ✅

**식별된 갭 (의도적 범위 조정, 실행자 주의):**
1. **발행 패널의 v5 속성 편집 UI**: 스펙 6.4는 발행 시 user properties/content type/response topic 입력을 언급하나, Task 19 UI는 topic/payload/qos/retained만 노출한다. `mqtt.Message` 타입과 Publish 경로는 이미 v5 속성을 지원하므로, 발행 UI에 속성 입력 필드를 추가하는 것은 Task 19에 선택적으로 포함하거나 후속 작업으로 둔다. 백엔드는 완비되어 있음.
2. **retained 삭제 / 구독해제 컨텍스트 메뉴**: 스펙 6.2의 트리 컨텍스트 메뉴(구독해제, retained 삭제)는 Task 22에서 기록 토글 위주로 최소 구현했다. retained 삭제(빈 payload publish)와 구독해제는 `Unsubscribe`/`Publish` 바인딩이 이미 있으므로 트리 메뉴 확장으로 추가 가능 — v1 마무리 시 여력이 되면 Task 22에 포함.

이 두 갭은 백엔드 기능이 모두 준비되어 있어 UI 배선만 남은 작업이며, v1 코어 흐름(연결→트리→히스토리→발행)에는 영향이 없다.

**Placeholder scan:** 코드 스텝은 모두 실제 코드 포함. "TBD/TODO" 없음.

**Type consistency:** `Message`(Go)↔`Message`(TS), `Node`(Go)↔`TreeNode`(TS), `Profile`/`Settings`가 바인딩 모델과 일치. 메서드명(`Connect/Subscribe/Publish/History/EnableRecording`)이 app.go 바인딩과 프론트엔드 호출에서 일치.
