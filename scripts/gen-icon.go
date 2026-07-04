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
