package mqtt

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestMessageSizeBytes(t *testing.T) {
	m := Message{Topic: "a/b", Payload: []byte("hello")}
	if m.SizeBytes() != 5 {
		t.Fatalf("want 5, got %d", m.SizeBytes())
	}
}

func TestMessageResponseTopicJSON(t *testing.T) {
	b, err := json.Marshal(Message{Topic: "a", ResponseTopic: "replies/a"})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if !strings.Contains(string(b), `"responseTopic":"replies/a"`) {
		t.Fatalf("responseTopic not serialized: %s", b)
	}
	b, _ = json.Marshal(Message{Topic: "a"})
	if strings.Contains(string(b), "responseTopic") {
		t.Fatalf("empty responseTopic must be omitted: %s", b)
	}
}
