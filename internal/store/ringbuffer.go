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
