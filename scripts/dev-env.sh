#!/usr/bin/env bash
# dev-env.sh — mqtt-insight 수동 UI 테스트 환경 (macOS)
#
#   scripts/dev-env.sh up      브로커 기동 + retained 시드 + 앱 실행 + 라이브 피드
#   scripts/dev-env.sh down    피드 중단 + 앱 종료 + 브로커 삭제
#   scripts/dev-env.sh feed    라이브 피드만 (재)시작
#   scripts/dev-env.sh app     wails build 후 앱만 재실행
#   scripts/dev-env.sh status  브로커/앱/피드 상태
#
# 환경변수: INTERVAL(피드 간격 초, 기본 2) · DURATION(피드 길이 초, 기본 900)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BROKER=mqtt-insight-dev
APP_BUNDLE="$ROOT/build/bin/mqtt-insight.app"
APP_BIN="$APP_BUNDLE/Contents/MacOS/mqtt-insight"
FEED_PID="$ROOT/.dev-env-feed.pid"
INTERVAL="${INTERVAL:-2}"
DURATION="${DURATION:-900}"

die() { echo "error: $*" >&2; exit 1; }

require_docker() {
  command -v docker >/dev/null || die "docker가 필요합니다"
  docker info >/dev/null 2>&1 || die "docker 데몬이 실행 중이 아닙니다"
}

broker_up() {
  require_docker
  if docker ps --format '{{.Names}}' | grep -q "^${BROKER}$"; then
    echo "broker: 이미 실행 중"
    return
  fi
  docker rm -f "$BROKER" >/dev/null 2>&1 || true
  docker run -d --name "$BROKER" -p 1883:1883 eclipse-mosquitto:2 \
    sh -c "printf 'listener 1883\nallow_anonymous true\n' > /mosquitto/config/mosquitto.conf && exec mosquitto -c /mosquitto/config/mosquitto.conf" >/dev/null
  sleep 2
  echo "broker: localhost:1883 (container ${BROKER})"
}

seed() {
  docker exec "$BROKER" sh -c '
mosquitto_pub -t sensors/json -m "{\"temp\":23.4,\"hum\":61,\"note\":\"text\"}" -r -q 1
mosquitto_pub -t sensors/plain -m "42.5" -r -q 1
mosquitto_pub -t sensors/text -m "no numbers here" -r -q 1
mosquitto_pub -t test/retained-delete-me -m "delete me via context menu" -r -q 1
'
  echo "seed: retained 4토픽 (json 2키+문자열 / plain / text / retained-delete)"
}

feed_stop() {
  if [[ -f "$FEED_PID" ]] && kill -0 "$(cat "$FEED_PID")" 2>/dev/null; then
    kill "$(cat "$FEED_PID")" 2>/dev/null || true
    echo "feed: 중단"
  fi
  rm -f "$FEED_PID"
}

feed_start() {
  feed_stop
  local ticks=$((DURATION / INTERVAL))
  (
    for i in $(seq 1 "$ticks"); do
      temp=$(awk -v n="$i" 'BEGIN{printf "%.1f", 20 + 5*sin(n/6)}')
      hum=$(awk -v n="$i" 'BEGIN{printf "%d", 55 + 10*cos(n/8)}')
      if [ $((i / 10 % 2)) -eq 0 ]; then
        payload="{\"temp\":$temp,\"hum\":$hum,\"note\":\"x\"}"
      else
        payload="{\"temp\":$temp,\"hum\":$hum,\"pressure\":$((1000 + i % 20)),\"note\":\"x\"}"
      fi
      docker exec "$BROKER" sh -c "
        mosquitto_pub -t sensors/json -m '$payload' -q 0
        mosquitto_pub -t sensors/plain -m '$temp' -q 0
      " 2>/dev/null || break
      sleep "$INTERVAL"
    done
    rm -f "$FEED_PID"
  ) &
  echo $! > "$FEED_PID"
  echo "feed: ${INTERVAL}s 간격, ${DURATION}s (pid $(cat "$FEED_PID")) — temp 사인파·hum·간헐 pressure"
}

app_stop() { pkill -f "$APP_BIN" 2>/dev/null && echo "app: 종료" || true; }

app_start() {
  if [[ ! -x "$APP_BIN" ]]; then
    echo "app: 빌드 없음 — wails build 실행"
    (cd "$ROOT" && wails build) | grep -E "Built|ERROR" || true
  fi
  app_stop
  sleep 1
  open "$APP_BUNDLE"
  echo "app: 실행됨"
}

app_rebuild() {
  (cd "$ROOT" && wails build) | grep -E "Built|ERROR" || die "wails build 실패"
  app_stop
  sleep 1
  open "$APP_BUNDLE"
  echo "app: 재빌드 + 실행"
}

status() {
  if docker ps --format '{{.Names}} {{.Status}}' 2>/dev/null | grep "^${BROKER}"; then :; else echo "broker: 없음"; fi
  pgrep -f "$APP_BIN" >/dev/null && echo "app: 실행 중 (pid $(pgrep -f "$APP_BIN" | head -1))" || echo "app: 없음"
  if [[ -f "$FEED_PID" ]] && kill -0 "$(cat "$FEED_PID")" 2>/dev/null; then
    echo "feed: 실행 중 (pid $(cat "$FEED_PID"))"
  else
    echo "feed: 없음"
  fi
}

case "${1:-}" in
  up)     broker_up; seed; app_start; feed_start; echo; status ;;
  down)   feed_stop; app_stop; docker rm -f "$BROKER" >/dev/null 2>&1 && echo "broker: 삭제" || echo "broker: 없음" ;;
  feed)   broker_up >/dev/null; feed_start ;;
  app)    app_rebuild ;;
  status) status ;;
  *)      grep '^#' "$0" | sed -n '2,10p' | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
