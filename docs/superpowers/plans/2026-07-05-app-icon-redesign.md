# 앱 아이콘 재디자인 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 앱 아이콘(PNG/ICO)과 앱 내 UI 로고 3곳을 랜딩 페이지 로고 스타일("라이브 포인트" 시안)로 교체한다.

**Architecture:** `scripts/gen-icon.go`(단독 실행 스크립트)를 새 디자인으로 재작성해 정적 아이콘 파일을 재생성하고, 프론트에는 `Logo.tsx` SVG 컴포넌트를 신설해 ◈ 텍스트 로고 3곳을 교체한다. 스펙: `docs/superpowers/specs/2026-07-05-app-icon-redesign-design.md`

**Tech Stack:** Go 표준 라이브러리(image/png), React 18 + TypeScript

**테스트 노트:** `gen-icon.go`는 `//go:build ignore` 단독 스크립트(go test 불가), `Logo.tsx`는 순수 SVG 마크업이며 프론트 vitest는 jsdom 없이 순수 함수만 테스트한다. 따라서 이 계획의 검증은 (1) 생성 이미지 육안 확인, (2) `make test`(go vet/test + vitest + tsc) 회귀 확인으로 한다. 새 테스트 프레임워크 추가는 YAGNI.

---

### Task 1: `scripts/gen-icon.go` 재작성 + 아이콘 재생성

**Files:**
- Modify: `scripts/gen-icon.go` (전체 교체)
- Regenerate: `build/appicon.png`, `build/windows/icon.ico`

기하는 모두 viewBox `0 0 24 24` 기준이며 픽셀 좌표로 `u = 캔버스크기/24` 배율 변환한다:
라운드 사각형 rect(2,2,20,20 rx5) + 135° 그라데이션 `#4f8cff→#9f6bff`, 흰 꺾은선
(6,15.5)→(9.5,10)→(12.5,14)→(15,9)→(17.5,14.4) stroke 1.8, 데이터 점 (17.9,15.2) r1.7.
꺾은선은 "선분까지 거리 ≤ 반폭(0.9u)" 판정으로 그리고(끝단/모서리 round는 거리 판정으로 자연 획득),
4× 슈퍼샘플링 후 평균 다운스케일로 안티앨리어싱한다.

- [ ] **Step 1: gen-icon.go 전체 교체**

