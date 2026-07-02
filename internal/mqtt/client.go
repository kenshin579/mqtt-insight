package mqtt

import (
	"context"
	"fmt"
)

// ConnectionConfig is the version-agnostic connection input.
type ConnectionConfig struct {
	Host          string
	Port          int
	Transport     string // tcp | tls | ws | wss
	Version       string // 3.1.1 | 5.0
	ClientID      string
	Username      string
	Password      string
	KeepAlive     int
	CleanSession  bool
	AutoReconnect bool
	CACertPath    string
	UseSystemCAs  bool
	SkipVerify    bool
	WSPath        string
	WillTopic     string
	WillPayload   string
	WillQoS       byte
	WillRetained  bool
}

// BrokerURL builds the scheme://host:port[/path] URL from the config.
func (c ConnectionConfig) BrokerURL() string {
	scheme := map[string]string{"tcp": "tcp", "tls": "ssl", "ws": "ws", "wss": "wss"}[c.Transport]
	url := fmt.Sprintf("%s://%s:%d", scheme, c.Host, c.Port)
	if (c.Transport == "ws" || c.Transport == "wss") && c.WSPath != "" {
		url += c.WSPath
	}
	return url
}

// Subscription describes one topic subscription.
type Subscription struct {
	Topic string
	QoS   byte
}

// Callbacks are event hooks the client invokes.
type Callbacks struct {
	OnMessage        func(Message)
	OnConnect        func()
	OnConnectionLost func(error)
}

// MQTTClient abstracts a version-specific MQTT connection.
type MQTTClient interface {
	Connect(ctx context.Context, cfg ConnectionConfig, cb Callbacks) error
	Subscribe(sub Subscription) error
	Unsubscribe(topic string) error
	Publish(m Message) error
	Disconnect() error
}
