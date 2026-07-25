package store

import (
	"sort"
	"strings"
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
	m.Payload = append([]byte(nil), m.Payload...)
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
	for i := range out {
		out[i].Payload = append([]byte(nil), out[i].Payload...)
	}
	return out
}

// SetCapacity changes the per-topic cap immediately, trimming existing buffers.
func (r *RingBuffer) SetCapacity(capacity int) {
	if capacity < 1 {
		capacity = 1
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.capacity = capacity
	for topic, buf := range r.byTopic {
		if len(buf) > capacity {
			r.byTopic[topic] = buf[len(buf)-capacity:]
		}
	}
}

// Clear removes all buffered messages.
func (r *RingBuffer) Clear() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.byTopic = map[string][]mqtt.Message{}
}

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
