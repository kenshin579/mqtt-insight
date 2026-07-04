# 릴리스 준비 스펙 — v0.1.0

> 작성일: 2026-07-04 · 상태: 승인 대기(스펙 리뷰) · 브랜치: `chore/release-prep`

## 1. 목표

mqtt-insight의 첫 공개 릴리스(v0.1.0)를 태그 한 번으로 만들 수 있는 파이프라인을 구축한다. macOS(universal) + Windows(amd64) 산출물, 자동 릴리스 노트, 설치 문서 포함.

## 2. 결정 사항

| 항목 | 결정 |
|---|---|
| macOS 서명 | **미서명** (Apple Developer 계정 없음). README에 우회 안내. 워크플로에 서명 단계 주석으로 남겨 추후 시크릿만 추가하면 활성화 |
| 플랫폼 | macOS universal(arm64+Intel) + Windows amd64 (NSIS 인스톨러 + portable zip). Linux 비목표 |
| 버전 | **v0.1.0** 시작 (semver, 내부 마일스톤 명칭과 별개) |
| 릴리스 방식 | `v*` 태그 push → GitHub Actions 자동 빌드·릴리스 |
| author 이메일 | wails.json을 `kenshin579@gmail.com`으로 변경 |

## 3. 구성 요소

### 3.1 CI 워크플로 (`.github/workflows/ci.yml`)
- 트리거: PR + main push
- ubuntu-latest 1-job: Go 1.26 셋업 → `go vet ./...` + `go test ./...` / Node 셋업 → `npm ci` + `npx vitest run` + `npx tsc --noEmit`
- wails 빌드는 하지 않음(플랫폼 의존·비용 — 릴리스 워크플로가 담당)

### 3.2 릴리스 워크플로 (`.github/workflows/release.yml`)
- 트리거: `push: tags: ['v*']`
- **build-macos** (macos-latest): Go+Node+wails CLI 셋업 → `wails build -platform darwin/universal -ldflags "-X main.version=${TAG}"` → `ditto -c -k --keepParent` 로 `mqtt-insight-${TAG}-macos-universal.zip` → artifact 업로드
- **build-windows** (windows-latest): 동일 셋업 → `wails build -platform windows/amd64 -nsis -ldflags "-X main.version=${TAG}"` → NSIS 인스톨러(`mqtt-insight-${TAG}-windows-amd64-installer.exe`) + exe zip(`…-portable.zip`) → artifact 업로드
- **release** (needs 위 2개): artifacts 다운로드 → `gh release create ${TAG} --generate-notes` + 파일 첨부
- macOS 서명/노타라이즈 단계는 주석 블록으로 포함(활성화 조건: `MACOS_CERT_*` 시크릿 존재)

### 3.3 버전 표시
- `main.go`: `var version = "dev"` (ldflags `-X main.version=` 주입)
- `App`에 `GetVersion() string` 바인딩 추가 → 설정 모달 푸터에 `mqtt-insight {version}` 표시(dim, 12px)
- i18n 불필요(앱명+버전 리터럴)

### 3.4 앱 아이콘
- `build/appicon.png`(현재 Wails 기본)를 앱 내 아이콘과 동일한 디자인으로 교체: 1024×1024, `linear-gradient(135deg, #4f8cff → #7b5cff)` 대각 그라디언트 + 흰색 ◈ 글리프, radius ~22%(macOS 스타일 라운드는 시스템이 처리하므로 정사각+투명 모서리)
- 생성: 일회성 Go 스크립트(`image` 표준 라이브러리, 그라디언트+다이아몬드 도형) → PNG 커밋. `.icns`/`.ico` 변환은 wails build가 자동 수행(darwin은 iconutil, windows는 icon.ico 재생성 필요 시 스크립트에서 함께 생성)

### 3.5 문서
- **README 설치 섹션**(Features 위): Releases 링크, macOS — "미서명 앱: 우클릭→열기 또는 `xattr -cr /Applications/mqtt-insight.app`", Windows — SmartScreen "추가 정보→실행" 안내
- **`docs/RELEASING.md`**: 릴리스 절차(버전 결정 → `git tag vX.Y.Z && git push --tags` → Actions 확인 → 릴리스 페이지 검증 체크리스트 → 설치 스모크 테스트)

### 3.6 메타데이터
- `wails.json` author email → `kenshin579@gmail.com`

## 4. 에러 처리 / 엣지
- CI 실패 시 릴리스 job 미실행(needs 체인)
- 태그 재사용 방지: `gh release create`는 기존 릴리스 존재 시 실패 — 의도된 동작(태그 삭제 후 재시도는 RELEASING.md에 명시)
- wails CLI 버전 고정(v2.11.x)으로 러너 재현성 확보

## 5. 테스트/검증
- ci.yml: PR로 실제 트리거해 통과 확인(이 브랜치의 PR 자체가 첫 검증)
- release.yml: **머지 후 `v0.1.0` 태그로 실제 릴리스 1회 실행**이 최종 검증(드라이런 불가). 실패 시 수정 → 태그 재발행 절차는 RELEASING.md 따름
- 아이콘: 로컬 `wails build` 후 .app 아이콘 확인
- 버전 표시: 로컬 빌드(dev) + 설정 모달 확인

## 6. 비목표
macOS 서명/노타라이즈 실행(구조만 준비), Linux, 자동 업데이트, Homebrew/winget/Scoop 배포, CHANGELOG 파일(자동 생성 노트로 대체).
