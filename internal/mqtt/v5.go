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
	cm   *autopaho.ConnectionManager
	cb   Callbacks
	ctx  context.Context
	mu   sync.Mutex
	subs []Subscription // remembered so OnConnectionUp can re-apply
}

func newV5Client() *v5Client { return &v5Client{} }

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
			if v.cb.OnConnect != nil {
				v.cb.OnConnect()
			}
			v.mu.Lock()
			subs := append([]Subscription(nil), v.subs...)
			v.mu.Unlock()
			for _, s := range subs {
				_, _ = cm.Subscribe(ctx, &paho.Subscribe{
					Subscriptions: []paho.SubscribeOptions{{Topic: s.Topic, QoS: s.QoS}},
				})
			}
		},
		OnConnectError: func(err error) {
			if v.cb.OnConnectionLost != nil {
				v.cb.OnConnectionLost(err)
			}
		},
		ClientConfig: paho.ClientConfig{
			ClientID: cfg.ClientID,
			OnClientError: func(err error) {
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
	v.cm = cm
	connCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	return cm.AwaitConnection(connCtx)
}

func (v *v5Client) Subscribe(sub Subscription) error {
	v.mu.Lock()
	v.subs = append(v.subs, sub)
	v.mu.Unlock()
	_, err := v.cm.Subscribe(v.ctx, &paho.Subscribe{
		Subscriptions: []paho.SubscribeOptions{{Topic: sub.Topic, QoS: sub.QoS}},
	})
	return err
}

func (v *v5Client) Unsubscribe(topic string) error {
	v.mu.Lock()
	for i, s := range v.subs {
		if s.Topic == topic {
			v.subs = append(v.subs[:i], v.subs[i+1:]...)
			break
		}
	}
	v.mu.Unlock()
	_, err := v.cm.Unsubscribe(v.ctx, &paho.Unsubscribe{Topics: []string{topic}})
	return err
}

func (v *v5Client) Publish(m Message) error {
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
