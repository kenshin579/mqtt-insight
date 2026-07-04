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
	client   paho3.Client
	cb       Callbacks
	mu       sync.Mutex
	subs     []Subscription // remembered so reconnect can re-apply
	attempts int            // reconnect attempts since last successful connect
	aborted  bool           // set when Connect was cancelled/timed out or Disconnect ran
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
	v.mu.Lock()
	v.aborted = false // reuse-safety: a fresh Connect clears any prior abort
	v.mu.Unlock()
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
		v.mu.Lock()
		if v.aborted {
			v.mu.Unlock()
			c.Disconnect(0) // orphaned attempt that succeeded late — kill it, no resubscribe, no OnConnect
			return
		}
		// paho v3 does not resume subscriptions on reconnect with CleanSession,
		// so re-apply remembered subscriptions on every (re)connect.
		v.attempts = 0
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
	opts.SetReconnectingHandler(func(_ paho3.Client, _ *paho3.ClientOptions) {
		v.mu.Lock()
		v.attempts++
		n := v.attempts
		v.mu.Unlock()
		if v.cb.OnReconnecting != nil {
			v.cb.OnReconnecting(n)
		}
	})

	client := paho3.NewClient(opts)
	v.mu.Lock()
	v.client = client
	v.mu.Unlock()
	t := client.Connect()
	done := make(chan struct{})
	go func() { t.Wait(); close(done) }()
	select {
	case <-done:
		return t.Error()
	case <-ctx.Done():
		v.mu.Lock()
		v.aborted = true
		v.mu.Unlock()
		return ctx.Err()
	case <-time.After(30 * time.Second):
		v.mu.Lock()
		v.aborted = true
		v.mu.Unlock()
		return fmt.Errorf("connect timeout")
	}
}

func (v *v3Client) Subscribe(sub Subscription) error {
	v.mu.Lock()
	c := v.client
	v.mu.Unlock()
	if c == nil {
		return fmt.Errorf("not connected")
	}
	v.rememberSub(sub)
	t := c.Subscribe(sub.Topic, sub.QoS, func(_ paho3.Client, m paho3.Message) { v.emit(m) })
	t.Wait()
	return t.Error()
}

func (v *v3Client) Unsubscribe(topic string) error {
	v.mu.Lock()
	c := v.client
	v.mu.Unlock()
	if c == nil {
		return fmt.Errorf("not connected")
	}
	v.forgetSub(topic)
	t := c.Unsubscribe(topic)
	t.Wait()
	return t.Error()
}

func (v *v3Client) Publish(m Message) error {
	v.mu.Lock()
	c := v.client
	v.mu.Unlock()
	if c == nil {
		return fmt.Errorf("not connected")
	}
	t := c.Publish(m.Topic, m.QoS, m.Retained, m.Payload)
	t.Wait()
	return t.Error()
}

func (v *v3Client) Disconnect() error {
	v.mu.Lock()
	v.aborted = true // also kills a late success of an in-flight connect attempt
	c := v.client
	v.mu.Unlock()
	if c != nil && c.IsConnected() {
		c.Disconnect(250)
	}
	return nil
}
