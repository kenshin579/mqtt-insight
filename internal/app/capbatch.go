package app

import "github.com/kenshin579/mqtt-insight/internal/mqtt"

// CapBatch trims a batch to at most max of its newest messages, preserving
// arrival order among the ones kept, and reports how many were cut.
//
// A non-positive max keeps nothing: "keep at most N" degenerates to "keep
// none" at N<=0 rather than being read as "uncapped." That keeps CapBatch
// monotonic in max and avoids the out-of-bounds slice a literal
// ms[len(ms)-max:] would panic on for a negative max. Callers that want "no
// cap" should simply not call CapBatch.
func CapBatch(ms []mqtt.Message, max int) (kept []mqtt.Message, dropped int) {
	if max <= 0 {
		return nil, len(ms)
	}
	if len(ms) <= max {
		return ms, 0
	}
	return ms[len(ms)-max:], len(ms) - max
}
