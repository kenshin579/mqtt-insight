package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
)

// Profile is a saved broker connection profile.
type Profile struct {
	Name          string `json:"name"`
	Host          string `json:"host"`
	Port          int    `json:"port"`
	Transport     string `json:"transport"` // tcp | tls | ws | wss
	Version       string `json:"version"`   // 3.1.1 | 5.0
	ClientID      string `json:"clientId"`
	Username      string `json:"username"`
	Password      string `json:"password"`
	KeepAlive     int    `json:"keepAlive"` // seconds
	CleanSession  bool   `json:"cleanSession"`
	AutoReconnect bool   `json:"autoReconnect"`
	CACertPath    string `json:"caCertPath"`
	UseSystemCAs  bool   `json:"useSystemCAs"`
	SkipVerify    bool   `json:"skipVerify"`
	WSPath        string `json:"wsPath"` // for ws/wss, e.g. /mqtt
	WillTopic     string `json:"willTopic"`
	WillPayload   string `json:"willPayload"`
	WillQoS       byte   `json:"willQos"`
	WillRetained  bool   `json:"willRetained"`
}

// Settings holds app-wide preferences.
type Settings struct {
	Theme             string `json:"theme"`           // dark | light
	RingBufferSize    int    `json:"ringBufferSize"`  // per-topic message cap
	DefaultFormat     string `json:"defaultFormat"`   // plain | json | hex | base64
	Lang              string `json:"lang"`            // ko | en
	TimestampFormat   string `json:"timestampFormat"` // absolute | relative
	MessageOrder      string `json:"messageOrder"`    // newest | oldest
	TreeHintDismissed bool   `json:"treeHintDismissed"`
	RecToastShown     bool   `json:"recToastShown"`
	CheckUpdates      bool   `json:"checkUpdates"` // 시작 시 새 버전 확인
}

// Config is the whole persisted document.
type Config struct {
	Settings Settings  `json:"settings"`
	Profiles []Profile `json:"profiles"`
}

func defaults() *Config {
	return &Config{Settings: Settings{
		Theme: "dark", RingBufferSize: 200, DefaultFormat: "plain",
		Lang: "ko", TimestampFormat: "absolute", MessageOrder: "newest",
		CheckUpdates: true,
	}}
}

// Load reads config from path, returning defaults if the file is absent.
func Load(path string) (*Config, error) {
	b, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return defaults(), nil
	}
	if err != nil {
		return nil, err
	}
	cfg := defaults()
	if err := json.Unmarshal(b, cfg); err != nil {
		return nil, err
	}
	return cfg, nil
}

// HasHostPort reports whether any profile already uses host:port.
func (c *Config) HasHostPort(host string, port int) bool {
	for _, p := range c.Profiles {
		if p.Host == host && p.Port == port {
			return true
		}
	}
	return false
}

// AutoName is the default profile name when the user leaves it blank.
// Must stay in sync with the same template in ConnectionForm.tsx.
func AutoName(host string, port int) string {
	return fmt.Sprintf("%s:%d", host, port)
}

// UpsertProfile inserts or updates a profile. prevName is the profile's
// name when editing began ("" for a new profile); it lets a rename update
// the original entry instead of being dropped or duplicated.
func (c *Config) UpsertProfile(p Profile, prevName string) {
	if prevName != "" && prevName != p.Name {
		if i := c.indexByName(prevName); i >= 0 {
			// rename: the new name overwrites any other profile holding it
			if j := c.indexByName(p.Name); j >= 0 && j != i {
				c.Profiles = append(c.Profiles[:j], c.Profiles[j+1:]...)
				if j < i {
					i--
				}
			}
			c.Profiles[i] = p
			return
		}
	}
	if i := c.indexByName(p.Name); i >= 0 {
		c.Profiles[i] = p
		return
	}
	// auto-named quick connect must not pile up entries for a broker
	// that is already saved under another name
	if p.Name == AutoName(p.Host, p.Port) && c.HasHostPort(p.Host, p.Port) {
		return
	}
	c.Profiles = append(c.Profiles, p)
}

func (c *Config) indexByName(name string) int {
	for i := range c.Profiles {
		if c.Profiles[i].Name == name {
			return i
		}
	}
	return -1
}

// Save writes config to path as indented JSON.
func Save(path string, cfg *Config) error {
	b, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, b, 0o600)
}
