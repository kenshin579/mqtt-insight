# Release Prep (v0.1.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `v*` 태그 push 한 번으로 macOS universal + Windows 산출물이 첨부된 GitHub Release가 만들어지는 파이프라인 + 버전 표시 + 아이콘 + 설치 문서.

**Architecture:** GitHub Actions 2개 워크플로(ci=테스트, release=태그 트리거 매트릭스 빌드→릴리스). 버전은 태그→ldflags로 `main.version`에 주입, `GetVersion` 바인딩으로 설정 모달 푸터에 표시. 아이콘은 일회성 Go 스크립트로 생성해 커밋.

**Tech Stack:** GitHub Actions · wails CLI v2.11 · Go 1.25/Node 22(LTS, CI) · NSIS(windows-latest 내장) · Go `image` 표준 라이브러리(아이콘)

**Branch:** `chore/release-prep` (스펙 커밋 포함, 체크아웃됨). main 커밋 금지. 커밋 트레일러: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

**Spec:** `docs/superpowers/specs/2026-07-04-release-prep-design.md`

---

## File Structure
- Create: `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `scripts/gen-icon.go`, `docs/RELEASING.md`
- Modify: `main.go`(version 변수), `app.go`(GetVersion), `frontend/src/components/SettingsModal.tsx`(푸터 버전), `build/appicon.png`(교체), `build/windows/icon.ico`(교체), `wails.json`(author email), `README.md`(설치 섹션)

---

### Task 1: 버전 변수 + GetVersion 바인딩 + 설정 모달 표시

**Files:**
- Modify: `main.go`, `app.go`, `frontend/src/components/SettingsModal.tsx`, `frontend/src/App.css`

- [ ] **Step 1: main.go에 version 변수 추가**

`var assets embed.FS` 아래에:
```go
// version is injected at release build time via -ldflags "-X main.version=vX.Y.Z".
var version = "dev"
```

- [ ] **Step 2: app.go에 바인딩 추가** (파일 끝)

```go
// GetVersion returns the app version injected at build time ("dev" for local builds).
func (a *App) GetVersion() string { return version }
```

- [ ] **Step 3: 바인딩 재생성** — `wails build -clean` 성공, `frontend/wailsjs/go/main/App.d.ts`에 `GetVersion` 노출 확인.

- [ ] **Step 4: SettingsModal 푸터에 버전 표시**

`frontend/src/components/SettingsModal.tsx`: import에 `GetVersion` 추가(`../../wailsjs/go/main/App`), `useEffect`+`useState`로 로드:
```tsx
const [version, setVersion] = useState("");
useEffect(() => { GetVersion().then(setVersion); }, []);
```
`settings-footer` div 안(완료 버튼 위)에:
```tsx
<div className="settings-version">mqtt-insight {version}</div>
```
App.css에 append:
```css
.settings-version { text-align: center; font-size: 11px; color: var(--dim2); font-family: var(--font-mono); padding-bottom: 6px; }
```

- [ ] **Step 5: 게이트** — `cd frontend && npx tsc --noEmit && npx vitest run` 클린/통과, 로컬 실행 시 "mqtt-insight dev" 표시(수동 확인은 Task 6에서 일괄).

- [ ] **Step 6: Commit**
```bash
git add main.go app.go frontend/src/components/SettingsModal.tsx frontend/src/App.css frontend/wailsjs
git commit -m "feat(release): inject build version and show it in settings

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 2: 앱 아이콘 생성·교체

**Files:**
- Create: `scripts/gen-icon.go`
- Modify: `build/appicon.png`, `build/windows/icon.ico`

- [ ] **Step 1: 아이콘 생성 스크립트 작성**

