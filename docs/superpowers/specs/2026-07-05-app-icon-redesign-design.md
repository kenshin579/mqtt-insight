# 앱 아이콘 재디자인 — 랜딩 로고 스타일 "라이브 포인트"

- 날짜: 2026-07-05
- 상태: 승인됨 (후보 4종 중 C안 선택)

## 배경

v0.1.0은 임시 생성 아이콘(그라디언트 + ◈ 다이아몬드 링, `scripts/gen-icon.go`)으로 출시했다.
랜딩 페이지(https://mqtt-insight.advenoh.pe.kr/)의 로고 — 파랑→보라 그라데이션 라운드 사각형 위
차트 라인(꺾은선이 M자 산 모양) — 스타일이 확정 브랜드가 되었으므로, 앱 아이콘과 앱 내 UI 로고를
여기에 맞춘다.

## 확정 디자인 (후보 C: 라이브 포인트)

랜딩 로고 지오메트리를 그대로 쓰되, 차트 라인 끝에 실시간 데이터 점을 추가한다.
기준 좌표계는 랜딩 로고와 동일한 viewBox `0 0 24 24`:

- **배경**: 라운드 사각형 `rect(2, 2, 20, 20, rx=5)`, 135° 선형 그라데이션 `#4f8cff → #9f6bff`
- **차트 라인**: `M6 15.5 L9.5 10 L12.5 14 L15 9 L17.5 14.4`, 흰색(#fff), stroke-width 1.8,
  round cap/join
- **데이터 점**: 원 `(17.9, 15.2) r=1.7`, 흰색 — 라인 진행 방향의 연장선상
- 아이콘 파일(PNG/ICO)은 rect 바깥 영역이 투명

랜딩 로고와의 차이는 데이터 점 추가뿐이며, 웹/앱 브랜드 일관성을 유지한다.

## 산출물과 변경 범위

### 1. `scripts/gen-icon.go` 재작성

- 기존 ◈ 렌더링을 위 디자인으로 교체
- 꺾은선은 선분까지의 거리 ≤ stroke 반폭 판정으로 렌더링 (round cap/join은 거리 판정으로 자연 획득)
- 4× 슈퍼샘플링 후 다운스케일로 안티앨리어싱 추가 (기존 하드 엣지 방식은 16px ICO에서 계단 현상)
- 출력은 기존과 동일: `build/appicon.png`(1024px), `build/windows/icon.ico`(16/32/48/256)
- macOS ICNS는 wails build가 `build/appicon.png`에서 생성하므로 별도 산출물 없음

### 2. 앱 내 로고 교체 — `Logo.tsx` 컴포넌트 신설

`frontend/src/components/Logo.tsx`: 확정 디자인 SVG를 렌더링, `size` prop(px)만 받는 순수
프리젠테이션 컴포넌트. SVG가 자체 그라데이션 배경을 포함하므로 CSS 배경 불필요.

교체 지점 3곳 (현재 모두 `◈` 텍스트 + CSS `linear-gradient(135deg,#4f8cff,#7b5cff)` 배경):

| 파일 | 위치 | 현재 | 변경 |
|---|---|---|---|
| `App.tsx:89` | 타이틀바 `.app-icon` | ◈ 16px | `<Logo size={16} />` |
| `Welcome.tsx:9` | 히어로 `.hero-icon` | ◈ 60px | `<Logo size={60} />` |
| `ConnectionHome.tsx:60` | `.app-icon.lg` | ◈ 52px | `<Logo size={52} />` |

`App.css`의 해당 클래스에서 그라데이션 배경/글자 스타일을 제거하고 크기·정렬만 남긴다.
구 그라데이션 색 `#7b5cff`는 랜딩과 동일한 `#9f6bff`로 통일된다(SVG 내부 정의).

## 에러 처리

해당 없음 — 정적 에셋 생성과 프리젠테이션 컴포넌트 교체만 있다.

## 테스트

- `go run scripts/gen-icon.go` 실행 후 생성된 PNG를 열어 시안과 일치하는지 육안 확인
  (1024px 전체 + 16px 축소 가독성)
- `make test` (go vet/test + vitest + tsc) 통과
- `make run`으로 앱을 띄워 타이틀바/웰컴/커넥션 홈 3곳의 로고 렌더링 확인
