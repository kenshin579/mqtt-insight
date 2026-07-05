package config

import (
	"os"
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

func TestCheckUpdatesDefaultsTrueForLegacyFile(t *testing.T) {
	// 기존 사용자의 설정 파일에는 checkUpdates 필드가 없다 → true 유지
	path := filepath.Join(t.TempDir(), "config.json")
	legacy := `{"settings":{"theme":"light","ringBufferSize":100},"profiles":[]}`
	if err := os.WriteFile(path, []byte(legacy), 0o600); err != nil {
		t.Fatal(err)
	}
	cfg, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if !cfg.Settings.CheckUpdates {
		t.Error("CheckUpdates should default to true for legacy config")
	}
	if cfg.Settings.Theme != "light" {
		t.Errorf("Theme = %q, want light (merge preserved)", cfg.Settings.Theme)
	}
}

func TestCheckUpdatesExplicitFalse(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	body := `{"settings":{"checkUpdates":false},"profiles":[]}`
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	cfg, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Settings.CheckUpdates {
		t.Error("CheckUpdates should honor explicit false")
	}
}

func TestAutoName(t *testing.T) {
	if got := AutoName("localhost", 1883); got != "localhost:1883" {
		t.Fatalf("AutoName = %q, want localhost:1883", got)
	}
}

func TestUpsertProfile(t *testing.T) {
	// 공통 시작 상태: Test1(localhost:1883), Other(10.0.0.5:8883)
	base := func() *Config {
		return &Config{Profiles: []Profile{
			{Name: "Test1", Host: "localhost", Port: 1883},
			{Name: "Other", Host: "10.0.0.5", Port: 8883},
		}}
	}
	names := func(c *Config) []string {
		out := make([]string, len(c.Profiles))
		for i, p := range c.Profiles {
			out[i] = p.Name
		}
		return out
	}

	t.Run("prevName 존재, 이름 유지 → 내용 교체", func(t *testing.T) {
		c := base()
		c.UpsertProfile(Profile{Name: "Test1", Host: "localhost", Port: 1884}, "Test1")
		if len(c.Profiles) != 2 || c.Profiles[0].Port != 1884 {
			t.Fatalf("got %+v", c.Profiles)
		}
	})

	t.Run("prevName 존재, 이름 변경 → rename, 개수 불변", func(t *testing.T) {
		c := base()
		c.UpsertProfile(Profile{Name: "Test2", Host: "localhost", Port: 1883}, "Test1")
		got := names(c)
		if len(got) != 2 || got[0] != "Test2" || got[1] != "Other" {
			t.Fatalf("names = %v", got)
		}
	})

	t.Run("rename 새 이름이 다른 프로필과 충돌 → 충돌 프로필 제거", func(t *testing.T) {
		c := base()
		c.UpsertProfile(Profile{Name: "Other", Host: "localhost", Port: 1883}, "Test1")
		if len(c.Profiles) != 1 || c.Profiles[0].Name != "Other" || c.Profiles[0].Host != "localhost" {
			t.Fatalf("got %+v", c.Profiles)
		}
	})

	t.Run("prevName 미존재 → 이름 기준 upsert 폴백", func(t *testing.T) {
		c := base()
		c.UpsertProfile(Profile{Name: "Test1", Host: "localhost", Port: 1999}, "Ghost")
		if len(c.Profiles) != 2 || c.Profiles[0].Port != 1999 {
			t.Fatalf("got %+v", c.Profiles)
		}
	})

	t.Run("새 프로필, 직접 지은 이름, host:port 중복 → 정상 추가", func(t *testing.T) {
		c := base()
		c.UpsertProfile(Profile{Name: "Prod", Host: "localhost", Port: 1883}, "")
		if len(c.Profiles) != 3 {
			t.Fatalf("names = %v", names(c))
		}
	})

	t.Run("새 프로필, 자동 이름, host:port 중복 → 추가 스킵", func(t *testing.T) {
		c := base()
		c.UpsertProfile(Profile{Name: "localhost:1883", Host: "localhost", Port: 1883}, "")
		if len(c.Profiles) != 2 {
			t.Fatalf("names = %v", names(c))
		}
	})

	t.Run("자동 이름끼리 같은 host 다른 port → 별도 프로필", func(t *testing.T) {
		c := &Config{}
		c.UpsertProfile(Profile{Name: "localhost:1883", Host: "localhost", Port: 1883}, "")
		c.UpsertProfile(Profile{Name: "localhost:8883", Host: "localhost", Port: 8883}, "")
		if len(c.Profiles) != 2 {
			t.Fatalf("names = %v", names(c))
		}
	})

	t.Run("자동 이름 프로필 재접속(같은 이름) → 교체, 중복 없음", func(t *testing.T) {
		c := &Config{}
		c.UpsertProfile(Profile{Name: "localhost:1883", Host: "localhost", Port: 1883}, "")
		c.UpsertProfile(Profile{Name: "localhost:1883", Host: "localhost", Port: 1883, ClientID: "x"}, "")
		if len(c.Profiles) != 1 || c.Profiles[0].ClientID != "x" {
			t.Fatalf("got %+v", c.Profiles)
		}
	})
}