```go
// scripts/gen-icon.go — 앱 아이콘 생성 (1024px PNG + windows ICO)
// 실행: go run scripts/gen-icon.go
// 디자인: 앱 내 아이콘과 동일 — linear-gradient(135deg, #4f8cff → #7b5cff) + 흰 ◈(다이아몬드 링)
//go:build ignore

package main

import (
	"bytes"
	"encoding/binary"
	"image"
	"image/color"
	"image/png"
	"math"
	"os"
)

func lerp(a, b uint8, t float64) uint8 { return uint8(float64(a) + (float64(b)-float64(a))*t) }

func render(size int) *image.RGBA {
	img := image.NewRGBA(image.Rect(0, 0, size, size))
	s := float64(size)
	c1 := [3]uint8{0x4f, 0x8c, 0xff}
	c2 := [3]uint8{0x7b, 0x5c, 0xff}
	radius := s * 0.22
	cx, cy := s/2, s/2
	// 다이아몬드(◈) 파라미터: 바깥 반경/안쪽 구멍 반경 (맨해튼 거리 기준 링)
	outer := s * 0.30
	inner := s * 0.12

	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			fx, fy := float64(x), float64(y)
			// 라운드 사각 마스크
			dx := math.Max(math.Max(radius-fx, fx-(s-radius)), 0)
			dy := math.Max(math.Max(radius-fy, fy-(s-radius)), 0)
			if dx*dx+dy*dy > radius*radius {
				img.Set(x, y, color.RGBA{0, 0, 0, 0})
				continue
			}
			// 135deg 그라디언트 (좌상→우하)
			t := (fx + fy) / (2 * s)
			r, g, b := lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)
			// ◈ 링: 맨해튼 거리
			m := math.Abs(fx-cx) + math.Abs(fy-cy)
			if m <= outer && m >= inner {
				img.Set(x, y, color.RGBA{255, 255, 255, 255})
			} else {
				img.Set(x, y, color.RGBA{r, g, b, 255})
			}
		}
	}
	return img
}

// writeICO packs PNG frames into a minimal .ico container.
func writeICO(path string, sizes []int) error {
	type entry struct {
		size int
		data []byte
	}
	var entries []entry
	for _, sz := range sizes {
		var buf bytes.Buffer
		if err := png.Encode(&buf, render(sz)); err != nil {
			return err
		}
		entries = append(entries, entry{sz, buf.Bytes()})
	}
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	// ICONDIR
	binary.Write(f, binary.LittleEndian, uint16(0))
	binary.Write(f, binary.LittleEndian, uint16(1))
	binary.Write(f, binary.LittleEndian, uint16(len(entries)))
	offset := 6 + 16*len(entries)
	for _, e := range entries {
		b := byte(e.size)
		if e.size >= 256 {
			b = 0
		}
		f.Write([]byte{b, b, 0, 0})
		binary.Write(f, binary.LittleEndian, uint16(1))
		binary.Write(f, binary.LittleEndian, uint16(32))
		binary.Write(f, binary.LittleEndian, uint32(len(e.data)))
		binary.Write(f, binary.LittleEndian, uint32(offset))
		offset += len(e.data)
	}
	for _, e := range entries {
		f.Write(e.data)
	}
	return nil
}

func main() {
	out, err := os.Create("build/appicon.png")
	if err != nil {
		panic(err)
	}
	if err := png.Encode(out, render(1024)); err != nil {
		panic(err)
	}
	out.Close()
	if err := writeICO("build/windows/icon.ico", []int{16, 32, 48, 256}); err != nil {
		panic(err)
	}
	println("generated build/appicon.png + build/windows/icon.ico")
}
```

- [ ] **Step 2: 실행 + 확인**

Run: `go run scripts/gen-icon.go && file build/appicon.png build/windows/icon.ico`
Expected: PNG 1024x1024 + MS Windows icon. (열어서 육안 확인은 Task 6 스모크에서)

- [ ] **Step 3: 로컬 빌드로 .app 아이콘 반영 확인** — `wails build -clean` 성공(darwin은 appicon.png→icns 자동 변환).

