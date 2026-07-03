package main

import (
	"context"
	"path/filepath"
	"sync"
	"time"

	"github.com/kenshin579/mqtt-insight/internal/app"
	"github.com/kenshin579/mqtt-insight/internal/config"
	"github.com/kenshin579/mqtt-insight/internal/mqtt"
	"github.com/kenshin579/mqtt-insight/internal/store"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App is the Wails-bound application.
type App struct {
	ctx      context.Context
	cfg      *config.Config
	cfgPath  string
	mu       sync.Mutex
	client   mqtt.MQTTClient
	store    store.MessageStore
	batcher  *app.Batcher
	recorder *store.SQLiteRecorder
}

// NewApp creates the app, loading persisted config.
func NewApp() *App {
	path, _ := config.AppConfigPath()
	cfg, _ := config.Load(path)
	return &App{cfg: cfg, cfgPath: path}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.store = store.NewMemoryStore(a.cfg.Settings.RingBufferSize)
	recPath := filepath.Join(filepath.Dir(a.cfgPath), "recordings.db")
	if rec, err := store.NewSQLiteRecorder(recPath); err == nil {
		a.recorder = rec
	}
	a.batcher = app.NewBatcher(50*time.Millisecond, func(ms []mqtt.Message) {
		for _, m := range ms {
			a.store.Record(m)
			if a.recorder != nil {
				a.recorder.Record(m)
			}
		}
		runtime.EventsEmit(a.ctx, "mqtt:messages", ms)
		runtime.EventsEmit(a.ctx, "mqtt:tree", a.store.TreeSnapshot())
	})
	a.batcher.Start()
}

func (a *App) shutdown(ctx context.Context) {
	if a.batcher != nil {
		a.batcher.Stop()
	}
	if a.client != nil {
		_ = a.client.Disconnect()
	}
	if a.recorder != nil {
		a.recorder.Close()
	}
}

// --- Bound methods (exposed to frontend) ---

// GetProfiles returns saved connection profiles.
func (a *App) GetProfiles() []config.Profile { return a.cfg.Profiles }

// GetSettings returns app settings.
func (a *App) GetSettings() config.Settings { return a.cfg.Settings }

// SaveProfile upserts a profile by name and persists.
func (a *App) SaveProfile(p config.Profile) error {
	replaced := false
	for i := range a.cfg.Profiles {
		if a.cfg.Profiles[i].Name == p.Name {
			a.cfg.Profiles[i] = p
			replaced = true
			break
		}
	}
	if !replaced {
		a.cfg.Profiles = append(a.cfg.Profiles, p)
	}
	return config.Save(a.cfgPath, a.cfg)
}

// DeleteProfile removes a profile by name.
func (a *App) DeleteProfile(name string) error {
	for i := range a.cfg.Profiles {
		if a.cfg.Profiles[i].Name == name {
			a.cfg.Profiles = append(a.cfg.Profiles[:i], a.cfg.Profiles[i+1:]...)
			break
		}
	}
	return config.Save(a.cfgPath, a.cfg)
}

// SaveSettings persists settings and applies changes that affect live state.
func (a *App) SaveSettings(s config.Settings) error {
	a.cfg.Settings = s
	if a.store != nil {
		a.store.SetCapacity(s.RingBufferSize)
	}
	return config.Save(a.cfgPath, a.cfg)
}

// Connect opens a connection using a profile.
func (a *App) Connect(p config.Profile) error {
	a.mu.Lock()
	if a.client != nil {
		_ = a.client.Disconnect()
	}
	a.store.Clear()
	client := mqtt.New(p.Version)
	a.client = client
	a.mu.Unlock()
	cfg := mqtt.ConnectionConfig{
		Host: p.Host, Port: p.Port, Transport: p.Transport, Version: p.Version,
		ClientID: p.ClientID, Username: p.Username, Password: p.Password,
		KeepAlive: p.KeepAlive, CleanSession: p.CleanSession, AutoReconnect: p.AutoReconnect,
		CACertPath: p.CACertPath, UseSystemCAs: p.UseSystemCAs, SkipVerify: p.SkipVerify,
		WSPath: p.WSPath, WillTopic: p.WillTopic, WillPayload: p.WillPayload,
		WillQoS: p.WillQoS, WillRetained: p.WillRetained,
	}
	return client.Connect(a.ctx, cfg, mqtt.Callbacks{
		OnMessage:        func(m mqtt.Message) { a.batcher.Add(m) },
		OnConnect:        func() { runtime.EventsEmit(a.ctx, "mqtt:status", "connected") },
		OnConnectionLost: func(err error) { runtime.EventsEmit(a.ctx, "mqtt:status", "disconnected: "+err.Error()) },
	})
}

// Disconnect closes the active connection.
func (a *App) Disconnect() error {
	a.mu.Lock()
	c := a.client
	a.mu.Unlock()
	if c == nil {
		return nil
	}
	return c.Disconnect()
}

// Subscribe subscribes to a topic filter.
func (a *App) Subscribe(topic string, qos byte) error {
	a.mu.Lock()
	c := a.client
	a.mu.Unlock()
	if c == nil {
		return nil
	}
	return c.Subscribe(mqtt.Subscription{Topic: topic, QoS: qos})
}

// Unsubscribe removes a subscription.
func (a *App) Unsubscribe(topic string) error {
	a.mu.Lock()
	c := a.client
	a.mu.Unlock()
	if c == nil {
		return nil
	}
	return c.Unsubscribe(topic)
}

// Publish publishes a message.
func (a *App) Publish(m mqtt.Message) error {
	a.mu.Lock()
	c := a.client
	a.mu.Unlock()
	if c == nil {
		return nil
	}
	return c.Publish(m)
}

// History returns buffered messages for a topic.
func (a *App) History(topic string) []mqtt.Message {
	if a.store == nil {
		return nil
	}
	return a.store.History(topic)
}

// EnableRecording starts persisting a topic to SQLite.
func (a *App) EnableRecording(topic string) {
	if a.recorder != nil {
		a.recorder.Enable(topic)
	}
}

// DisableRecording stops persisting a topic.
func (a *App) DisableRecording(topic string) {
	if a.recorder != nil {
		a.recorder.Disable(topic)
	}
}

// QueryRecorded returns up to `limit` most-recent recorded messages for a topic.
func (a *App) QueryRecorded(topic string, limit int) []mqtt.Message {
	if a.recorder == nil {
		return nil
	}
	msgs, err := a.recorder.Query(topic, limit)
	if err != nil {
		return nil
	}
	return msgs
}

// RecordedTopics returns the topics currently being recorded.
func (a *App) RecordedTopics() []string {
	if a.recorder == nil {
		return nil
	}
	return a.recorder.Topics()
}
