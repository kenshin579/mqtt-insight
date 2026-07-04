# mqtt-insight 개발·릴리스 진입점
.PHONY: build test dev run down status release help

help: ## 타겟 목록
	@grep -E '^[a-z]+:.*##' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  make %-22s %s\n", $$1, $$2}'

build: ## 프로덕션 빌드 (wails build -clean)
	wails build -clean

test: ## 전체 테스트 (Go vet/test + vitest + tsc)
	go vet ./... && go test ./...
	cd frontend && npx vitest run && npx tsc --noEmit

dev: ## wails dev 모드
	wails dev

run: ## UI 테스트 환경 기동 (브로커+시드+앱+피드, 멱등)
	./scripts/dev-env.sh up

down: ## UI 테스트 환경 정리
	./scripts/dev-env.sh down

status: ## UI 테스트 환경 상태
	./scripts/dev-env.sh status

release: ## GitHub Release 발행 — make release VERSION=v0.2.0 [FORCE=1]
ifndef VERSION
	$(error 사용법: make release VERSION=v0.2.0 [FORCE=1])
endif
	./scripts/release.sh $(VERSION) $(if $(FORCE),--force,)
