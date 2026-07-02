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
