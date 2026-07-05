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
