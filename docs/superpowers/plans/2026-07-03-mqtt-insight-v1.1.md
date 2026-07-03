# mqtt-insight v1.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** v1 최종 리뷰에서 확인된 UI 갭 4가지를 닫는다 — 트리 컨텍스트 메뉴, Recorded(SQLite) 조회 뷰, 발행 v5 속성 UI, 수동 E2E 체크리스트.

**Architecture:** 기존 컴포넌트·바인딩 재사용 최소 배선. 백엔드는 바인딩 2개(`QueryRecorded`/`RecordedTopics`)와 `Message.ResponseTopic` 필드만 추가. 컨텍스트 메뉴는 의존성 없는 자체 컴포넌트. 기록 상태의 진실원천은 백엔드이고 프론트는 mount 시 `RecordedTopics()`로 초기화한다.

**Tech Stack:** 기존과 동일 — Wails v2 · Go · React + TS · Zustand. 새 의존성 없음.

**Base branch:** `feature/mqtt-insight-v1.1` (이미 체크아웃됨, 스펙 커밋 `c782c4f` 포함). main 직접 커밋 금지. 모든 커밋 트레일러: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

**Spec:** `docs/superpowers/specs/2026-07-02-mqtt-insight-v1.1-design.md`

---

## File Structure

**Backend**
- Modify: `internal/store/sqlite.go` — `Topics()` 추가 + `Query()`의 Timestamp 미설정 버그 수정
- Modify: `internal/store/sqlite_test.go` — Topics 테스트 + timestamp 회귀 테스트
- Modify: `internal/mqtt/message.go` — `ResponseTopic` 필드
- Modify: `internal/mqtt/v5.go` — Publish/수신 경로에 ResponseTopic 반영
- Modify: `app.go` — `QueryRecorded`, `RecordedTopics` 바인딩

**Frontend**
- Modify: `frontend/src/types.ts` — `Message.responseTopic`
- Modify: `frontend/src/store/appStore.ts` — `publishTopic`, `recording` Set
- Create: `frontend/src/components/ContextMenu.tsx`
- Modify: `frontend/src/components/TopicTree.tsx` — 컨텍스트 메뉴 통합
- Modify: `frontend/src/components/MessageList.tsx` — Live/Recorded 토글
- Modify: `frontend/src/components/PublishPanel.tsx` — v5 속성 접이식 섹션
- Modify: `frontend/src/components/MessageDetail.tsx` — responseTopic 표시
- Modify: `frontend/src/App.css` — 컨텍스트 메뉴/토글 스타일

**Docs**
- Create: `docs/MANUAL_TESTING.md`

---

## Task 1: SQLiteRecorder.Topics() + Query Timestamp 버그 수정 (TDD)

**Files:**
- Modify: `internal/store/sqlite.go`
- Test: `internal/store/sqlite_test.go`

- [ ] **Step 1: 실패하는 테스트 추가**

`internal/store/sqlite_test.go`에 append:

```go
func TestSQLiteRecorderTopics(t *testing.T) {
	path := filepath.Join(t.TempDir(), "rec.db")
	r, err := NewSQLiteRecorder(path)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer r.Close()

	if got := r.Topics(); len(got) != 0 {
		t.Fatalf("want empty, got %v", got)
	}
	r.Enable("a/b")
	r.Enable("c/d")
	r.Disable("a/b")
	got := r.Topics()
	if len(got) != 1 || got[0] != "c/d" {
		t.Fatalf("want [c/d], got %v", got)
	}
}

func TestSQLiteRecorderQueryPreservesTimestamp(t *testing.T) {
	path := filepath.Join(t.TempDir(), "rec.db")
	r, err := NewSQLiteRecorder(path)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer r.Close()

	want := time.Unix(1234, 567)
	r.Enable("t")
	r.Record(mqtt.Message{Topic: "t", Payload: []byte("x"), Timestamp: want})
	got, err := r.Query("t", 10)
	if err != nil {
		t.Fatalf("query: %v", err)
	}
	if len(got) != 1 || !got[0].Timestamp.Equal(want) {
		t.Fatalf("timestamp not preserved: %+v", got)
	}
}
```

