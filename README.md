# mqtt-insight

An open-source MQTT desktop client for IoT/embedded debugging, built with Wails + Go + React.

## Features

- Connection profiles over TCP / TLS / WebSocket, supporting MQTT 3.1.1 and 5.0
- Auto-aggregating topic tree built from wildcard subscriptions (`#`, `+`)
- Message history per topic with Plain / JSON / Hex / Base64 formatting
- Publish panel with QoS, retained flag, and MQTT 5.0 properties (user properties, content type, etc.)
- Optional per-topic message recording to SQLite
- Dark and light themes, configurable ring buffer size and default payload format

## Development

```bash
wails dev
```

## Build

```bash
wails build
```

## Requirements

- Go 1.25+
- Node.js (for the frontend)
- Wails v2

## Testing

```bash
# Go unit tests
go test ./...

# Go integration tests (requires a local MQTT broker at localhost:1883, e.g. Mosquitto)
go test -tags=integration ./internal/mqtt/

# Frontend tests
cd frontend && npm test
```

## Roadmap (v2+)

The following are planned but not yet implemented: value-change diff highlighting, real-time numeric payload charts, multiple simultaneous connections, and mTLS.

## License

TBD
