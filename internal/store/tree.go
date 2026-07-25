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
	Preview      string    `json:"preview,omitempty"`
	LastSeen     time.Time `json:"lastSeen"`
	Retained     bool      `json:"retained"`

	childIndex map[string]*Node // internal, not serialized
}

// Tree is a thread-safe aggregating topic tree.
type Tree struct {
	mu       sync.RWMutex
	root     *Node
	revision uint64
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
	cur.MessageCount++
	cur.Preview = previewOf(m.Payload)
	cur.LastSeen = m.Timestamp
	cur.Retained = m.Retained
	t.revision++
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
		Preview: n.Preview, LastSeen: n.LastSeen, Retained: n.Retained,
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
	t.revision++
}

// Revision increments on every mutation. The emitter compares it against the
// last emitted value so an unchanged tree is never re-serialized.
func (t *Tree) Revision() uint64 {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return t.revision
}
