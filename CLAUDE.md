# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

IoT/임베디드 디버깅용 오픈소스 MQTT 데스크톱 클라이언트. Wails v2 + Go 1.25 + React 18 (TypeScript, Vite, zustand).

## 명령어

```bash
make dev          # wails dev 모드
make build        # 프로덕션 빌드 (wails build -clean)
make test         # 전체 테스트: go vet/test + vitest + tsc --noEmit

# 단일 테스트
go test ./internal/store/ -run TestRingBuffer
cd frontend && npx vitest run src/lib/diff.test.ts

# Go 통합 테스트 — localhost:1883 브로커 필요 (make run이 띄워줌)
go test -tags=integration ./internal/mqtt/

# 수동 UI 테스트 환경 (docker mosquitto + retained 시드 + 앱 + 라이브 피드, 멱등)
make run / make down / make status

# 릴리스 (docs/RELEASING.md 참고)
make release VERSION=v0.2.0 [FORCE=1]
```

## 아키텍처

Wails 앱: Go 백엔드와 React 프론트엔드가 한 프로세스에서 돌고, 양방향 브릿지로 통신한다.

**Go → 프론트 데이터 흐름 (push)**: MQTT 메시지 수신 → `internal/app.Batcher`가 50ms 단위로 묶어 → `store.Record()` (+ 녹화 중이면 SQLite) → Wails 이벤트 `mqtt:messages` / `mqtt:tree` / `mqtt:status` emit → `frontend/src/bridge/events.ts`가 유일한 수신 지점으로, zustand 스토어(`frontend/src/store/appStore.ts`)에 반영. UI 상태는 이 단일 스토어에 모여 있다.

**프론트 → Go 호출 (request)**: `app.go`의 `App` 메서드(Connect, Publish, SaveProfile 등)가 Wails 바인딩으로 노출됨. `frontend/wailsjs/`는 wails가 생성하는 코드 — 직접 수정 금지, 백엔드 시그니처 변경 시 `wails dev`/`wails build`가 재생성.

**Go 패키지 구조** (`internal/`):
- `mqtt/` — `MQTTClient` 인터페이스 뒤로 paho v3(`v3.go`)와 v5(`v5.go`) 구현을 감춤. TLS 설정은 `tlsconfig.go`
- `store/` — 토픽별 링 버퍼(`ringbuffer.go`) + 토픽 트리 집계(`tree.go`) 인메모리 스토어, per-topic 녹화용 `sqlite.go`
- `config/` — 프로필/설정 JSON 영속화 (OS별 경로는 `paths.go`)
- `app/` — 메시지 배칭 emitter

**프론트 구조** (`frontend/src/`): `lib/`은 순수 함수 모듈로 vitest 테스트가 같은 위치에 있음 (payload 포맷, diff, MQTT 토픽 매칭, 차트 시리즈 등). 차트는 uPlot(`UPlotChart.tsx`), 트리는 react-arborist, 메시지 리스트는 react-window 가상화.

## 설계 문서

`docs/superpowers/specs/`(설계)와 `plans/`(구현 계획)에 기능별 스펙이 날짜 prefix로 쌓여 있다. 기능의 의도나 요구사항이 궁금하면 여기부터 볼 것. 수동 테스트 체크리스트는 `docs/MANUAL_TESTING.md`.

## Git

- 커밋 메시지: 영어, conventional commits (`feat:`, `fix:`, `chore:`, `ci:`, `docs:`)
- 브랜치 정책: 글로벌 정책 따름 (main 직접 commit 금지, feature 브랜치 + PR)
