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
	cm            *autopaho.ConnectionManager
	cb            Callbacks
	ctx           context.Context
	mu            sync.Mutex
	subs          []Subscription // remembered so OnConnectionUp can re-apply
	lastErr       error          // last async connect error, surfaced on Connect failure
	attempts      int            // reconnect attempts since last successful connect
	connectedOnce bool           // true once the initial connect has succeeded
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

	// Note: autopaho always manages reconnection internally (it maintains its own
	// background retry loop regardless of configuration), so cfg.AutoReconnect is
	// effectively always-on for v5. It's honored explicitly only for v3 (see v3.go).
	acfg := autopaho.ClientConfig{
		ServerUrls:                    []*url.URL{u},
		KeepAlive:                     uint16(cfg.KeepAlive),
		CleanStartOnInitialConnection: cfg.CleanSession,
		TlsCfg:                        tc,
		OnConnectionUp: func(cm *autopaho.ConnectionManager, _ *paho.Connack) {
			v.mu.Lock()
			subs := append([]Subscription(nil), v.subs...)
			v.connectedOnce = true
			v.attempts = 0
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
			once := v.connectedOnce
			if once {
				v.attempts++
			}
			n := v.attempts
			v.mu.Unlock()
			if once && v.cb.OnReconnecting != nil {
				v.cb.OnReconnecting(n)
			}
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
						msg.ResponseTopic = p.Properties.ResponseTopic
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
	v.mu.Lock()
	v.cm = cm
	v.mu.Unlock()
	return nil
}

func (v *v5Client) Subscribe(sub Subscription) error {
	v.mu.Lock()
	cm := v.cm
	v.mu.Unlock()
	if cm == nil {
		return fmt.Errorf("not connected")
	}
	v.rememberSub(sub)
	_, err := cm.Subscribe(v.ctx, &paho.Subscribe{
		Subscriptions: []paho.SubscribeOptions{{Topic: sub.Topic, QoS: sub.QoS}},
	})
	return err
}

func (v *v5Client) Unsubscribe(topic string) error {
	v.mu.Lock()
	cm := v.cm
	v.mu.Unlock()
	if cm == nil {
		return fmt.Errorf("not connected")
	}
	v.forgetSub(topic)
	_, err := cm.Unsubscribe(v.ctx, &paho.Unsubscribe{Topics: []string{topic}})
	return err
}

func (v *v5Client) Publish(m Message) error {
	v.mu.Lock()
	cm := v.cm
	v.mu.Unlock()
	if cm == nil {
		return fmt.Errorf("not connected")
	}
	pub := &paho.Publish{Topic: m.Topic, QoS: m.QoS, Retain: m.Retained, Payload: m.Payload}
	if m.ContentType != "" || m.ResponseTopic != "" || len(m.UserProps) > 0 {
		props := &paho.PublishProperties{ContentType: m.ContentType, ResponseTopic: m.ResponseTopic}
		for _, up := range m.UserProps {
			props.User = append(props.User, paho.UserProperty{Key: up.Key, Value: up.Value})
		}
		pub.Properties = props
	}
	_, err := cm.Publish(v.ctx, pub)
	return err
}

func (v *v5Client) Disconnect() error {
	v.mu.Lock()
	cm := v.cm
	v.mu.Unlock()
	if cm != nil {
		return cm.Disconnect(context.Background())
	}
	return nil
}