- [ ] **Step 2: 실패 확인**

Run: `go test ./internal/store/ -run TestSQLiteRecorder -v`
Expected: FAIL — `r.Topics undefined` (컴파일 에러)

- [ ] **Step 3: 구현**

`internal/store/sqlite.go`의 `Disable` 메서드 아래에 추가:

```go
// Topics returns the topics currently enabled for recording.
func (r *SQLiteRecorder) Topics() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]string, 0, len(r.enabled))
	for t := range r.enabled {
		out = append(out, t)
	}
	return out
}
```

`Query` 메서드의 스캔 루프에서 `m.Retained = ret != 0` 다음 줄에 Timestamp 복원 추가:

```go
		m.Topic = topic
		m.Retained = ret != 0
		m.Timestamp = time.Unix(0, ts)
```

파일 상단 import에 `"time"` 추가.

- [ ] **Step 4: 통과 확인**

Run: `go test ./internal/store/ -run TestSQLiteRecorder -v && go test ./internal/store/ -race`
Expected: PASS (신규 2개 포함 전부)

- [ ] **Step 5: Commit**

```bash
git add internal/store/sqlite.go internal/store/sqlite_test.go
git commit -m "feat: add SQLiteRecorder.Topics and fix Query dropping timestamps

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: Message.ResponseTopic + v5 경로 반영 (TDD)

**Files:**
- Modify: `internal/mqtt/message.go`
- Modify: `internal/mqtt/v5.go`
- Test: `internal/mqtt/message_test.go`

- [ ] **Step 1: 실패하는 테스트 추가**

`internal/mqtt/message_test.go`에 append:

```go
func TestMessageResponseTopicJSON(t *testing.T) {
	b, err := json.Marshal(Message{Topic: "a", ResponseTopic: "replies/a"})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if !strings.Contains(string(b), `"responseTopic":"replies/a"`) {
		t.Fatalf("responseTopic not serialized: %s", b)
	}
	// omitted when empty
	b, _ = json.Marshal(Message{Topic: "a"})
	if strings.Contains(string(b), "responseTopic") {
		t.Fatalf("empty responseTopic must be omitted: %s", b)
	}
}
```

파일 상단 import를 `import ("encoding/json"; "strings"; "testing")` 형태로 갱신.

- [ ] **Step 2: 실패 확인**

Run: `go test ./internal/mqtt/ -run TestMessageResponseTopic -v`
Expected: FAIL — `unknown field ResponseTopic`

- [ ] **Step 3: 필드 추가**

`internal/mqtt/message.go`의 `Message` 구조체에서 `ContentType` 줄 아래에 추가:

```go
	ResponseTopic string       `json:"responseTopic,omitempty"` // v5
