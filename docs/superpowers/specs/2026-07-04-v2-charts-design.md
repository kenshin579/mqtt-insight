# v2 인사이트 계층 — 숫자 차트 + 통계 스펙

> 작성일: 2026-07-04 · 상태: 승인 대기(스펙 리뷰) · 브랜치: `feature/v2-charts`
> 선행: [v1 설계](2026-07-02-mqtt-insight-v1-design.md) §1(비전: v2 = 차트·diff·rate — diff는 first-redesign에서 조기 구현됨)

## 1. 배경과 목표

시장 조사에서 확인한 핵심 차별화 — "유지되는 오픈소스 중 **토픽 트리 + diff + 숫자 차트**를 모두 갖춘 도구 없음" — 의 마지막 조각. 토픽의 숫자 값 변화를 실시간 라인 차트로 보여주고 기본 통계를 제공한다.

## 2. 결정 사항

| 항목 | 결정 |
|---|---|
| 데이터 추출 | 숫자 payload(`23.4` → 가상 키 `value`) + **JSON 최상위 숫자 키 자동 감지**. 중첩 경로는 v2.1 |
| 데이터 소스 | 링버퍼(History) 기본 + **기존 Live/Recorded 토글 그대로 적용**(Recorded=QueryRecorded+Refresh). 신규 저장소 없음 |
| 통계 | 키별 **now·min·max·avg** 스탯 행 + 토픽 선택 시 툴바 msg/s를 **해당 토픽 기준**으로 전환(전체 뷰는 기존 전역) |
| 배치 | **상세 패널 모드 탭 "메시지 \| 차트"** (44% 패널, 새 레이아웃 없음) |
| 렌더러 | **uPlot** (~45KB canvas, 의존성 +1, 자체 타입 포함) |
| 시리즈 계산 | 파생 계산 — 현재 rows에서 useMemo 재계산(≤500pt). 증분 누적기 없음(YAGNI) |
| 백엔드 | **변경 없음** |

## 3. UX 상세

### 상세 패널 모드 탭
- 헤더 좌측에 모드 탭: `t("tabMessage")` | `t("tabChart")`. 메시지 모드=기존 그대로(포맷 탭+Diff). 차트 모드=포맷/Diff 컨트롤 숨김.
- 모드는 세션 sticky(스토어), 토픽 바꿔도 유지. 숫자 데이터가 없는 토픽에서 차트 모드면 empty state.

### 키 칩 (레전드 겸 토글)
- 현재 rows에서 숫자 키 자동 감지. plain 숫자 payload는 단일 키 `value`.
- 칩 = 색 점 8px + 키명. 클릭으로 표시 토글. 기본 활성: 첫 감지 키 1개.
- **색 배정: 키 최초 등장 순서로 팔레트 인덱스 고정**(토픽 세션 내 sticky — 색은 엔티티를 따라감, 토글/재정렬로 안 바뀜). 동시 활성 최대 5키(초과 선택 시 안내 툴팁).

### 차트 (small multiples)
- **활성 키마다 자체 y스케일 미니 차트를 세로 스택** — dual-axis 금지 원칙 준수. 미니 차트 높이 ~110px.
- x축(시간) 정렬 + **uPlot cursor sync**로 크로스헤어 동기화.
- 미니 차트 헤더: 색 점 + 키명(mono) + `now N · min N · max N · avg N` — **값은 텍스트 토큰**(--text/--dim), 시리즈 색 사용 금지.
- hover: 크로스헤어 + 툴팁(HH:MM:SS + 값).
- 라인 2px, 포인트 없음(hover 시만), 그리드 recessive(--line 색).
- Live: liveMessages 갱신에 따라 실시간 재계산. paused면 리스트와 동일 스냅샷. Recorded: Refresh 버튼 공유.

