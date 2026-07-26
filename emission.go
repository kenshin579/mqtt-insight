package main

import (
	"time"

	"github.com/kenshin579/mqtt-insight/internal/app"
	"github.com/kenshin579/mqtt-insight/internal/mqtt"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// Collection, aggregation and display used to share one 50ms batcher callback,
// which forced the most expensive work onto the fastest cadence. This file holds
// the three tracks they were split into: messages stay at 50ms but only for the
// focused subtree, the tree emits every 500ms and only when it changed, and the
// rate emits once a second.

// Emission budget — see docs/superpowers/specs/2026-07-25-high-volume-performance-design.md §2.1
const (
	treeEmitInterval    = 500 * time.Millisecond
	rateEmitInterval    = time.Second
	maxPerFlush         = 100 // per 50ms flush = 2,000 msg/s ceiling on the focused stream
	subtreeHistoryLimit = 500
)

// focusBatch is the mqtt:messages payload. Focus travels with the batch so a
// frontend that has already moved on can discard it without any locking.
type focusBatch struct {
	Focus    string         `json:"focus"`
	Messages []mqtt.Message `json:"messages"`
	Dropped  int            `json:"dropped"`
}

// rateEvent is the mqtt:rate payload.
type rateEvent struct {
	Global  float64 `json:"global"`
	Focused float64 `json:"focused"`
}

// flush records every received message and forwards only the focused subtree to
// the frontend. Collection is unconditional; the bridge is not.
func (a *App) flush(ms []mqtt.Message) {
	for _, m := range ms {
		a.store.Record(m)
		if a.recorder != nil {
			a.recorder.Record(m)
		}
	}
	a.rate.AddGlobal(len(ms))

	a.mu.Lock()
	f := a.focus
	a.mu.Unlock()
	if f == "" {
		return // nothing selected: the bridge stays idle
	}

	out := app.FilterFocus(ms, f)
	if len(out) == 0 {
		return
	}
	a.rate.AddFocused(len(out))

	out, dropped := app.CapBatch(out, maxPerFlush)
	runtime.EventsEmit(a.ctx, "mqtt:messages", focusBatch{Focus: f, Messages: out, Dropped: dropped})
}

// treeLoop emits the topic tree on its own slower cadence, and only when it
// actually changed. Tree badges tolerate half a second of lag; messages do not.
//
// stop is passed in rather than read from a.tickStop each iteration, so shutdown
// can clear the field without racing the loop.
func (a *App) treeLoop(stop <-chan struct{}) {
	tk := time.NewTicker(treeEmitInterval)
	defer tk.Stop()
	var last uint64
	for {
		select {
		case <-tk.C:
			// Cheap gate first: an unchanged tree must not pay for a deep copy.
			if a.store.TreeRevision() == last {
				continue
			}
			// Then read snapshot and revision together, so `last` is exactly the
			// revision of the data actually sent. Reading them apart lets an Insert
			// land in between; snapshot-then-revision would record a revision newer
			// than what was emitted and silently mask that update.
			snap, rev := a.store.TreeSnapshotWithRevision()
			last = rev
			runtime.EventsEmit(a.ctx, "mqtt:tree", snap)
		case <-stop:
			return
		}
	}
}

// rateLoop publishes the sliding-window rate and rotates the counter.
func (a *App) rateLoop(stop <-chan struct{}) {
	tk := time.NewTicker(rateEmitInterval)
	defer tk.Stop()
	for {
		select {
		case <-tk.C:
			g, f := a.rate.Rates()
			runtime.EventsEmit(a.ctx, "mqtt:rate", rateEvent{Global: g, Focused: f})
			a.rate.Advance()
		case <-stop:
			return
		}
	}
}

// resetStream clears focus and rate so a new connection never inherits the
// previous session's stream.
func (a *App) resetStream() {
	a.mu.Lock()
	a.focus = ""
	a.mu.Unlock()
	a.rate.Reset()
}
