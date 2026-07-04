package store

import "github.com/kenshin579/mqtt-insight/internal/mqtt"

// MessageStore is the abstraction the app depends on. Swappable for v2 persistence.
type MessageStore interface {
	Record(m mqtt.Message)
	History(topic string) []mqtt.Message
	TreeSnapshot() *Node
	Clear()
	SetCapacity(n int)
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

// SetCapacity changes the per-topic ring buffer cap immediately.
func (s *MemoryStore) SetCapacity(n int) { s.ring.SetCapacity(n) }