### 검증된 차트 팔레트 (dataviz 스킬 검증 스크립트 통과 — 눈대중 아님)
- **다크**(서피스 #1c1c22): `#4f8cff` `#7b5cff` `#2fa896` `#c9791f` `#d05ca8` — 전 체크 PASS (L밴드 0.48–0.67, 크로마, CVD ΔE≥14.2, 대비≥3:1)
- **라이트**(서피스 #fbfbfd): `#3d6fd6` `#6a4de0` `#0e9f87` `#b5651f` `#b8438f` — 전 체크 PASS
- status 색(ok/warn/err/retained)은 시리즈에 재사용하지 않는다.

### 토픽별 msg/s
- MessageList 툴바: 토픽 선택 시 해당 토픽의 최근 5초 수신량, 전체 뷰는 기존 전역 계산 유지. 표기 동일(`X.X msg/s`).

## 4. 아키텍처

**신규 (전부 프론트)**
- `lib/series.ts` — 순수 함수(vitest TDD 대상):
  - `extractNumericKeys(msgs: Message[]): string[]` — 등장 순서 유지, plain 숫자면 `["value"]`
  - `buildSeries(msgs: Message[], key: string): { times: number[]; values: (number|null)[] }` — JSON 파싱 실패/키 부재/비숫자 → 해당 포인트 null(갭)
  - `seriesStats(values: (number|null)[]): { now, min, max, avg } | null` — 전부 null이면 null
- `lib/chartPalette.ts` — `CHART_DARK`/`CHART_LIGHT` 배열 + `chartColor(index, theme)` (index % 5).
- `components/UPlotChart.tsx` — uPlot 얇은 래퍼: props `{ times, values, color, height, syncKey }`; create/setData/destroy, ResizeObserver로 폭 추적.
- `components/TopicChart.tsx` — 키 감지·칩·색 배정(sticky map)·스탯·미니 차트 스택·empty state. props `{ rows: Message[] }`.

**수정**
- `components/MessageDetail.tsx` — 모드 탭 추가, 차트 모드 시 `<TopicChart rows={...}>` 렌더(rows는 MessageList가 이미 계산한 것을 prop으로 전달 — MessageList에서 detail로 rows 전달 구조로 소폭 변경).
- `components/MessageList.tsx` — rows를 MessageDetail에 전달, msg/s를 선택 토픽 기준으로 분기.
- `store/appStore.ts` — `detailMode: "message" | "chart"` + setter.
- `lib/i18n.ts` — 신규 키(아래).
- `package.json` — `uplot` 추가(+ uPlot 기본 CSS import).

**의존성**: `uplot` 1개. 백엔드·Go 변경 없음.

## 5. i18n 신규 키 (ko/en 패리티)
- `tabMessage`: 메시지 / Message
- `tabChart`: 차트 / Chart
- `chartNoNumeric`: 이 토픽엔 숫자 데이터가 없어요 / No numeric data on this topic
- `chartNoNumericHint`: 숫자 payload 또는 JSON의 숫자 필드가 있으면 차트가 그려져요. / Charts appear for numeric payloads or numeric JSON fields.
- `chartMaxKeys`: 동시에 5개 키까지 표시할 수 있어요 / Up to 5 keys can be shown at once
- 스탯 라벨 `now/min/max/avg`는 비번역 리터럴(메타 라벨과 동일 원칙).

## 6. 에러 처리
- JSON 파싱 실패·키 부재·NaN/Infinity → null 포인트(uPlot 갭 렌더). 시리즈 전체가 null이면 해당 키 칩 비활성 스타일.
- rows 0개(지우기 직후 등) → empty state.
- uPlot 생성 실패(이론상) → try/catch 후 empty state 폴백.

## 7. 테스트
- **vitest TDD**: `series.ts` 전 함수 — plain 숫자/JSON 숫자 키/문자열 값 무시/파싱 실패 갭/키 부재 갭/NaN 제외/stats(빈·단일·혼합 null)/등장 순서.
- `chartPalette.ts` — index 순환, 테마 분기(간단).
- 팔레트 검증: 본 스펙 §3에 검증 결과 기록(스크립트 재실행 명령 포함 — `dataviz` 스킬 `scripts/validate_palette.js`).
- GUI: `docs/MANUAL_TESTING.md`에 "차트" 섹션 추가(키 칩 토글·색 고정·hover 동기화·Recorded 전환·pause 스냅샷·라이트 테마 색 전환·msg/s 토픽 전환).

## 8. 비목표 (v2.1+)
중첩 JSON 경로(`sensor.temp`), 다중 토픽 비교 차트, 차트 이미지/CSV 내보내기, 트리 노드 rate 뱃지, 시간 창 선택(현재는 버퍼 전체).
