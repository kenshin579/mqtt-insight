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

func TestMemoryStoreIsolatesPayloadBytes(t *testing.T) {
	s := NewMemoryStore(5)
	orig := []byte("abc")
	s.Record(mqtt.Message{Topic: "t", Payload: orig, Timestamp: time.Unix(1, 0)})

	orig[0] = 'X' // mutate caller's buffer after recording

	if got := s.History("t"); string(got[0].Payload) != "abc" {
		t.Fatalf("history payload corrupted by caller mutation: got %s", got[0].Payload)
	}
	leaf := s.TreeSnapshot().Children[0]
	if leaf.Preview != "abc" {
		t.Fatalf("tree preview corrupted by caller mutation: got %q", leaf.Preview)
	}

	s.History("t")[0].Payload[0] = 'Y' // mutate returned copy; store must be unaffected
	if got := s.History("t"); string(got[0].Payload) != "abc" {
		t.Fatalf("history payload corrupted by mutating returned copy: got %s", got[0].Payload)
	}
}

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
