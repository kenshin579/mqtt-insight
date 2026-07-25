package app

import (
	"testing"

	"github.com/kenshin579/mqtt-insight/internal/mqtt"
)

func TestMatchesFocusEmptyMatchesNothing(t *testing.T) {
	if MatchesFocus("a/b", "") {
		t.Fatal("empty focus must match nothing, not everything")
	}
}

func TestMatchesFocusExactTopic(t *testing.T) {
	if !MatchesFocus("a/b", "a/b") {
		t.Fatal("exact topic must match")
	}
}

func TestMatchesFocusDescendant(t *testing.T) {
	if !MatchesFocus("a/b/c", "a/b") {
		t.Fatal("descendant must match")
	}
}

func TestMatchesFocusEnforcesSeparator(t *testing.T) {
	if MatchesFocus("a/robot2", "a/robot") {
		t.Fatal("a/robot2 must not match focus a/robot")
	}
}

func TestMatchesFocusRejectsAncestor(t *testing.T) {
	if MatchesFocus("a", "a/b") {
		t.Fatal("ancestor must not match a deeper focus")
	}
}

func TestFilterFocusKeepsOrderAndDropsOthers(t *testing.T) {
	ms := []mqtt.Message{
		{Topic: "a/b/1"},
		{Topic: "z/other"},
		{Topic: "a/b/2"},
	}
	got := FilterFocus(ms, "a/b")
	if len(got) != 2 || got[0].Topic != "a/b/1" || got[1].Topic != "a/b/2" {
		t.Fatalf("want a/b/1 then a/b/2, got %+v", got)
	}
}

func TestFilterFocusEmptyReturnsNil(t *testing.T) {
	if got := FilterFocus([]mqtt.Message{{Topic: "a"}}, ""); got != nil {
		t.Fatalf("empty focus must return nil, got %d", len(got))
	}
}
