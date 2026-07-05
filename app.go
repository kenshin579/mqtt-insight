package main

import (
	"context"
	"log"
	"os"
	"path/filepath"
	goruntime "runtime"
	"strings"
	"sync"
	"time"

	"github.com/kenshin579/mqtt-insight/internal/app"
	"github.com/kenshin579/mqtt-insight/internal/config"
	"github.com/kenshin579/mqtt-insight/internal/mqtt"
	"github.com/kenshin579/mqtt-insight/internal/store"
	"github.com/kenshin579/mqtt-insight/internal/update"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App is the Wails-bound application.
type App struct {
	ctx        context.Context
	cfg        *config.Config
	cfgPath    string
	mu         sync.Mutex
	client     mqtt.MQTTClient
	store      store.MessageStore
	batcher    *app.Batcher
	recorder   *store.SQLiteRecorder
	connCancel context.CancelFunc
	connState  string       // last emitted status state (protected by mu)
	updateInfo *update.Info // startup 체크 결과, nil = 최신 (protected by mu)
	updating   bool         // ApplyUpdate 진행 중 가드 (protected by mu)
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
	if exe, err := os.Executable(); err == nil {
		update.CleanupBak(exe)
	}
	if version != "dev" && a.cfg.Settings.CheckUpdates {
		go a.checkForUpdate()
	}
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

// SaveProfile upserts a profile and persists. prevName is the profile's
// name when editing began ("" for a new profile) so renames update the
// original entry.
func (a *App) SaveProfile(p config.Profile, prevName string) error {
	a.cfg.UpsertProfile(p, prevName)
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
	oldCancel := a.connCancel
	oldClient := a.client
	client := mqtt.New(p.Version)
	a.client = client
	ctx, cancel := context.WithCancel(a.ctx)
	a.connCancel = cancel
	a.mu.Unlock()

	// Tear down any previous connection outside the lock (Disconnect can block).
	if oldCancel != nil {
		oldCancel()
	}
	if oldClient != nil {
		_ = oldClient.Disconnect()
	}
	a.store.Clear()

	a.emitStatus("connecting", 0, "")
	cfg := mqtt.ConnectionConfig{
		Host: p.Host, Port: p.Port, Transport: p.Transport, Version: p.Version,
		ClientID: p.ClientID, Username: p.Username, Password: p.Password,
		KeepAlive: p.KeepAlive, CleanSession: p.CleanSession, AutoReconnect: p.AutoReconnect,
		CACertPath: p.CACertPath, UseSystemCAs: p.UseSystemCAs, SkipVerify: p.SkipVerify,
		WSPath: p.WSPath, WillTopic: p.WillTopic, WillPayload: p.WillPayload,
		WillQoS: p.WillQoS, WillRetained: p.WillRetained,
	}
	err := client.Connect(ctx, cfg, mqtt.Callbacks{
		OnMessage:        func(m mqtt.Message) { a.batcher.Add(m) },
		OnConnect:        func() { a.emitStatus("connected", 0, "") },
		OnConnectionLost: func(err error) { a.emitStatus("disconnected", 0, err.Error()) },
		OnReconnecting:   func(attempt int) { a.emitStatus("reconnecting", attempt, "") },
	})
	if err != nil {
		a.emitStatus("disconnected", 0, err.Error())
	}
	return err
}

// emitStatus sends a structured status event to the frontend and records the
// current state. Must not be called while holding a.mu.
func (a *App) emitStatus(state string, attempt int, reason string) {
	a.mu.Lock()
	a.connState = state
	a.mu.Unlock()
	runtime.EventsEmit(a.ctx, "mqtt:status", map[string]any{
		"state": state, "attempt": attempt, "reason": reason,
	})
}

// CancelConnect aborts an in-flight connection attempt. No-op unless connecting.
func (a *App) CancelConnect() {
	a.mu.Lock()
	if a.connState != "connecting" {
		a.mu.Unlock()
		return
	}
	cancel := a.connCancel
	a.mu.Unlock()
	if cancel != nil {
		cancel()
	}
	a.emitStatus("disconnected", 0, "")
}

// Disconnect closes the active connection.
func (a *App) Disconnect() error {
	a.mu.Lock()
	c := a.client
	cancel := a.connCancel
	a.mu.Unlock()
	if cancel != nil {
		cancel()
	}
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

// GetVersion returns the app version injected at build time ("dev" for local builds).
func (a *App) GetVersion() string { return version }

// --- In-app update (spec: docs/superpowers/specs/2026-07-05-in-app-update-design.md) ---

// checkForUpdate queries GitHub once and stores/broadcasts the result.
// 실패는 로그만 남기고 무시한다(다음 실행에서 재시도되는 셈).
func (a *App) checkForUpdate() {
	ctx, cancel := context.WithTimeout(a.ctx, 10*time.Second)
	defer cancel()
	info, err := update.Check(ctx, update.DefaultAPIURL, version, goruntime.GOOS)
	if err != nil {
		log.Printf("update check: %v", err)
		return
	}
	if info == nil {
		return
	}
	_, ok := selfUpdatePath()
	// https 강제: assetURL은 GitHub API(TLS) 응답에서 오지만 방어적으로 한 번 더 확인
	info.CanSelfUpdate = ok && strings.HasPrefix(info.AssetURL, "https://")
	a.mu.Lock()
	a.updateInfo = info
	a.mu.Unlock()
	runtime.EventsEmit(a.ctx, "update:available", info)
}

// selfUpdatePath returns the .app bundle path when self-update is possible:
// macOS + .app 번들 안 + translocation 아님.
func selfUpdatePath() (string, bool) {
	if goruntime.GOOS != "darwin" {
		return "", false
	}
	exe, err := os.Executable()
	if err != nil {
		return "", false
	}
	if update.IsTranslocated(exe) {
		return "", false
	}
	return update.BundlePath(exe)
}

// GetUpdateInfo returns the update found by the startup check (nil = none yet).
// 프론트가 mount 시 pull해 update:available 이벤트와의 레이스를 없앤다.
func (a *App) GetUpdateInfo() *update.Info {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.updateInfo
}

// ApplyUpdate downloads and installs the pending update, then restarts the
// app. 진행률은 update:progress(0–100), 실패는 update:error 이벤트로 알린다.
func (a *App) ApplyUpdate() {
	a.mu.Lock()
	info := a.updateInfo
	if info == nil || !info.CanSelfUpdate || a.updating {
		a.mu.Unlock()
		return
	}
	a.updating = true
	a.mu.Unlock()

	go func() {
		defer func() {
			a.mu.Lock()
			a.updating = false
			a.mu.Unlock()
		}()
		appPath, ok := selfUpdatePath()
		if !ok {
			runtime.EventsEmit(a.ctx, "update:error", "cannot self-update from this install location")
			return
		}
		err := update.Apply(a.ctx, info.AssetURL, appPath, func(pct int) {
			runtime.EventsEmit(a.ctx, "update:progress", pct)
		})
		if err != nil {
			runtime.EventsEmit(a.ctx, "update:error", err.Error())
			return
		}
		if err := update.Relaunch(appPath); err != nil {
			runtime.EventsEmit(a.ctx, "update:error", err.Error())
			return
		}
		runtime.Quit(a.ctx)
	}()
}
