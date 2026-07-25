package app

import "sync"

// rateBuckets is the number of 1-second buckets in the sliding window; the
// window is therefore rateBuckets seconds wide.
const rateBuckets = 5

// RateCounter tracks messages/second over a sliding window using one bucket per
// second. Advance rotates the ring — callers drive it from a 1s ticker so the
// rate decays back to zero when traffic stops.
//
// Counting integers here (rather than re-scanning a message buffer in the UI)
// is also what removes the old display cap: the frontend buffer held ~1s of
// traffic while the window was 5s, so the shown rate could never exceed 100.
type RateCounter struct {
	mu      sync.Mutex
	global  [rateBuckets]int
	focused [rateBuckets]int
	cursor  int
}

// NewRateCounter creates an empty counter.
func NewRateCounter() *RateCounter { return &RateCounter{} }

// AddGlobal records n messages received from the broker.
func (c *RateCounter) AddGlobal(n int) {
	c.mu.Lock()
	c.global[c.cursor] += n
	c.mu.Unlock()
}

// AddFocused records n messages that passed the focus filter.
func (c *RateCounter) AddFocused(n int) {
	c.mu.Lock()
	c.focused[c.cursor] += n
	c.mu.Unlock()
}

// Advance rotates to the next bucket, clearing the one it lands on.
func (c *RateCounter) Advance() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.cursor = (c.cursor + 1) % rateBuckets
	c.global[c.cursor] = 0
	c.focused[c.cursor] = 0
}

// Rates returns messages/second over the window for the global and focused streams.
func (c *RateCounter) Rates() (global, focused float64) {
	c.mu.Lock()
	defer c.mu.Unlock()
	var g, f int
	for i := 0; i < rateBuckets; i++ {
		g += c.global[i]
		f += c.focused[i]
	}
	return float64(g) / rateBuckets, float64(f) / rateBuckets
}

// Reset clears every bucket. Used when a connection is torn down so a new
// session does not inherit the previous one's rate.
func (c *RateCounter) Reset() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.global = [rateBuckets]int{}
	c.focused = [rateBuckets]int{}
	c.cursor = 0
}
