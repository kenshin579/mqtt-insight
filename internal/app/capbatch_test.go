package app

import (
	"testing"

	"github.com/kenshin579/mqtt-insight/internal/mqtt"
)

func TestCapBatchUnderMaxKeepsAllUnchanged(t *testing.T) {
	ms := []mqtt.Message{{Topic: "a"}, {Topic: "b"}}
	kept, dropped := CapBatch(ms, 5)
	if dropped != 0 {
		t.Fatalf("want 0 dropped, got %d", dropped)
	}
	if len(kept) != 2 || kept[0].Topic != "a" || kept[1].Topic != "b" {
		t.Fatalf("want both messages kept in order, got %+v", kept)
	}
}

func TestCapBatchAtMaxKeepsAll(t *testing.T) {
	// Pins the boundary the original inline code got right: len(ms) == max
	// must not drop anything. A refactor that flips > to >= would fail this.
	ms := []mqtt.Message{{Topic: "a"}, {Topic: "b"}, {Topic: "c"}}
	kept, dropped := CapBatch(ms, 3)
	if dropped != 0 {
		t.Fatalf("want 0 dropped at the boundary, got %d", dropped)
	}
	if len(kept) != 3 {
		t.Fatalf("want all 3 kept at the boundary, got %d", len(kept))
	}
}

func TestCapBatchOverMaxKeepsNewest(t *testing.T) {
	ms := []mqtt.Message{{Topic: "1"}, {Topic: "2"}, {Topic: "3"}, {Topic: "4"}, {Topic: "5"}}
	kept, dropped := CapBatch(ms, 2)
	if dropped != 3 {
		t.Fatalf("want 3 dropped, got %d", dropped)
	}
	if len(kept) != 2 || kept[0].Topic != "4" || kept[1].Topic != "5" {
		t.Fatalf("want the newest two (4, 5) in order, got %+v", kept)
	}
}

func TestCapBatchEmptyBatch(t *testing.T) {
	kept, dropped := CapBatch(nil, 5)
	if kept != nil || dropped != 0 {
		t.Fatalf("want nil/0 for an empty batch, got %+v/%d", kept, dropped)
	}
}

func TestCapBatchNonPositiveMaxKeepsNothing(t *testing.T) {
	// A cap of 0 or less means "keep at most zero" — treated as "keep none,"
	// not as "uncapped." See CapBatch's doc comment for why.
	ms := []mqtt.Message{{Topic: "a"}, {Topic: "b"}}
	if kept, dropped := CapBatch(ms, 0); kept != nil || dropped != 2 {
		t.Fatalf("want nil/2 for max=0, got %+v/%d", kept, dropped)
	}
	if kept, dropped := CapBatch(ms, -1); kept != nil || dropped != 2 {
		t.Fatalf("want nil/2 for a negative max, got %+v/%d", kept, dropped)
	}
}
