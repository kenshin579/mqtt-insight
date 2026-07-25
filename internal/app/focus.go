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
//
// It returns nil both when no topic is focused and when the focus matched
// nothing. Callers only ever need to know whether there is anything to send,
// so conflating the two is deliberate — branch on len(), never on why.
func FilterFocus(ms []mqtt.Message, focus string) []mqtt.Message {
	// Mirrors MatchesFocus: an empty focus means "no topic selected", so this
	// returns nil, NOT ms. Passing the batch through here would reinstate the
	// firehose this whole filter exists to prevent. The guard is also a fast
	// path — with nothing selected there is no reason to walk the batch.
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