```go
// scripts/gen-icon.go — 앱 아이콘 생성 (1024px PNG + windows ICO)
// 실행: go run scripts/gen-icon.go
// 디자인: 랜딩 로고 "라이브 포인트" — 라운드 사각형(135deg, #4f8cff → #9f6bff)
// + 흰 차트 라인(M자 산 모양) + 라인 끝 데이터 점
// 스펙: docs/superpowers/specs/2026-07-05-app-icon-redesign-design.md
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

// 슈퍼샘플링 배율 — 작은 크기(16px ICO)에서도 계단 없이 렌더링
const ss = 4

// viewBox 0 0 24 24 기준 지오메트리 (랜딩 로고와 동일 + 데이터 점)
var chartPts = [][2]float64{{6, 15.5}, {9.5, 10}, {12.5, 14}, {15, 9}, {17.5, 14.4}}

func lerp(a, b uint8, t float64) uint8 { return uint8(float64(a) + (float64(b)-float64(a))*t) }

// segDist: 점 (px,py)에서 선분 (ax,ay)-(bx,by)까지의 거리
func segDist(px, py, ax, ay, bx, by float64) float64 {
	dx, dy := bx-ax, by-ay
	t := ((px-ax)*dx + (py-ay)*dy) / (dx*dx + dy*dy)
	t = math.Max(0, math.Min(1, t))
	return math.Hypot(px-(ax+t*dx), py-(ay+t*dy))
}

// renderHi: size*ss 픽셀 캔버스에 하드 엣지로 렌더 (이후 다운스케일이 AA 담당)
func renderHi(size int) *image.RGBA {
	n := size * ss
	img := image.NewRGBA(image.Rect(0, 0, n, n))
	u := float64(n) / 24.0
	c1 := [3]uint8{0x4f, 0x8c, 0xff}
	c2 := [3]uint8{0x9f, 0x6b, 0xff}
	m, w, rad := 2*u, 20*u, 5*u // rect 마진/폭/코너 반경
	half := 0.9 * u             // stroke 1.8의 반폭
	dotX, dotY, dotR := 17.9*u, 15.2*u, 1.7*u

	for y := 0; y < n; y++ {
		for x := 0; x < n; x++ {
			fx, fy := float64(x)+0.5, float64(y)+0.5
			// 라운드 사각 마스크 (rect m..m+w, 코너 rad)
			dx := math.Max(math.Max((m+rad)-fx, fx-(m+w-rad)), 0)
			dy := math.Max(math.Max((m+rad)-fy, fy-(m+w-rad)), 0)
			if fx < m || fx > m+w || fy < m || fy > m+w || dx*dx+dy*dy > rad*rad {
				continue // 투명
			}
			// 차트 라인 + 데이터 점 (흰색)
			d := math.Inf(1)
			for i := 0; i+1 < len(chartPts); i++ {
				d = math.Min(d, segDist(fx, fy, chartPts[i][0]*u, chartPts[i][1]*u, chartPts[i+1][0]*u, chartPts[i+1][1]*u))
			}
			if d <= half || math.Hypot(fx-dotX, fy-dotY) <= dotR {
				img.Set(x, y, color.RGBA{255, 255, 255, 255})
				continue
			}
			// 135deg 그라데이션 (rect 좌상→우하)
			t := math.Min(1, math.Max(0, ((fx-m)+(fy-m))/(2*w)))
			img.Set(x, y, color.RGBA{lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t), 255})
		}
	}
	return img
}

// render: ss*ss 블록 평균으로 다운스케일 (RGBA는 알파 프리멀티플라이라 단순 평균이 정확)
func render(size int) *image.RGBA {
	hi := renderHi(size)
	img := image.NewRGBA(image.Rect(0, 0, size, size))
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			var r, g, b, a uint32
			for j := 0; j < ss; j++ {
				for i := 0; i < ss; i++ {
					o := hi.PixOffset(x*ss+i, y*ss+j)
					r += uint32(hi.Pix[o])
					g += uint32(hi.Pix[o+1])
					b += uint32(hi.Pix[o+2])
					a += uint32(hi.Pix[o+3])
				}
			}
			k := uint32(ss * ss)
			o := img.PixOffset(x, y)
			img.Pix[o], img.Pix[o+1], img.Pix[o+2], img.Pix[o+3] = uint8(r/k), uint8(g/k), uint8(b/k), uint8(a/k)
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

- [ ] **Step 2: 실행해 아이콘 재생성**

Run: `cd /Users/user/GolandProjects/mqtt-insight && go run scripts/gen-icon.go`
Expected: `generated build/appicon.png + build/windows/icon.ico` 출력, 에러 없음

- [ ] **Step 3: 생성 결과 육안 확인**

`build/appicon.png`를 이미지 뷰어(에이전트는 Read 도구)로 열어 확인:
그라데이션 라운드 사각형 + 흰 M자 차트 라인 + 우측 하단 데이터 점, 모서리 밖 투명.
16px 축소 가독성도 확인:

Run: `sips -z 64 64 build/appicon.png --out /tmp/icon-64.png` 후 확인 (또는 뷰어에서 축소)
Expected: 시안 C와 동일한 형태, 계단 현상 없음

- [ ] **Step 4: 커밋**

```bash
git add scripts/gen-icon.go build/appicon.png build/windows/icon.ico
git commit -m "feat: redesign app icon to landing logo style (chart line + live dot)"
```

---

### Task 2: `Logo.tsx` 신설 + 앱 내 ◈ 로고 3곳 교체

**Files:**
- Create: `frontend/src/components/Logo.tsx`
- Modify: `frontend/src/App.tsx:89` (titlebar), `frontend/src/components/Welcome.tsx:9` (hero), `frontend/src/components/ConnectionHome.tsx:60` (home detail)
- Modify: `frontend/src/App.css:11-12` (`.titlebar .app-icon`), `App.css:83-85` (`.hero-icon`), `App.css:119` (`.home-detail .app-icon.lg`)

- [ ] **Step 1: Logo 컴포넌트 생성**

`frontend/src/components/Logo.tsx`:

```tsx
import { useId } from "react";

