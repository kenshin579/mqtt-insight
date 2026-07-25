package app

import (
	"sync"
	"testing"
)

func TestRateCounterAveragesOverWindow(t *testing.T) {
	c := NewRateCounter()
	c.AddGlobal(500)
	c.AddFocused(50)
	g, f := c.Rates()
	if g != 100 {
		t.Fatalf("want global 100 msg/s (500 over 5s), got %v", g)
	}
	if f != 10 {
		t.Fatalf("want focused 10 msg/s, got %v", f)
	}
}

func TestRateCounterDecaysToZero(t *testing.T) {
	c := NewRateCounter()
	c.AddGlobal(500)
	for i := 0; i < rateBuckets; i++ {
		c.Advance()
	}
	if g, _ := c.Rates(); g != 0 {
		t.Fatalf("want 0 after the window rotates fully, got %v", g)
	}
}

func TestRateCounterKeepsRecentBuckets(t *testing.T) {
	c := NewRateCounter()
	c.AddGlobal(500)
	c.Advance() // only the bucket we land on is cleared
	if g, _ := c.Rates(); g != 100 {
		t.Fatalf("want 100 still inside the window, got %v", g)
	}
}

// TestRateCounterConcurrentAccess mirrors the real usage pattern: one
// goroutine adding counts (the batcher's flush goroutine) while another
// advances the window and reads it (a 1s ticker goroutine). It makes no
// assertion about the resulting values, since the interleaving is
// nondeterministic — its job is to give `go test -race` overlapping
// unsynchronized field access to catch if the locking is ever broken.
func TestRateCounterConcurrentAccess(t *testing.T) {
	c := NewRateCounter()
	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		for i := 0; i < 1000; i++ {
			c.AddGlobal(1)
			c.AddFocused(1)
		}
	}()
	go func() {
		defer wg.Done()
		for i := 0; i < 1000; i++ {
			c.Advance()
			c.Rates()
		}
	}()
	wg.Wait()
}

func TestRateCounterReset(t *testing.T) {
	c := NewRateCounter()
	c.AddGlobal(500)
	c.AddFocused(500)
	c.Reset()
	if g, f := c.Rates(); g != 0 || f != 0 {
		t.Fatalf("want 0/0 after reset, got %v/%v", g, f)
	}
}