```

- [ ] **Step 4: v5 경로 반영**

`internal/mqtt/v5.go` — 두 곳 수정:

(a) `OnPublishReceived` 콜백의 `if p.Properties != nil {` 블록에서 `msg.ContentType = p.Properties.ContentType` 다음 줄에 추가:

```go
						msg.ResponseTopic = p.Properties.ResponseTopic
```

(b) `Publish` 메서드의 속성 빌드 조건과 본문을 아래로 교체 (기존: `if m.ContentType != "" || len(m.UserProps) > 0 {` 블록):

```go
	if m.ContentType != "" || m.ResponseTopic != "" || len(m.UserProps) > 0 {
		props := &paho.PublishProperties{ContentType: m.ContentType, ResponseTopic: m.ResponseTopic}
		for _, up := range m.UserProps {
			props.User = append(props.User, paho.UserProperty{Key: up.Key, Value: up.Value})
		}
		pub.Properties = props
	}
```

- [ ] **Step 5: 통과 확인**

Run: `go test ./internal/mqtt/ -v && go build ./...`
Expected: 전부 PASS, 빌드 성공

- [ ] **Step 6: Commit**

```bash
git add internal/mqtt/message.go internal/mqtt/message_test.go internal/mqtt/v5.go
git commit -m "feat: add ResponseTopic to Message and wire v5 publish/receive

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: app.go 바인딩 + Wails 바인딩 재생성

**Files:**
- Modify: `app.go`
- Regenerate: `frontend/wailsjs/**`

- [ ] **Step 1: 바인딩 추가**

`app.go` 파일 끝(`DisableRecording` 아래)에 추가:

```go
// QueryRecorded returns up to `limit` most-recent recorded messages for a topic.
func (a *App) QueryRecorded(topic string, limit int) []mqtt.Message {
	if a.recorder == nil {
		return nil
	}
	msgs, err := a.recorder.Query(topic, limit)
	if err != nil {
		return nil
	}
	return msgs
}

// RecordedTopics returns the topics currently being recorded.
func (a *App) RecordedTopics() []string {
	if a.recorder == nil {
		return nil
	}
	return a.recorder.Topics()
}
```

> 스펙 §4는 `QueryRecorded`가 error를 반환한다고 했으나, 에러 처리 정책(§6)이 "실패 시 빈 리스트"이므로 바인딩에서 nil로 흡수한다 — 프론트 호출부가 단순해진다.

- [ ] **Step 2: 빌드로 바인딩 재생성 + 확인**

Run: `wails build -clean`
Expected: 성공. `frontend/wailsjs/go/main/App.d.ts`에 `QueryRecorded`, `RecordedTopics` 노출, `frontend/wailsjs/go/models.ts`의 `mqtt.Message`에 `responseTopic?` 존재.

- [ ] **Step 3: 테스트 확인**

Run: `go test ./...`
Expected: 전부 PASS

- [ ] **Step 4: Commit**

```bash
git add app.go frontend/wailsjs
git commit -m "feat: expose QueryRecorded and RecordedTopics bindings

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 4: 프론트엔드 타입 + 스토어 확장

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/store/appStore.ts`

- [ ] **Step 1: types.ts에 responseTopic 추가**

`Message` 인터페이스에서 `contentType?: string;` 아래에 추가:

```ts
  responseTopic?: string;
```

- [ ] **Step 2: appStore 확장**

`frontend/src/store/appStore.ts`를 아래 전체 내용으로 교체:

```ts
import { create } from "zustand";
import type { Message, TreeNode, Status } from "../types";

interface AppState {
  status: Status;
  statusText: string;
  tree: TreeNode | null;
  selectedTopic: string | null;
  paused: boolean;
  liveMessages: Message[];
  publishTopic: string | null;
  recording: Set<string>;
  setStatus: (s: Status, text?: string) => void;
  setTree: (t: TreeNode) => void;
  selectTopic: (t: string | null) => void;
  togglePaused: () => void;
  pushMessages: (ms: Message[]) => void;
  clear: () => void;
  setPublishTopic: (t: string | null) => void;
  setRecordingTopics: (topics: string[]) => void;
  toggleRecordingTopic: (topic: string) => void;
}

const MAX_LIVE = 500;

export const useAppStore = create<AppState>((set, get) => ({
  status: "disconnected",
  statusText: "",
  tree: null,
  selectedTopic: null,
  paused: false,
  liveMessages: [],
  publishTopic: null,
  recording: new Set<string>(),
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
  setPublishTopic: (t) => set({ publishTopic: t }),
  setRecordingTopics: (topics) => set({ recording: new Set(topics) }),
  toggleRecordingTopic: (topic) => {
    const next = new Set(get().recording);
    if (next.has(topic)) next.delete(topic);
    else next.add(topic);
    set({ recording: next });
  },
}));
```

- [ ] **Step 3: 컴파일 확인**

Run: `cd frontend && npx tsc --noEmit`
Expected: 클린

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types.ts frontend/src/store/appStore.ts
git commit -m "feat: add publishTopic and recording state to app store

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 5: ContextMenu 컴포넌트

**Files:**
- Create: `frontend/src/components/ContextMenu.tsx`
- Modify: `frontend/src/App.css`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
// frontend/src/components/ContextMenu.tsx
import { useEffect, useRef } from "react";

export interface MenuItem {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

/** Dependency-free context menu rendered at (x, y). Closes on outside click or Escape. */
export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div ref={ref} className="context-menu" style={{ left: x, top: y }}>
      {items.map((it) => (
        <button
          key={it.label}
          disabled={it.disabled}
          onClick={() => {
            it.onClick();
            onClose();
          }}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: App.css에 스타일 추가**

파일 끝에 append:

```css
.context-menu { position: fixed; z-index: 1000; background: var(--panel); border: 1px solid var(--border); border-radius: 6px; padding: 4px; display: flex; flex-direction: column; min-width: 170px; box-shadow: 0 4px 16px rgba(0,0,0,.35); }
.context-menu button { background: none; color: var(--text); text-align: left; padding: 6px 10px; border-radius: 4px; }
.context-menu button:hover:not(:disabled) { background: var(--accent); color: #fff; }
.context-menu button:disabled { opacity: .4; cursor: default; }
```

- [ ] **Step 3: 컴파일 확인**

Run: `cd frontend && npx tsc --noEmit`
Expected: 클린

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ContextMenu.tsx frontend/src/App.css
git commit -m "feat: add dependency-free ContextMenu component

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 6: TopicTree 컨텍스트 메뉴 통합

**Files:**
- Modify: `frontend/src/components/TopicTree.tsx`

- [ ] **Step 1: TopicTree.tsx 전체 교체**

```tsx
import { useEffect, useMemo, useState } from "react";
import { Tree, NodeApi } from "react-arborist";
import { useAppStore } from "../store/appStore";
import { bytesToString } from "../lib/payload";
import type { TreeNode } from "../types";
import { Subscribe, Unsubscribe, Publish, EnableRecording, DisableRecording, RecordedTopics } from "../../wailsjs/go/main/App";
import { mqtt } from "../../wailsjs/go/models";
import { ContextMenu, type MenuItem } from "./ContextMenu";

interface ArboristNode { id: string; name: string; count: number; preview: string; retained: boolean; children?: ArboristNode[]; }

function toArborist(node: TreeNode | undefined): ArboristNode[] {
  if (!node?.children) return [];
  return node.children.map((c) => ({
    id: c.fullTopic,
    name: c.name,
    count: c.messageCount,
    preview: c.lastPayload ? bytesToString(c.lastPayload).slice(0, 40) : "",
    retained: c.retained,
    children: c.children ? toArborist(c) : undefined,
  }));
}

/** Delete a retained message by publishing an empty retained payload. */
function deleteRetained(topic: string) {
  const m = mqtt.Message.createFrom({ topic, qos: 0, retained: true, timestamp: new Date().toISOString() });
  (m as unknown as { payload: string }).payload = ""; // empty base64 -> empty []byte
  return Publish(m);
}

export function TopicTree() {
  const tree = useAppStore((s) => s.tree);
  const selectTopic = useAppStore((s) => s.selectTopic);
  const setPublishTopic = useAppStore((s) => s.setPublishTopic);
  const recording = useAppStore((s) => s.recording);
  const setRecordingTopics = useAppStore((s) => s.setRecordingTopics);
  const toggleRecordingTopic = useAppStore((s) => s.toggleRecordingTopic);
  const [filter, setFilter] = useState("");
  const [menu, setMenu] = useState<{ x: number; y: number; node: ArboristNode } | null>(null);
  const data = useMemo(() => toArborist(tree ?? undefined), [tree]);

  // Backend owns recording state; initialize the frontend set on mount.
  useEffect(() => {
    RecordedTopics().then((ts) => setRecordingTopics(ts || []));
  }, [setRecordingTopics]);

  function menuItems(n: ArboristNode): MenuItem[] {
    const isRec = recording.has(n.id);
    const items: MenuItem[] = [
      { label: "이 토픽에 발행", onClick: () => setPublishTopic(n.id) },
      { label: "Unsubscribe", onClick: () => Unsubscribe(n.id) },
    ];
    if (n.retained) {
      items.push({ label: "Retained 삭제", onClick: () => deleteRetained(n.id) });
    }
    items.push({
      label: isRec ? "기록 끄기" : "기록 켜기",
      onClick: () => {
        if (isRec) DisableRecording(n.id);
        else EnableRecording(n.id);
        toggleRecordingTopic(n.id);
      },
    });
    return items;
  }

  return (
    <div className="topic-tree">
      <div className="tree-toolbar">
        <input placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <button title="Subscribe to #" onClick={() => Subscribe("#", 0)}>Sub #</button>
      </div>
      <Tree
        data={data}
        searchTerm={filter}
        openByDefault={false}
        width="100%"
        height={600}
        rowHeight={26}
        onSelect={(nodes: NodeApi<ArboristNode>[]) => nodes[0] && selectTopic(nodes[0].id)}
      >
        {({ node, style, dragHandle }) => (
          <div
            style={style}
            ref={dragHandle}
            className="tree-row"
            onClick={() => node.toggle()}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ x: e.clientX, y: e.clientY, node: node.data });
            }}
          >
            {recording.has(node.data.id) && <span className="rec-dot" title="recording">●</span>}
            <span className="tree-name">{node.data.name}</span>
            {node.data.count > 0 && <span className="tree-count">{node.data.count}</span>}
            {node.data.preview && <span className="tree-preview">{node.data.preview}</span>}
          </div>
        )}
      </Tree>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.node)} onClose={() => setMenu(null)} />}
    </div>
  );
}
```

- [ ] **Step 2: 컴파일 확인**

Run: `cd frontend && npx tsc --noEmit`
Expected: 클린

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/TopicTree.tsx
git commit -m "feat: replace right-click record toggle with full context menu

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 7: MessageList Live/Recorded 토글

**Files:**
- Modify: `frontend/src/components/MessageList.tsx`
- Modify: `frontend/src/App.css`

- [ ] **Step 1: MessageList.tsx 전체 교체**

```tsx
import { useEffect, useState } from "react";
import { FixedSizeList } from "react-window";
import { useAppStore } from "../store/appStore";
import { History, QueryRecorded } from "../../wailsjs/go/main/App";
import { bytesToString } from "../lib/payload";
import { MessageDetail } from "./MessageDetail";
import type { Message } from "../types";

type Source = "live" | "recorded";

export function MessageList() {
  const selectedTopic = useAppStore((s) => s.selectedTopic);
  const liveMessages = useAppStore((s) => s.liveMessages);
  const paused = useAppStore((s) => s.paused);
  const togglePaused = useAppStore((s) => s.togglePaused);
  const clear = useAppStore((s) => s.clear);
  const recording = useAppStore((s) => s.recording);
  const [history, setHistory] = useState<Message[]>([]);
  const [recorded, setRecorded] = useState<Message[]>([]);
  const [selected, setSelected] = useState<Message | null>(null);
  const [source, setSource] = useState<Source>("live");

  const isRecorded = !!selectedTopic && recording.has(selectedTopic);

  // Topic change resets to live view.
  useEffect(() => {
    setSource("live");
    setRecorded([]);
  }, [selectedTopic]);

  useEffect(() => {
    if (!selectedTopic) { setHistory([]); return; }
    History(selectedTopic).then((h) => setHistory((h || []) as unknown as Message[]));
  }, [selectedTopic, liveMessages]);

  function loadRecorded() {
    if (!selectedTopic) return;
    // Backend returns newest-first; renderer expects ascending rows.
    QueryRecorded(selectedTopic, 500).then((r) =>
      setRecorded(((r || []) as unknown as Message[]).slice().reverse()),
    );
  }

  useEffect(() => {
    if (source === "recorded") loadRecorded();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  // For a selected topic, the backend ring buffer (History) is authoritative and already
  // includes live messages; for no selection, show the cross-topic live stream.
  const rows = source === "recorded" ? recorded : selectedTopic ? history : liveMessages;

  return (
    <div className="msg-list">
      <div className="msg-toolbar">
        <span>{selectedTopic || "All topics (live)"}</span>
        {isRecorded && (
          <span className="src-toggle">
            <button className={source === "live" ? "on" : ""} onClick={() => setSource("live")}>Live</button>
            <button className={source === "recorded" ? "on" : ""} onClick={() => setSource("recorded")}>Recorded</button>
          </span>
        )}
        {source === "recorded" ? (
          <button onClick={loadRecorded}>Refresh</button>
        ) : (
          <>
            <button onClick={togglePaused}>{paused ? "Resume" : "Pause"}</button>
            <button onClick={clear}>Clear</button>
          </>
        )}
      </div>
      <div className="msg-split">
        {rows.length === 0 && source === "recorded" ? (
          <div className="meta">no recorded messages</div>
        ) : (
          <FixedSizeList height={300} width={"100%"} itemCount={rows.length} itemSize={22}>
            {({ index, style }: { index: number; style: React.CSSProperties }) => {
              const m = rows[rows.length - 1 - index];
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
        )}
        {selected && <MessageDetail key={`${selected.topic}-${selected.timestamp}`} msg={selected} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: App.css에 토글 스타일 추가**

파일 끝에 append:

```css
.src-toggle { display: flex; gap: 2px; }
.src-toggle button { background: var(--border); }
.src-toggle button.on { background: var(--accent); }
```

- [ ] **Step 3: 컴파일 확인**

Run: `cd frontend && npx tsc --noEmit`
Expected: 클린

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/MessageList.tsx frontend/src/App.css
git commit -m "feat: add Live/Recorded source toggle to message list

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 8: PublishPanel v5 속성 + MessageDetail responseTopic 표시

**Files:**
- Modify: `frontend/src/components/PublishPanel.tsx`
- Modify: `frontend/src/components/MessageDetail.tsx`
- Modify: `frontend/src/App.css`

- [ ] **Step 1: PublishPanel.tsx 전체 교체**

```tsx
import { useEffect, useState } from "react";
import { Publish } from "../../wailsjs/go/main/App";
import { mqtt } from "../../wailsjs/go/models";
import { useAppStore } from "../store/appStore";

// Go []byte is unmarshaled from a base64 STRING over the wire, so encode payload to base64.
function toBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

interface UserProp { key: string; value: string; }

export function PublishPanel() {
  const selectedTopic = useAppStore((s) => s.selectedTopic);
  const publishTopic = useAppStore((s) => s.publishTopic);
  const setPublishTopic = useAppStore((s) => s.setPublishTopic);
  const [topic, setTopic] = useState("");
  const [payload, setPayload] = useState("");
  const [qos, setQos] = useState(0);
  const [retained, setRetained] = useState(false);
  const [showProps, setShowProps] = useState(false);
  const [contentType, setContentType] = useState("");
  const [responseTopic, setResponseTopic] = useState("");
  const [userProps, setUserProps] = useState<UserProp[]>([]);

  // "이 토픽에 발행" from the tree context menu fills the topic input.
  useEffect(() => {
    if (publishTopic) {
      setTopic(publishTopic);
      setPublishTopic(null);
    }
  }, [publishTopic, setPublishTopic]);

  async function publish() {
    const t = topic || selectedTopic || "";
    if (!t) return;
    const props = userProps.filter((p) => p.key !== "");
    const m = mqtt.Message.createFrom({
      topic: t,
      qos,
      retained,
      timestamp: new Date().toISOString(),
      ...(contentType ? { contentType } : {}),
      ...(responseTopic ? { responseTopic } : {}),
      ...(props.length ? { userProps: props } : {}),
    });
    (m as unknown as { payload: string }).payload = toBase64(payload);
    await Publish(m);
  }

  function updProp(i: number, k: keyof UserProp, v: string) {
    setUserProps(userProps.map((p, idx) => (idx === i ? { ...p, [k]: v } : p)));
  }

  return (
    <div className="publish-panel">
      <div className="pub-row">
        <input placeholder={selectedTopic || "topic"} value={topic} onChange={(e) => setTopic(e.target.value)} />
        <select value={qos} onChange={(e) => setQos(+e.target.value)}>
          <option value={0}>QoS 0</option><option value={1}>QoS 1</option><option value={2}>QoS 2</option>
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <input type="checkbox" checked={retained} onChange={(e) => setRetained(e.target.checked)} /> retain
        </label>
        <button onClick={publish}>Publish</button>
      </div>
      <button className="props-toggle" onClick={() => setShowProps(!showProps)}>
        {showProps ? "▾" : "▸"} MQTT 5.0 Properties
      </button>
      {showProps && (
        <div className="props-section">
          <div className="meta">5.0 연결 전용 — 3.1.1에서는 무시됩니다</div>
          <div className="pub-row">
            <input placeholder="content-type" value={contentType} onChange={(e) => setContentType(e.target.value)} />
            <input placeholder="response topic" value={responseTopic} onChange={(e) => setResponseTopic(e.target.value)} />
          </div>
          {userProps.map((p, i) => (
            <div className="pub-row" key={i}>
              <input placeholder="key" value={p.key} onChange={(e) => updProp(i, "key", e.target.value)} />
              <input placeholder="value" value={p.value} onChange={(e) => updProp(i, "value", e.target.value)} />
              <button onClick={() => setUserProps(userProps.filter((_, idx) => idx !== i))}>✕</button>
            </div>
          ))}
          <button onClick={() => setUserProps([...userProps, { key: "", value: "" }])}>+ user property</button>
        </div>
      )}
      <textarea placeholder="payload" value={payload} onChange={(e) => setPayload(e.target.value)} />
    </div>
  );
}
```

- [ ] **Step 2: MessageDetail에 responseTopic 표시**

`frontend/src/components/MessageDetail.tsx`에서 `{msg.contentType && ...}` 줄 아래에 추가:

```tsx
      {msg.responseTopic && <div className="meta">response-topic: {msg.responseTopic}</div>}
```

- [ ] **Step 3: App.css에 스타일 추가**

파일 끝에 append:

```css
.props-toggle { background: none; color: var(--text); text-align: left; padding: 2px 0; font-size: 12px; }
.props-section { display: flex; flex-direction: column; gap: 4px; }
.props-section input { flex: 1; background: var(--bg); border: 1px solid var(--border); color: var(--text); padding: 4px; border-radius: 4px; }
```

- [ ] **Step 4: 컴파일 확인**

Run: `cd frontend && npx tsc --noEmit`
Expected: 클린

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/PublishPanel.tsx frontend/src/components/MessageDetail.tsx frontend/src/App.css
git commit -m "feat: add collapsible MQTT 5.0 properties to publish panel

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 9: MANUAL_TESTING.md + 최종 검증

**Files:**
- Create: `docs/MANUAL_TESTING.md`

- [ ] **Step 1: 체크리스트 문서 작성**

`docs/MANUAL_TESTING.md`:

```markdown
# mqtt-insight 수동 E2E 체크리스트

릴리스/머지 전 실제 GUI로 확인하는 시나리오. 로컬 브로커 준비:

​```bash
docker run -d --name mosq -p 1883:1883 eclipse-mosquitto:2 \
  sh -c "printf 'listener 1883\nallow_anonymous true\n' > /mosquitto/config/mosquitto.conf && exec mosquitto -c /mosquitto/config/mosquitto.conf"
​```

앱 실행: `wails dev` (또는 `wails build` 후 `open build/bin/mqtt-insight.app`)

## 연결
- [ ] Connect… → localhost:1883, Version 5.0 → Connect → 상단 점 초록/“Connected”
- [ ] Disconnect → “Disconnected” → Version 3.1.1로 재연결 성공
- [ ] 잘못된 포트(예: 1999)로 연결 → 실패 사유 표시, 앱 정상 동작

## 구독 · 트리
- [ ] “Sub #” 클릭 후 `docker exec mosq mosquitto_pub -t sensors/room1/temp -m 23.4 -r -q 1`
- [ ] 트리에 `sensors/room1/temp` 계층 생성, 카운트/미리보기/retained 표시
- [ ] 필터 입력 시 트리 검색 동작

## 컨텍스트 메뉴 (우클릭)
- [ ] “이 토픽에 발행” → 발행 패널 topic 입력이 해당 토픽으로 채워짐
- [ ] “기록 켜기” → ● 표시 / 다시 “기록 끄기” → ● 사라짐
- [ ] retained 노드에서 “Retained 삭제” → 브로커 재구독 시 해당 retained 미수신
- [ ] “Unsubscribe” → 이후 해당 토픽 발행이 수신되지 않음 (# 재구독으로 복구)
- [ ] 메뉴 밖 클릭/Esc로 닫힘

## 메시지 뷰
- [ ] 토픽 선택 → 히스토리 표시(중복 없음), 메시지 클릭 → 상세
- [ ] 포맷 전환 plain/json/hex/base64 동작, JSON payload 자동 감지
- [ ] 다른 메시지 선택 시 포맷 자동 재감지
- [ ] Pause 중 수신 멈춤 → Resume 후 재개, Clear 동작

## Recorded 뷰
- [ ] 기록 켠 토픽에 메시지 여러 개 발행 → Live/Recorded 토글 표시됨
- [ ] Recorded 전환 → 기록된 메시지 표시(타임스탬프 정상), Refresh 동작
- [ ] 기록 안 켠 토픽에서는 토글 미표시
- [ ] 앱 재시작 후에도 기록 토픽에 ● 표시 유지(RecordedTopics 초기화)

## 발행 + v5 속성
- [ ] 기본 발행(topic/payload/QoS/retain) → 수신 반영
- [ ] “MQTT 5.0 Properties” 펼침 → content-type/response topic/user property 입력 후 발행
- [ ] 수신 메시지 상세에 content-type/response-topic/user property 표시 (5.0 연결)

## 설정
- [ ] 테마 dark ↔ light 전환 즉시 반영, 재시작 후 유지

정리: `docker rm -f mosq`
```

(주의: 위 코드펜스의 `​``` `는 실제 파일에서는 일반 ``` 로 작성)

- [ ] **Step 2: 인코딩 확인**

Run: `file -I docs/MANUAL_TESTING.md`
Expected: `charset=utf-8`

- [ ] **Step 3: 최종 검증**

```bash
cd /Users/user/GolandProjects/mqtt-insight
go test ./... && go test -race ./internal/...
cd frontend && npx vitest run && npx tsc --noEmit
cd .. && wails build -clean
```
Expected: 전부 PASS / 빌드 성공

- [ ] **Step 4: Commit**

```bash
git add docs/MANUAL_TESTING.md
git commit -m "docs: add manual E2E testing checklist

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review 결과

**Spec coverage:**
- §4 백엔드(Topics/QueryRecorded/RecordedTopics/ResponseTopic) → Task 1, 2, 3 ✅ (+ Query timestamp 버그 수정 보너스)
- §5.1 ContextMenu → Task 5 ✅
- §5.2 TopicTree 메뉴 4항목 + RecordedTopics 초기화 → Task 6 ✅
- §5.3 Live/Recorded 토글 + 새로고침 + 정렬 → Task 7 ✅
- §5.4 발행 v5 속성(접이식, 힌트) → Task 8 ✅
- §5.5 스토어(publishTopic/recording) → Task 4 ✅
- §6 에러 처리(빈 결과 텍스트, nil recorder) → Task 3(nil 가드), Task 7("no recorded messages") ✅
- §7 테스트/문서 → Task 1, 2(단위), Task 9(체크리스트) ✅

**의도적 편차 1건:** `QueryRecorded` 바인딩이 스펙의 `(msgs, error)` 대신 `[]mqtt.Message`만 반환(에러를 빈 결과로 흡수) — §6 에러 정책과 일치하며 Task 3에 사유 명시.

**Placeholder scan:** 없음. **Type consistency:** `RecordedTopics()[]string`↔`setRecordingTopics(string[])`, `QueryRecorded(topic, 500)`↔바인딩 시그니처, `MenuItem` export↔Task 6 import 일치 확인.
