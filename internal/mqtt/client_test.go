package mqtt

import "testing"

func TestBrokerURL(t *testing.T) {
	cases := []struct {
		cfg  ConnectionConfig
		want string
	}{
		{ConnectionConfig{Host: "h", Port: 1883, Transport: "tcp"}, "tcp://h:1883"},
		{ConnectionConfig{Host: "h", Port: 8883, Transport: "tls"}, "ssl://h:8883"},
		{ConnectionConfig{Host: "h", Port: 8080, Transport: "ws", WSPath: "/mqtt"}, "ws://h:8080/mqtt"},
		{ConnectionConfig{Host: "h", Port: 443, Transport: "wss", WSPath: "/mqtt"}, "wss://h:443/mqtt"},
	}
	for _, c := range cases {
		if got := c.cfg.BrokerURL(); got != c.want {
			t.Errorf("BrokerURL()=%q want %q", got, c.want)
		}
	}
}