// 앱 로고 — 랜딩 페이지 로고와 동일 지오메트리 + 데이터 점 ("라이브 포인트").
// gradient id는 인스턴스마다 useId로 발급 (동일 화면에 여러 개 렌더돼도 충돌 없음).
export function Logo({ size }: { size: number }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4f8cff" />
          <stop offset="1" stopColor="#9f6bff" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="20" height="20" rx="5" fill={`url(#${id})`} />
      <path
        d="M6 15.5 9.5 10l3 4 2.5-5 2.5 5.4"
        stroke="#fff"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="17.9" cy="15.2" r="1.7" fill="#fff" />
    </svg>
  );
}
```

- [ ] **Step 2: App.tsx 타이틀바 교체**

import 추가 (기존 컴포넌트 import 블록에):

```tsx
import { Logo } from "./components/Logo";
```

`App.tsx:89` 교체:

```tsx
// 변경 전
<span className="app-icon">◈</span>
// 변경 후
<span className="app-icon"><Logo size={16} /></span>
```

- [ ] **Step 3: Welcome.tsx 히어로 교체**

import 추가:

```tsx
import { Logo } from "./Logo";
```

`Welcome.tsx:9` 교체:

```tsx
// 변경 전
<div className="hero-icon">◈</div>
// 변경 후
<div className="hero-icon"><Logo size={60} /></div>
```

- [ ] **Step 4: ConnectionHome.tsx 교체**

import 추가:

```tsx
import { Logo } from "./Logo";
```

`ConnectionHome.tsx:60` 교체:

```tsx
// 변경 전
<div className="app-icon lg">◈</div>
// 변경 후
<div className="app-icon lg"><Logo size={52} /></div>
```

- [ ] **Step 5: App.css 정리 — 그라데이션 배경 제거, 레이아웃만 유지**

SVG가 배경·모양을 자체 포함하므로 CSS는 배치만 담당한다. 히어로의 글로우는
box-shadow(사각 박스 기준) 대신 drop-shadow(실제 모양 기준)로 바꾼다.

`App.css:11-12` 교체:

```css
/* 변경 전 */
.titlebar .app-icon { width: 16px; height: 16px; border-radius: 4px; background: linear-gradient(135deg,#4f8cff,#7b5cff);
  display: flex; align-items: center; justify-content: center; font-size: 10px; color: #fff; margin-left: 6px; }
/* 변경 후 */
.titlebar .app-icon { display: flex; margin-left: 6px; }
```

`App.css:83-85` 교체:

```css
/* 변경 전 */
.hero-icon { width: 60px; height: 60px; border-radius: 15px; background: linear-gradient(135deg,#4f8cff,#7b5cff);
  display: flex; align-items: center; justify-content: center; font-size: 30px; color: #fff;
  box-shadow: 0 12px 30px rgba(79,140,255,.35); }
/* 변경 후 */
.hero-icon { display: flex; filter: drop-shadow(0 12px 30px rgba(79,140,255,.35)); }
```

`App.css:119` 교체:

```css
/* 변경 전 */
.home-detail .app-icon.lg { width: 52px; height: 52px; border-radius: 14px; background: linear-gradient(135deg,#4f8cff,#7b5cff); display: flex; align-items: center; justify-content: center; font-size: 26px; color: #fff; }
/* 변경 후 */
.home-detail .app-icon.lg { display: flex; }
```

- [ ] **Step 6: 잔여 ◈ 확인**

Run: `grep -rn "◈" frontend/src/`
Expected: 결과 없음 (전부 교체됨)

- [ ] **Step 7: 타입/테스트 회귀 확인**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: tsc 에러 없음, vitest 전체 PASS

- [ ] **Step 8: 커밋**

```bash
git add frontend/src/components/Logo.tsx frontend/src/App.tsx frontend/src/components/Welcome.tsx frontend/src/components/ConnectionHome.tsx frontend/src/App.css
git commit -m "feat(frontend): replace text logo with landing-style Logo SVG component"
```

---

### Task 3: 전체 검증

- [ ] **Step 1: 전체 테스트**

Run: `cd /Users/user/GolandProjects/mqtt-insight && make test`
Expected: go vet/test + vitest + tsc 모두 PASS

- [ ] **Step 2: 앱 실행 육안 확인**

Run: `make run` (docker mosquitto + 앱 기동, 멱등)
확인 목록 — 타이틀바(16px)·웰컴 히어로(60px)·커넥션 홈(52px) 3곳에 새 로고가 렌더링되고,
히어로 글로우가 로고 모양을 따라 표시되는지. 확인 후 `make down`.

- [ ] **Step 3: (수동, 선택) Dock 아이콘 확인**

`make build` 후 `build/bin/mqtt-insight.app` 실행 시 Dock에 새 아이콘이 뜨는지 확인.
wails build가 `build/appicon.png`에서 ICNS를 재생성한다.
