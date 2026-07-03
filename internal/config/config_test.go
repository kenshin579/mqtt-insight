package config

import (
	"path/filepath"
	"testing"
)

func TestSaveLoadRoundTrip(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.json")

	in := &Config{
		Settings: Settings{Theme: "dark", RingBufferSize: 500, DefaultFormat: "json"},
		Profiles: []Profile{{
			Name: "local", Host: "localhost", Port: 1883,
			Transport: "tcp", Version: "5.0", ClientID: "c1",
		}},
	}
	if err := Save(path, in); err != nil {
		t.Fatalf("save: %v", err)
	}
	out, err := Load(path)
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if len(out.Profiles) != 1 || out.Profiles[0].Host != "localhost" {
		t.Fatalf("profile not round-tripped: %+v", out.Profiles)
	}
	if out.Settings.Theme != "dark" {
		t.Fatalf("settings not round-tripped: %+v", out.Settings)
	}
}

func TestLoadMissingReturnsDefaults(t *testing.T) {
	out, err := Load(filepath.Join(t.TempDir(), "nope.json"))
	if err != nil {
		t.Fatalf("missing file should not error: %v", err)
	}
	if out.Settings.RingBufferSize == 0 {
		t.Fatal("expected default ring buffer size")
	}
}

func TestSettingsNewFieldsRoundTrip(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.json")
	in := &Config{Settings: Settings{
		Theme: "system", RingBufferSize: 300, DefaultFormat: "json",
		Lang: "en", TimestampFormat: "relative", MessageOrder: "oldest",
		TreeHintDismissed: true, RecToastShown: true,
	}}
	if err := Save(path, in); err != nil {
		t.Fatalf("save: %v", err)
	}
	out, err := Load(path)
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	s := out.Settings
	if s.Lang != "en" || s.TimestampFormat != "relative" || s.MessageOrder != "oldest" ||
		!s.TreeHintDismissed || !s.RecToastShown {
		t.Fatalf("new fields not round-tripped: %+v", s)
	}
}

func TestSettingsDefaultsForNewFields(t *testing.T) {
	out, _ := Load(filepath.Join(t.TempDir(), "nope.json"))
	s := out.Settings
	if s.Lang != "ko" || s.TimestampFormat != "absolute" || s.MessageOrder != "newest" {
		t.Fatalf("defaults wrong: %+v", s)
	}
}

func TestHasHostPort(t *testing.T) {
	c := &Config{Profiles: []Profile{{Name: "a", Host: "h", Port: 1883}}}
	if !c.HasHostPort("h", 1883) {
		t.Fatal("expected true for existing host:port")
	}
	if c.HasHostPort("h", 8883) {
		t.Fatal("expected false for different port")
	}
}
