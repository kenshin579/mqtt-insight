package app

import (
	"strings"

	"github.com/kenshin579/mqtt-insight/internal/mqtt"
)

// MatchesFocus reports whether a topic belongs to the focused subtree.
//
// An empty focus matches nothing. "No topic selected" means "send nothing" —
// not "send everything" — and that is what keeps the bridge idle by default.
// The "/" separator is required so "a/robot" does not capture "a/robot2".
func MatchesFocus(topic, focus string) bool {
	if focus == "" {
		return false
	}
	return topic == focus || strings.HasPrefix(topic, focus+"/")
}

// FilterFocus returns the messages of a batch that belong to the focused
// subtree, preserving arrival order.
func FilterFocus(ms []mqtt.Message, focus string) []mqtt.Message {
	if focus == "" {
		return nil
	}
	var out []mqtt.Message
	for _, m := range ms {
		if MatchesFocus(m.Topic, focus) {
			out = append(out, m)
		}
	}
	return out
}