- [ ] **Step 4: Commit**
```bash
git add scripts/gen-icon.go build/appicon.png build/windows/icon.ico
git commit -m "feat(release): branded app icon (gradient + diamond glyph)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 3: CI 워크플로

**Files:** Create: `.github/workflows/ci.yml`

- [ ] **Step 1: 작성**

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: "1.25"
      - name: Go vet & test
        run: |
          go vet ./...
          go test ./...
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - name: Frontend tests & typecheck
        working-directory: frontend
        run: |
          npm ci
          npx vitest run
          npx tsc --noEmit
```

- [ ] **Step 2: 로컬 정합 확인** — 같은 명령을 로컬에서 실행해 전부 통과(`go vet ./... && go test ./...`, frontend에서 `npm ci && npx vitest run && npx tsc --noEmit`). ※ `npm ci`는 node_modules를 재설치함 — 이후 로컬 빌드 정상 동작 확인.

- [ ] **Step 3: Commit**
```bash
git add .github/workflows/ci.yml
git commit -m "ci: add test workflow for PRs and main

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 4: 릴리스 워크플로

**Files:** Create: `.github/workflows/release.yml`

- [ ] **Step 1: 작성**

```yaml
name: Release
on:
  push:
    tags: ["v*"]

permissions:
  contents: write

jobs:
  build-macos:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: "1.25"
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - name: Install wails CLI
        run: go install github.com/wailsapp/wails/v2/cmd/wails@v2.11.0
      - name: Build (universal)
        run: wails build -platform darwin/universal -ldflags "-X main.version=${GITHUB_REF_NAME}"
      # --- macOS 서명/노타라이즈 (Apple Developer 계정 확보 시 활성화) ---
      # - name: Import signing cert
      #   env: { MACOS_CERT_P12: ..., MACOS_CERT_PASSWORD: ... }
      #   run: <security import + codesign --deep --options runtime>
      # - name: Notarize
      #   run: <xcrun notarytool submit --wait + stapler>
      - name: Zip app bundle
        run: ditto -c -k --keepParent build/bin/mqtt-insight.app "mqtt-insight-${GITHUB_REF_NAME}-macos-universal.zip"
      - uses: actions/upload-artifact@v4
        with:
          name: macos
          path: mqtt-insight-*-macos-universal.zip

  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: "1.25"
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - name: Install wails CLI
        run: go install github.com/wailsapp/wails/v2/cmd/wails@v2.11.0
      - name: Build (amd64 + NSIS)
        shell: bash
        run: wails build -platform windows/amd64 -nsis -ldflags "-X main.version=${GITHUB_REF_NAME}"
      - name: Package artifacts
        shell: bash
        run: |
          mv "build/bin/mqtt-insight-amd64-installer.exe" "mqtt-insight-${GITHUB_REF_NAME}-windows-amd64-installer.exe"
          7z a "mqtt-insight-${GITHUB_REF_NAME}-windows-amd64-portable.zip" ./build/bin/mqtt-insight.exe
      - uses: actions/upload-artifact@v4
        with:
          name: windows
          path: |
            mqtt-insight-*-installer.exe
            mqtt-insight-*-portable.zip

  release:
    needs: [build-macos, build-windows]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
        with:
          merge-multiple: true
      - name: Create GitHub Release
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          gh release create "${GITHUB_REF_NAME}" \
            --title "mqtt-insight ${GITHUB_REF_NAME}" \
            --generate-notes \
            mqtt-insight-*.zip mqtt-insight-*.exe
```

주의(구현자): NSIS 인스톨러 산출 파일명은 wails 버전에 따라 `mqtt-insight-amd64-installer.exe` — 빌드 로그에서 실제 이름을 확인하고 mv 경로를 맞출 것(다르면 `ls build/bin`을 스텝에 추가해 진단). windows-latest에는 NSIS·7z 기본 탑재.

- [ ] **Step 2: 문법 검증** — `gh workflow` 는 push 전 불가하므로 YAML 파싱만: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/release.yml'))" && echo OK` (ci.yml도 동일). 실검증은 머지 후 태그 발행(스펙 §5).

