package mqtt

import "time"

// UserProperty is an MQTT 5.0 user property key/value pair.
type UserProperty struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

// Message is a version-agnostic representation of a received or published MQTT message.
type Message struct {
	Topic         string         `json:"topic"`
	Payload       []byte         `json:"payload"`
	QoS           byte           `json:"qos"`
	Retained      bool           `json:"retained"`
	Timestamp     time.Time      `json:"timestamp"`
	ContentType   string         `json:"contentType,omitempty"`   // v5
	ResponseTopic string         `json:"responseTopic,omitempty"` // v5
	UserProps     []UserProperty `json:"userProps,omitempty"`     // v5
}

// SizeBytes returns the payload size in bytes.
func (m Message) SizeBytes() int { return len(m.Payload) }
