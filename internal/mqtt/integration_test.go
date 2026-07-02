//go:build integration

package mqtt

import (
	"context"
	"testing"
	"time"
)

// Requires a broker at localhost:1883. Run: go test -tags=integration ./internal/mqtt/
func TestPubSubRoundTrip(t *testing.T) {
	for _, version := range []string{"3.1.1", "5.0"} {
		t.Run(version, func(t *testing.T) {
			cli := New(version)
			got := make(chan Message, 1)
			cfg := ConnectionConfig{
				Host: "localhost", Port: 1883, Transport: "tcp", Version: version,
				ClientID: "it-" + version, KeepAlive: 30, CleanSession: true,
			}
			err := cli.Connect(context.Background(), cfg, Callbacks{
				OnMessage: func(m Message) { got <- m },
			})
			if err != nil {
				t.Fatalf("connect: %v", err)
			}
			defer cli.Disconnect()

			if err := cli.Subscribe(Subscription{Topic: "it/test", QoS: 1}); err != nil {
				t.Fatalf("subscribe: %v", err)
			}
			time.Sleep(200 * time.Millisecond)
			if err := cli.Publish(Message{Topic: "it/test", Payload: []byte("hi"), QoS: 1}); err != nil {
				t.Fatalf("publish: %v", err)
			}
			select {
			case m := <-got:
				if string(m.Payload) != "hi" {
					t.Fatalf("want hi, got %s", m.Payload)
				}
			case <-time.After(3 * time.Second):
				t.Fatal("timed out waiting for message")
			}
		})
	}
}
