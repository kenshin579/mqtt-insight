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
