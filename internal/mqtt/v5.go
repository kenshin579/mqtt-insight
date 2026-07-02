package mqtt

import (
	"context"
	"fmt"
	"net/url"
	"sync"
	"time"

	"github.com/eclipse/paho.golang/autopaho"
	"github.com/eclipse/paho.golang/paho"
)

// v5Client implements MQTTClient over MQTT 5.0 using autopaho.
type v5Client struct {
	cm      *autopaho.ConnectionManager
	cb      Callbacks
	ctx     context.Context
	mu      sync.Mutex
	subs    []Subscription // remembered so OnConnectionUp can re-apply
	lastErr error          // last async connect error, surfaced on Connect failure
}

func newV5Client() *v5Client { return &v5Client{} }

// rememberSub records a subscription, replacing any existing entry for the same topic.
func (v *v5Client) rememberSub(sub Subscription) {
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
func (v *v5Client) forgetSub(topic string) {
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

func (v *v5Client) Connect(ctx context.Context, cfg ConnectionConfig, cb Callbacks) error {
	v.cb = cb
	v.ctx = ctx

	u, err := url.Parse(cfg.BrokerURL())
	if err != nil {
		return fmt.Errorf("parse url: %w", err)
	}
	tc, err := BuildTLSConfig(cfg)
	if err != nil {
		return err
	}

	acfg := autopaho.ClientConfig{
		ServerUrls:                    []*url.URL{u},
		KeepAlive:                     uint16(cfg.KeepAlive),
		CleanStartOnInitialConnection: cfg.CleanSession,
		TlsCfg:                        tc,
		OnConnectionUp: func(cm *autopaho.ConnectionManager, _ *paho.Connack) {
			v.mu.Lock()
			subs := append([]Subscription(nil), v.subs...)
			v.mu.Unlock()
			for _, s := range subs {
				_, _ = cm.Subscribe(v.ctx, &paho.Subscribe{
					Subscriptions: []paho.SubscribeOptions{{Topic: s.Topic, QoS: s.QoS}},
				})
			}
			if v.cb.OnConnect != nil {
				v.cb.OnConnect()
			}
		},
		OnConnectError: func(err error) {
			v.mu.Lock()
			v.lastErr = err
			v.mu.Unlock()
			if v.cb.OnConnectionLost != nil {
				v.cb.OnConnectionLost(err)
			}
		},
		ClientConfig: paho.ClientConfig{
			ClientID: cfg.ClientID,
			OnClientError: func(err error) {
				v.mu.Lock()
				v.lastErr = err
				v.mu.Unlock()
				if v.cb.OnConnectionLost != nil {
					v.cb.OnConnectionLost(err)
				}
			},
			OnPublishReceived: []func(paho.PublishReceived) (bool, error){
				func(pr paho.PublishReceived) (bool, error) {
					p := pr.Packet
					msg := Message{
						Topic: p.Topic, Payload: p.Payload, QoS: p.QoS,
						Retained: p.Retain, Timestamp: time.Now(),
					}
					if p.Properties != nil {
						msg.ContentType = p.Properties.ContentType
						for _, up := range p.Properties.User {
							msg.UserProps = append(msg.UserProps, UserProperty{Key: up.Key, Value: up.Value})
						}
					}
					if v.cb.OnMessage != nil {
						v.cb.OnMessage(msg)
					}
					return true, nil
				},
			},
		},
	}
	if cfg.Username != "" {
		acfg.ConnectUsername = cfg.Username
		acfg.ConnectPassword = []byte(cfg.Password)
	}

	cm, err := autopaho.NewConnection(ctx, acfg)
	if err != nil {
		return err
	}
	connCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	if err := cm.AwaitConnection(connCtx); err != nil {
		// Tear down the background retry loop so a failed Connect doesn't leak a
		// goroutine that keeps hammering the broker forever.
		_ = cm.Disconnect(context.Background())
		v.mu.Lock()
		le := v.lastErr
		v.mu.Unlock()
		if le != nil {
			return le
		}
		return err
	}
	v.cm = cm
	return nil
}

func (v *v5Client) Subscribe(sub Subscription) error {
	if v.cm == nil {
		return fmt.Errorf("not connected")
	}
	v.rememberSub(sub)
	_, err := v.cm.Subscribe(v.ctx, &paho.Subscribe{
		Subscriptions: []paho.SubscribeOptions{{Topic: sub.Topic, QoS: sub.QoS}},
	})
	return err
}

func (v *v5Client) Unsubscribe(topic string) error {
	if v.cm == nil {
		return fmt.Errorf("not connected")
	}
	v.forgetSub(topic)
	_, err := v.cm.Unsubscribe(v.ctx, &paho.Unsubscribe{Topics: []string{topic}})
	return err
}

func (v *v5Client) Publish(m Message) error {
	if v.cm == nil {
		return fmt.Errorf("not connected")
	}
	pub := &paho.Publish{Topic: m.Topic, QoS: m.QoS, Retain: m.Retained, Payload: m.Payload}
	if m.ContentType != "" || len(m.UserProps) > 0 {
		props := &paho.PublishProperties{ContentType: m.ContentType}
		for _, up := range m.UserProps {
			props.User = append(props.User, paho.UserProperty{Key: up.Key, Value: up.Value})
		}
		pub.Properties = props
	}
	_, err := v.cm.Publish(v.ctx, pub)
	return err
}

func (v *v5Client) Disconnect() error {
	if v.cm != nil {
		return v.cm.Disconnect(context.Background())
	}
	return nil
}