- [ ] **Step 3: Commit**
```bash
git add .github/workflows/release.yml
git commit -m "ci: add tag-triggered release workflow (macOS universal + Windows)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 5: 메타데이터 + 문서

**Files:** Modify: `wails.json`, `README.md`; Create: `docs/RELEASING.md`

- [ ] **Step 1: wails.json author email 변경** — `frank.oh@naverlabs.com` → `kenshin579@gmail.com`

- [ ] **Step 2: README 설치 섹션 추가** (Features 섹션 위):

```markdown
## Install

Download the latest build from [Releases](https://github.com/kenshin579/mqtt-insight/releases).

**macOS** (universal — Apple Silicon & Intel): unzip, move `mqtt-insight.app` to Applications.
The app is not code-signed yet — on first launch use right-click → Open, or run:

​```bash
xattr -cr /Applications/mqtt-insight.app
​```

**Windows**: run the installer (`…-installer.exe`), or use the portable zip.
If SmartScreen warns, choose "More info" → "Run anyway".
```
(코드펜스는 실제 파일에선 일반 ```)

- [ ] **Step 3: docs/RELEASING.md 작성**

```markdown
# Releasing

1. main이 릴리스할 상태인지 확인 (CI 그린, MANUAL_TESTING 스모크).
2. 버전 결정 (semver). 태그 발행:
   git tag vX.Y.Z && git push origin vX.Y.Z
3. GitHub Actions → Release 워크플로 성공 확인 (~10분).
4. 릴리스 페이지 검증: macOS zip / Windows installer·portable 3개 첨부, 자동 노트 확인.
5. 설치 스모크: macOS zip 받아 실행(우클릭-열기), 설정 모달 푸터 버전 = 태그 확인.
6. 실패 시: 워크플로 수정 → 릴리스·태그 삭제 후 재발행
   gh release delete vX.Y.Z --yes && git push --delete origin vX.Y.Z && git tag -d vX.Y.Z
   → 수정 머지 후 2번부터 다시.
```

- [ ] **Step 4: Commit**
```bash
git add wails.json README.md docs/RELEASING.md
git commit -m "docs(release): install guide, releasing runbook, author email

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 6: 로컬 스모크 + 전체 게이트

- [ ] **Step 1: 로컬 릴리스 빌드 모사** — `wails build -clean -ldflags "-X main.version=v0.0.0-local"` 성공 후 `./run.sh app` 대신 직접 `open build/bin/mqtt-insight.app` (주의: run.sh app은 ldflags 없이 재빌드하므로 사용 금지). 확인: ① Dock/앱 아이콘이 새 그라디언트+◈ ② 설정 모달 푸터 "mqtt-insight v0.0.0-local".
- [ ] **Step 2: 전체 게이트** — `go vet ./... && go test ./...` + frontend `npx vitest run && npx tsc --noEmit` 전부 통과.
- [ ] **Step 3: 아이콘 육안 확인 결과와 함께 보고** (커밋 없음 — 검증 태스크).

### Task 7 (머지 후 프로세스 — 계획에 기록만):
PR 머지 → `git tag v0.1.0 && git push origin v0.1.0` → Actions 성공 확인 → 릴리스 페이지 검증 → RELEASING.md 5번 스모크. 실패 시 RELEASING.md 6번 절차.

---

## Self-Review 결과
**Spec coverage:** §3.1(T3) §3.2(T4, 서명 주석 포함) §3.3(T1) §3.4(T2, ico 포함) §3.5(T5) §3.6(T5) §5(T6+T7) ✅. **Placeholder:** 서명 주석 블록은 의도된 비활성 코드(스펙 결정) — placeholder 아님. **Type consistency:** `version`/`GetVersion`/`GITHUB_REF_NAME` 일관. **주의 명시:** NSIS 산출 파일명 확인 지시(T4), npm ci 후 로컬 영향(T3), run.sh app의 ldflags 미주입(T6).
