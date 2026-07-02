// Package deps exists only to keep the MQTT client and SQLite driver
// dependencies pinned in go.mod ahead of their real usage in upcoming
// tasks. Without a real import somewhere, Go's module tooling (and the
// mod-tidy pass Wails runs as part of `wails build`) would drop these
// requirements as unused. Remove this file once genuine code in
// internal/ imports these packages directly.
package deps

import (
	_ "github.com/eclipse/paho.golang/autopaho"
	_ "github.com/eclipse/paho.golang/paho"
	_ "github.com/eclipse/paho.mqtt.golang"
	_ "modernc.org/sqlite"
)
