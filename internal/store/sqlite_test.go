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
