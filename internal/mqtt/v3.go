package mqtt

import (
	"context"
	"fmt"
	"sync"
	"time"

	paho3 "github.com/eclipse/paho.mqtt.golang"
)

// v3Client implements MQTTClient over MQTT 3.1.1.
type v3Client struct {
	client paho3.Client
	cb     Callbacks
	mu     sync.Mutex
	subs   []Subscription // remembered so reconnect can re-apply
}

func newV3Client() *v3Client { return &v3Client{} }

func (v *v3Client) emit(m paho3.Message) {
	if v.cb.OnMessage != nil {
		v.cb.OnMessage(Message{
			Topic: m.Topic(), Payload: m.Payload(), QoS: m.Qos(),
			Retained: m.Retained(), Timestamp: time.Now(),
		})
	}
}

// rememberSub records a subscription, replacing any existing entry for the same topic.
func (v *v3Client) rememberSub(sub Subscription) {
	v.mu.Lock()
	defer v.mu.Unlock()
	filtered := v.subs[:0]
	for _, s := range v.subs {
		if s.Topic != sub.Topic {
			filtered = append(filtered, s)
		}
	}
	v.subs = append(filtered, sub)
}

// forgetSub removes all remembered subscriptions for a topic.
func (v *v3Client) forgetSub(topic string) {
	v.mu.Lock()
	defer v.mu.Unlock()
	filtered := v.subs[:0]
	for _, s := range v.subs {
		if s.Topic != topic {
			filtered = append(filtered, s)
		}
	}
	v.subs = filtered
}

func (v *v3Client) Connect(ctx context.Context, cfg ConnectionConfig, cb Callbacks) error {
	v.cb = cb
	opts := paho3.NewClientOptions()
	opts.AddBroker(cfg.BrokerURL())
	opts.SetClientID(cfg.ClientID)
	if cfg.Username != "" {
		opts.SetUsername(cfg.Username)
		opts.SetPassword(cfg.Password)
	}
	opts.SetKeepAlive(time.Duration(cfg.KeepAlive) * time.Second)
	opts.SetCleanSession(cfg.CleanSession)
	opts.SetAutoReconnect(cfg.AutoReconnect)
	opts.SetConnectTimeout(30 * time.Second)

	tc, err := BuildTLSConfig(cfg)
	if err != nil {
		return err
	}
	if tc != nil {
		opts.SetTLSConfig(tc)
	}
	if cfg.WillTopic != "" {
		opts.SetWill(cfg.WillTopic, cfg.WillPayload, cfg.WillQoS, cfg.WillRetained)
	}
	opts.SetOnConnectHandler(func(c paho3.Client) {
		// paho v3 does not resume subscriptions on reconnect with CleanSession,
		// so re-apply remembered subscriptions on every (re)connect.
		v.mu.Lock()
		subs := append([]Subscription(nil), v.subs...)
		v.mu.Unlock()
		for _, s := range subs {
			c.Subscribe(s.Topic, s.QoS, func(_ paho3.Client, m paho3.Message) { v.emit(m) })
		}
		if v.cb.OnConnect != nil {
			v.cb.OnConnect()
		}
	})
	opts.SetConnectionLostHandler(func(_ paho3.Client, err error) {
		if v.cb.OnConnectionLost != nil {
			v.cb.OnConnectionLost(err)
		}
	})

	v.client = paho3.NewClient(opts)
	t := v.client.Connect()
	if !t.WaitTimeout(30 * time.Second) {
		return fmt.Errorf("connect timeout")
	}
	return t.Error()
}

func (v *v3Client) Subscribe(sub Subscription) error {
	if v.client == nil {
		return fmt.Errorf("not connected")
	}
	v.rememberSub(sub)
	t := v.client.Subscribe(sub.Topic, sub.QoS, func(_ paho3.Client, m paho3.Message) { v.emit(m) })
	t.Wait()
	return t.Error()
}

func (v *v3Client) Unsubscribe(topic string) error {
	if v.client == nil {
		return fmt.Errorf("not connected")
	}
	v.forgetSub(topic)
	t := v.client.Unsubscribe(topic)
	t.Wait()
	return t.Error()
}

func (v *v3Client) Publish(m Message) error {
	if v.client == nil {
		return fmt.Errorf("not connected")
	}
	t := v.client.Publish(m.Topic, m.QoS, m.Retained, m.Payload)
	t.Wait()
	return t.Error()
}

func (v *v3Client) Disconnect() error {
	if v.client != nil && v.client.IsConnected() {
		v.client.Disconnect(250)
	}
	return nil
}
