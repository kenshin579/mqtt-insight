package config

import (
	"encoding/json"
	"errors"
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
	Theme          string `json:"theme"`          // dark | light
	RingBufferSize int    `json:"ringBufferSize"` // per-topic message cap
	DefaultFormat  string `json:"defaultFormat"`  // plain | json | hex | base64
}

// Config is the whole persisted document.
type Config struct {
	Settings Settings  `json:"settings"`
	Profiles []Profile `json:"profiles"`
}

func defaults() *Config {
	return &Config{Settings: Settings{Theme: "dark", RingBufferSize: 200, DefaultFormat: "plain"}}
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

// Save writes config to path as indented JSON.
func Save(path string, cfg *Config) error {
	b, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, b, 0o600)
}
