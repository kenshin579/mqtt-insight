#!/usr/bin/env bash
# run.sh — 원커맨드 실행: 도커 브로커 + 시드 + mqtt-insight 앱 + 라이브 피드
#
#   ./run.sh          전부 실행 (= scripts/dev-env.sh up)
#   ./run.sh down     전부 정리
#   ./run.sh app      앱만 재빌드+재실행
#   ./run.sh status   상태 확인
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/scripts/dev-env.sh" "${1:-up}"
