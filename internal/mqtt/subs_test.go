package mqtt

import "testing"

func TestV5SubDedupAndForget(t *testing.T) {
	v := newV5Client()
	v.rememberSub(Subscription{Topic: "a", QoS: 0})
	v.rememberSub(Subscription{Topic: "a", QoS: 1}) // same topic -> replace, not append
	v.rememberSub(Subscription{Topic: "b", QoS: 0})
	if len(v.subs) != 2 {
		t.Fatalf("want 2 subs after dedup, got %d: %+v", len(v.subs), v.subs)
	}
	for _, s := range v.subs {
		if s.Topic == "a" && s.QoS != 1 {
			t.Fatalf("QoS not updated on re-subscribe: %+v", s)
		}
	}
	v.forgetSub("a")
	if len(v.subs) != 1 || v.subs[0].Topic != "b" {
		t.Fatalf("forgetSub failed: %+v", v.subs)
	}
}

func TestV3SubDedupAndForget(t *testing.T) {
	v := newV3Client()
	v.rememberSub(Subscription{Topic: "x", QoS: 0})
	v.rememberSub(Subscription{Topic: "x", QoS: 2})
	if len(v.subs) != 1 || v.subs[0].QoS != 2 {
		t.Fatalf("v3 dedup failed: %+v", v.subs)
	}
	v.forgetSub("x")
	if len(v.subs) != 0 {
		t.Fatalf("v3 forget failed: %+v", v.subs)
	}
}

func TestV3ReconnectingCallbackCounts(t *testing.T) {
	v := newV3Client()
	var got []int
	v.cb = Callbacks{OnReconnecting: func(n int) { got = append(got, n) }}
	// simulate what SetReconnectingHandler does
	for i := 0; i < 3; i++ {
		v.mu.Lock()
		v.attempts++
		n := v.attempts
		v.mu.Unlock()
		v.cb.OnReconnecting(n)
	}
	if len(got) != 3 || got[2] != 3 {
		t.Fatalf("want [1 2 3], got %v", got)
	}
}

func TestClientsReturnErrorBeforeConnect(t *testing.T) {
	for _, c := range []MQTTClient{newV3Client(), newV5Client()} {
		if err := c.Subscribe(Subscription{Topic: "t"}); err == nil {
			t.Errorf("%T: Subscribe before Connect should error, not panic", c)
		}
		if err := c.Publish(Message{Topic: "t"}); err == nil {
			t.Errorf("%T: Publish before Connect should error", c)
		}
		if err := c.Unsubscribe("t"); err == nil {
			t.Errorf("%T: Unsubscribe before Connect should error", c)
		}
		if err := c.Disconnect(); err != nil {
			t.Errorf("%T: Disconnect before Connect should be safe no-op, got %v", c, err)
		}
	}
}
