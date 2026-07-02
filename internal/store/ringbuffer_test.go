package store

import (
	"testing"
	"time"

	"github.com/kenshin579/mqtt-insight/internal/mqtt"
)

func TestRingBufferKeepsLastN(t *testing.T) {
	rb := NewRingBuffer(3)
	for i := 0; i < 5; i++ {
		rb.Append("a/b", mqtt.Message{Topic: "a/b", Payload: []byte{byte('0' + i)}, Timestamp: time.Unix(int64(i), 0)})
	}
	got := rb.Get("a/b")
	if len(got) != 3 {
		t.Fatalf("want 3 messages, got %d", len(got))
	}
	if string(got[0].Payload) != "2" || string(got[2].Payload) != "4" {
		t.Fatalf("unexpected order: %s..%s", got[0].Payload, got[2].Payload)
	}
}

func TestRingBufferPerTopicIsolation(t *testing.T) {
	rb := NewRingBuffer(10)
	rb.Append("a", mqtt.Message{Topic: "a"})
	rb.Append("b", mqtt.Message{Topic: "b"})
	if len(rb.Get("a")) != 1 || len(rb.Get("b")) != 1 {
		t.Fatal("topics must not share buffers")
	}
	if len(rb.Get("missing")) != 0 {
		t.Fatal("unknown topic must return empty slice")
	}
}
