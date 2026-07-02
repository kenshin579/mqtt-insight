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
