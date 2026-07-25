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

func TestRingBufferSetCapacityTrims(t *testing.T) {
	rb := NewRingBuffer(10)
	for i := 0; i < 10; i++ {
		rb.Append("t", mqtt.Message{Topic: "t", Payload: []byte{byte('0' + i)}})
	}
	rb.SetCapacity(3)
	got := rb.Get("t")
	if len(got) != 3 || string(got[0].Payload) != "7" {
		t.Fatalf("want last 3 (7..9), got %v", got)
	}
	// future appends respect new cap
	rb.Append("t", mqtt.Message{Topic: "t", Payload: []byte("x")})
	if len(rb.Get("t")) != 3 {
		t.Fatal("cap not applied to new appends")
	}
}

func TestGetSubtreeMergesChronologically(t *testing.T) {
	rb := NewRingBuffer(10)
	rb.Append("a/b/x", mqtt.Message{Topic: "a/b/x", Payload: []byte("1"), Timestamp: time.Unix(1, 0)})
	rb.Append("a/b/y", mqtt.Message{Topic: "a/b/y", Payload: []byte("2"), Timestamp: time.Unix(2, 0)})
	rb.Append("a/b/x", mqtt.Message{Topic: "a/b/x", Payload: []byte("3"), Timestamp: time.Unix(3, 0)})

	got := rb.GetSubtree("a/b", 10)
	if len(got) != 3 {
		t.Fatalf("want 3 merged messages, got %d", len(got))
	}
	if string(got[0].Payload) != "1" || string(got[1].Payload) != "2" || string(got[2].Payload) != "3" {
		t.Fatalf("want ascending 1,2,3, got %s,%s,%s", got[0].Payload, got[1].Payload, got[2].Payload)
	}
}

func TestGetSubtreeEnforcesSeparator(t *testing.T) {
	rb := NewRingBuffer(10)
	rb.Append("a/robot", mqtt.Message{Topic: "a/robot", Timestamp: time.Unix(1, 0)})
	rb.Append("a/robot2", mqtt.Message{Topic: "a/robot2", Timestamp: time.Unix(2, 0)})
	rb.Append("a/robot/x", mqtt.Message{Topic: "a/robot/x", Timestamp: time.Unix(3, 0)})

	got := rb.GetSubtree("a/robot", 10)
	if len(got) != 2 {
		t.Fatalf("want exact topic + descendants only, got %d", len(got))
	}
	for _, m := range got {
		if m.Topic == "a/robot2" {
			t.Fatal("a/robot2 must not match focus a/robot")
		}
	}
}

func TestGetSubtreeKeepsNewestWithinLimit(t *testing.T) {
	rb := NewRingBuffer(10)
	for i := 0; i < 6; i++ {
		rb.Append("t/a", mqtt.Message{Topic: "t/a", Payload: []byte{byte('0' + i)}, Timestamp: time.Unix(int64(i), 0)})
	}
	got := rb.GetSubtree("t", 2)
	if len(got) != 2 || string(got[0].Payload) != "4" || string(got[1].Payload) != "5" {
		t.Fatalf("want newest two (4,5), got %v", got)
	}
}

func TestGetSubtreeRejectsEmptyPrefix(t *testing.T) {
	rb := NewRingBuffer(10)
	rb.Append("a", mqtt.Message{Topic: "a"})
	if got := rb.GetSubtree("", 10); got != nil {
		t.Fatalf("empty prefix must return nil, got %d messages", len(got))
	}
}

func TestGetSubtreeIsolatesPayloadBytes(t *testing.T) {
	rb := NewRingBuffer(10)
	rb.Append("a/b", mqtt.Message{Topic: "a/b", Payload: []byte("abc"), Timestamp: time.Unix(1, 0)})
	rb.GetSubtree("a", 10)[0].Payload[0] = 'X'
	if got := rb.GetSubtree("a", 10); string(got[0].Payload) != "abc" {
		t.Fatalf("store corrupted by mutating returned copy: got %s", got[0].Payload)
	}
}
