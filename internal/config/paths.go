package config

import (
	"os"
	"path/filepath"
)

// AppConfigPath returns the OS-appropriate config file path, creating the dir.
func AppConfigPath() (string, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(base, "mqtt-insight")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	return filepath.Join(dir, "config.json"), nil
}
