package mqtt

import "testing"

func TestMessageSizeBytes(t *testing.T) {
	m := Message{Topic: "a/b", Payload: []byte("hello")}
	if m.SizeBytes() != 5 {
		t.Fatalf("want 5, got %d", m.SizeBytes())
	}
}
