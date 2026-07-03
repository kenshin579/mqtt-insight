# first-redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `docs/design/first-redesign/` 디자인 기준으로 UI를 전면 개편하되, 요구사항 레지스트리(A1~G19)의 전 항목이 누락 없이 구현되도록 추적한다.

**Architecture:** 프론트 대규모 재작성(뷰 라우팅 welcome/home/app + 신규 컴포넌트 8종 + 전 컴포넌트 재설계 + i18n + 토큰 시스템) + 백엔드 소폭(구조화 상태 이벤트, CancelConnect, Settings 확장, 링버퍼 즉시 적용). 시각·동작 정본 = 프로토타입 HTML, 카피 정본 = `T` 딕셔너리, 결정 정본 = 스펙 §3.

**Tech Stack:** 기존 유지 — Wails v2 · Go · React+TS · Zustand · react-arborist · react-window. **새 의존성 없음.**

**Branch:** `feature/first-redesign` (스펙 커밋 포함, 체크아웃됨). main 커밋 금지. 커밋 트레일러: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

**정본 문서 (구현자는 담당 태스크의 `covers:` ID를 반드시 읽는다):**
- 레지스트리: `docs/superpowers/specs/2026-07-03-redesign-inventory.md` (픽셀 수치·상태·카피 키 전부 여기 있음)
- 스펙: `docs/superpowers/specs/2026-07-03-first-redesign-design.md` (§3 결정 테이블)
- 프로토타입: `docs/design/first-redesign/MQTT Insight Redesign.dc.html` (카피 딕셔너리 L638–757, 토큰 맵 L759–776)

**계획 정책:** 로직/구조/시그니처는 본 계획에 완전한 코드로 제공한다. 픽셀 수치(px/색/radius)와 카피 문자열은 레지스트리 ID가 정본이며, 태스크는 해당 ID를 `covers:`로 명시한다 — 구현자는 코드 골격에 레지스트리 수치를 채워 넣는다(중복 전사로 인한 오타 위험 방지). 이는 placeholder가 아니라 정본 참조다.

---

## File Structure

**Backend**
- Modify: `internal/config/config.go` (Settings 5필드), `internal/store/ringbuffer.go`(SetCapacity), `internal/store/store.go`(SetCapacity), `internal/mqtt/client.go`(StatusEvent 타입·콜백 시그니처), `internal/mqtt/v3.go`·`v5.go`(attempt 배선), `app.go`(구조화 emit·CancelConnect·SetRingBufferSize)

**Frontend 신규**
- `frontend/src/lib/tokens.css`, `lib/i18n.ts`, `lib/mqttMatch.ts`, `lib/time.ts`, `lib/diff.ts`, `lib/connectError.ts`
- `frontend/src/components/SegmentedControl.tsx`, `Toast.tsx`, `ConnectingOverlay.tsx`, `ReconnectBanner.tsx`, `Welcome.tsx`, `ConnectionHome.tsx`, `SubscriptionChips.tsx`, `SearchBar.tsx`

**Frontend 재설계**: `store/appStore.ts`, `bridge/events.ts`, `App.tsx`, `App.css`(전면 재작성), `components/{ConnectionBar,ConnectionForm,TopicTree,MessageList,MessageDetail,PublishPanel,SettingsModal}.tsx`

**Frontend 유지**: `components/ContextMenu.tsx`(좌표 clamp 추가), `lib/payload.ts`, `types.ts`(소폭)

**Docs**: `docs/MANUAL_TESTING.md` 전면 갱신

---

# Phase 0 — 토대 (lib)

### Task 1: 디자인 토큰 시스템

**covers:** E1 E2 E3 E4 E5 E6 E7 E8 E9 E10 B63 (+C40 keyframes)

**Files:**
- Create: `frontend/src/lib/tokens.css`
- Modify: `frontend/src/App.tsx` (import 순서만 — 이후 태스크에서 재작성되므로 여기선 tokens.css import 추가만)

- [ ] **Step 1: tokens.css 작성**

레지스트리 E1 표(20토큰) + E2(`--treename`,`--treebranch`) + E3 고정색을 CSS 변수로. `:root`=다크, `:root[data-theme="light"]`=라이트. 구조:

```css
/* frontend/src/lib/tokens.css — 디자인 토큰 (정본: 레지스트리 E1~E9) */
:root {
  --bg: #1e1e24; --titlebar: #26262e; --pane: #22222a; --pane2: #202028;
  --detail: #1c1c22; --card: #26262e; --input: #1a1a20; --modal: #23232b;
  --chip: #2c2c35; --border: #34343f; --line: #2e2e37; --btnborder: #3a3a44;
  --text: #e4e4ec; --text2: #cfcfd8; --dim: #8a8a96; --dim2: #6a6a76;
  --dim3: #7a7a86; --faint: #6f6f7b; --payload: #d6e2c8;
  --hoverbg: rgba(255,255,255,.05);
  --treename: #d6d6de; --treebranch: #c0c0ca;
  /* 고정색 (테마 무관) */
  --accent: #4f8cff; --accent-light: #6ba0ff; --ok: #43c463;
  --warn: #febc2e; --err: #e5484d; --retained: #d9822b;
}
:root[data-theme="light"] {
  --bg: #f4f4f7; --titlebar: #ececf1; --pane: #ffffff; --pane2: #f6f6f9;
  --detail: #fbfbfd; --card: #ffffff; --input: #eef0f4; --modal: #ffffff;
  --chip: #e8eaf0; --border: #dcdce4; --line: #e7e7ee; --btnborder: #d3d3dc;
  --text: #1a1a22; --text2: #2c2c36; --dim: #63636f; --dim2: #86868f;
  --dim3: #78788a; --faint: #9a9aa6; --payload: #33562a;
  --hoverbg: rgba(0,0,0,.045);
  --treename: #2a2a33; --treebranch: #45454f;
}
/* 폰트: 외부 로드 없음(E5 결정) — 시스템 폴백 */
:root { --font-ui: "Inter", system-ui, sans-serif; --font-mono: "JetBrains Mono", ui-monospace, Menlo, monospace; }
/* 공용 keyframes (C40) */
@keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes ringpulse { 0% { box-shadow: 0 0 0 0 rgba(79,140,255,.45); } 100% { box-shadow: 0 0 0 12px rgba(79,140,255,0); } }
/* 스크롤바 (B63) */
::-webkit-scrollbar { width: 9px; height: 9px; }
::-webkit-scrollbar-thumb { background: rgba(128,128,140,.4); border-radius: 6px; }
::-webkit-scrollbar-track { background: transparent; }
```

- [ ] **Step 2: 기존 App.css 상단의 `:root` 변수 블록 2개 제거 예약 확인** — App.css는 Task 14~23에서 컴포넌트별로 재작성된다. 이 태스크에서는 App.tsx에 `import "./lib/tokens.css";`를 **App.css import보다 위에** 추가하고, App.css의 기존 `:root{...}`/`:root[data-theme="light"]{...}` 두 블록만 삭제(변수 충돌 방지). 나머지 규칙은 후속 태스크가 교체할 때까지 유지.

- [ ] **Step 3: 게이트** — `cd frontend && npx tsc --noEmit` 클린, `npx vitest run` 기존 통과, 앱 외관 큰 변화 없음(변수 값 동일 계열).

- [ ] **Step 4: Commit** — `feat(redesign): add design token system`

### Task 2: i18n 딕셔너리 + 패리티 테스트 (TDD)

**covers:** D1~D63 전부, F23 F30(제거) F33 F34, G4(신규 키), C42 일부(문구)

**Files:**
- Create: `frontend/src/lib/i18n.ts`, `frontend/src/lib/i18n.test.ts`

- [ ] **Step 1: 실패하는 패리티 테스트 작성**

```ts
// frontend/src/lib/i18n.test.ts
import { describe, it, expect } from "vitest";
import { DICT, t, setLang, fmtVars } from "./i18n";

describe("i18n", () => {
  it("ko and en have identical key sets (no missing copy)", () => {
    const ko = Object.keys(DICT.ko).sort();
    const en = Object.keys(DICT.en).sort();
    expect(en).toEqual(ko);
  });
  it("no empty strings", () => {
    for (const lang of ["ko", "en"] as const)
      for (const [k, v] of Object.entries(DICT[lang])) expect(v, `${lang}.${k}`).not.toBe("");
  });
  it("t() resolves and falls back to key", () => {
    setLang("ko");
    expect(t("statusConnected")).toBe("연결됨");
    expect(t("noSuchKey")).toBe("noSuchKey");
  });
  it("fmtVars substitutes {host}/{n}", () => {
    expect(fmtVars("'{host}' 호스트 (시도 {n})", { host: "h", n: 3 })).toBe("'h' 호스트 (시도 3)");
  });
  it("dead key treeAdd removed (F30)", () => {
    expect((DICT.ko as Record<string, string>)["treeAdd"]).toBeUndefined();
  });
  it("new error keys exist (F33)", () => {
    for (const k of ["errAuth", "errTls", "errRefused", "errTimeout", "errGeneric"])
      expect(DICT.ko[k as keyof typeof DICT.ko]).toBeTruthy();
  });
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/lib/i18n.test.ts` → 모듈 없음 FAIL

- [ ] **Step 3: i18n.ts 구현**

구조(코드 완전) + 딕셔너리 데이터(정본에서 이식):

```ts
// frontend/src/lib/i18n.ts
export type Lang = "ko" | "en";
let current: Lang = "ko";
export function setLang(l: Lang) { current = l; }
export function getLang(): Lang { return current; }
export function fmtVars(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}
export function t(key: string, vars?: Record<string, string | number>): string {
  const s = (DICT[current] as Record<string, string>)[key] ?? key;
  return vars ? fmtVars(s, vars) : s;
}
export const DICT = { ko: { /* ... */ }, en: { /* ... */ } } as const;
```

딕셔너리 내용: **프로토타입 HTML L638–757의 `T` 객체 전 키를 그대로 이식**(ko/en, D1~D63 — 카피 정본). 단:
- `treeAdd`, `simDropTitle` 키 제외(F30, SIM)
- `reconnMsg`는 카운트다운 없는 버전으로 교체: ko `"연결 끊김 — 재연결 시도 중… (시도 {n})"` / en `"Connection lost — trying to reconnect… (attempt {n})"`
- 신규 키 추가(전문):
  - `errAuth`: ko `"인증에 실패했어요. 아이디와 비밀번호를 확인해 주세요."` / en `"Authentication failed. Check your username and password."`
  - `errTls`: ko `"TLS 연결에 실패했어요. 인증서 설정을 확인해 주세요."` / en `"TLS connection failed. Check your certificate settings."`
  - `errRefused`: ko `"브로커가 연결을 거부했어요. 호스트와 포트를 확인해 주세요."` / en `"The broker refused the connection. Check host and port."`
  - `errTimeout`: ko `"연결 시간이 초과됐어요. 네트워크 상태를 확인해 주세요."` / en `"Connection timed out. Check your network."`
  - `errGeneric`: ko `"연결에 실패했어요: {raw}"` / en `"Connection failed: {raw}"`
  - `recEmptyTitle`: ko `"저장된 메시지가 없어요"` / en `"No recorded messages"` (G4)
  - `recEmptyHint`: ko `"기록을 켠 뒤 수신된 메시지가 여기에 남아요."` / en `"Messages received while recording appear here."`
  - `refresh`: ko `"새로고침"` / en `"Refresh"` (G3)
  - `guideClose`: ko `"돌아가기"` / en `"Back"` (F6 오버레이 닫기)
  - `deleteConfirm`: ko `"'{name}' 프로필을 삭제할까요?"` / en `"Delete profile '{name}'?"` (F27)
  - `ctPlaceholder`: ko `"content-type (예: application/json)"` / en `"content-type (e.g. application/json)"` (F34)
  - 고급 탭 신규 라벨(G1): `lblClientId`(클라이언트 ID/Client ID), `lblKeepAlive`(Keep-alive (초)/Keep-alive (s)), `lblCleanSession`(클린 세션/Clean session), `lblTlsSection`(TLS), `lblCaCert`(CA 인증서 경로/CA certificate path), `lblSystemCa`(시스템 CA 사용/Use system CA store), `lblSkipVerify`(인증서 검증 생략 (개발용)/Skip TLS verification (dev)), `lblWsPath`(WebSocket 경로/WebSocket path), `lblLwtSection`(LWT (유언 메시지)/LWT (Last Will)), `lblWillTopic`(Will 토픽/Will topic), `lblWillPayload`(Will 페이로드/Will payload), `lblWillQos`(Will QoS), `lblWillRetained`(Will retained)

- [ ] **Step 4: 통과 확인** — `npx vitest run src/lib/i18n.test.ts` PASS. **키 수를 세어 보고**(ko 기준 90개 내외 예상) 레지스트리 D 섹션과 대조해 빠진 그룹이 없는지 확인.

- [ ] **Step 5: Commit** — `feat(redesign): add i18n dictionary (ko/en) with parity test`

### Task 3: MQTT 와일드카드 매칭 (TDD)

**covers:** F21 F26, B26(dim 판정), C20

**Files:** Create: `frontend/src/lib/mqttMatch.ts`, `frontend/src/lib/mqttMatch.test.ts`

- [ ] **Step 1: 실패하는 테스트**

```ts
import { describe, it, expect } from "vitest";
import { topicMatches, matchesAny } from "./mqttMatch";

describe("mqttMatch", () => {
  it("exact", () => expect(topicMatches("a/b", "a/b")).toBe(true));
  it("# matches everything incl multi-level", () => {
    expect(topicMatches("a", "#")).toBe(true);
    expect(topicMatches("a/b/c", "#")).toBe(true);
  });
  it("trailing # matches subtree incl parent", () => {
    expect(topicMatches("a/b/c", "a/#")).toBe(true);
    expect(topicMatches("a", "a/#")).toBe(true);
    expect(topicMatches("b/x", "a/#")).toBe(false);
  });
  it("+ matches exactly one level", () => {
    expect(topicMatches("home/kitchen/temp", "home/+/temp")).toBe(true);
    expect(topicMatches("home/a/b/temp", "home/+/temp")).toBe(false);
  });
  it("matchesAny over sub list", () => {
    expect(matchesAny("s/1/t", [{ pattern: "x/#", qos: 0 }, { pattern: "s/+/t", qos: 1 }])).toBe(true);
    expect(matchesAny("s/1/t", [])).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인** → 모듈 없음

- [ ] **Step 3: 구현**

```ts
// frontend/src/lib/mqttMatch.ts
export interface Sub { pattern: string; qos: number }

/** MQTT topic filter match (#, +) per spec. */
export function topicMatches(topic: string, filter: string): boolean {
  const t = topic.split("/");
  const f = filter.split("/");
  for (let i = 0; i < f.length; i++) {
    if (f[i] === "#") return true; // matches remainder (and parent level)
    if (i >= t.length) return false;
    if (f[i] !== "+" && f[i] !== t[i]) return false;
  }
  return t.length === f.length;
}

export function matchesAny(topic: string, subs: Sub[]): boolean {
  return subs.some((s) => topicMatches(topic, s.pattern));
}
```
주의: `a/#`가 `a`를 매칭해야 함(MQTT 규격) — 위 루프는 `f[i]==="#"` 시점에 즉시 true이므로 `["a","#"]` vs `["a"]`에서 i=1에 `#` 도달 전 t 소진… **테스트가 이 케이스를 잡는다.** 올바른 처리: `if (i >= t.length) return f[i] === "#";`로 교체:

```ts
  for (let i = 0; i < f.length; i++) {
    if (i >= t.length) return f[i] === "#" && i === f.length - 1;
    if (f[i] === "#") return true;
    if (f[i] !== "+" && f[i] !== t[i]) return false;
  }
```

- [ ] **Step 4: 통과 확인** → 전부 PASS
- [ ] **Step 5: Commit** — `feat(redesign): add MQTT wildcard matcher`

### Task 4: JSON diff (TDD)

**covers:** B36 F15 C33 (D40 표시용 데이터)

**Files:** Create: `frontend/src/lib/diff.ts`, `frontend/src/lib/diff.test.ts`

- [ ] **Step 1: 실패하는 테스트**

```ts
import { describe, it, expect } from "vitest";
import { diffJson } from "./diff";

describe("diffJson", () => {
  it("classifies changed/added/removed/unchanged", () => {
    const r = diffJson({ a: 1, b: "x", c: true }, { a: 2, b: "x", d: 5 });
    expect(r).toEqual([
      { key: "a", kind: "changed", value: "2", prev: "1" },
      { key: "b", kind: "unchanged", value: '"x"' },
      { key: "c", kind: "removed", value: "true" },
      { key: "d", kind: "added", value: "5" },
    ]);
  });
  it("returns null for non-objects/arrays", () => {
    expect(diffJson([1], { a: 1 })).toBeNull();
    expect(diffJson(null, { a: 1 })).toBeNull();
    expect(diffJson({ a: 1 }, "s" as unknown as object)).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인** → 모듈 없음

- [ ] **Step 3: 구현**

```ts
// frontend/src/lib/diff.ts
export interface DiffLine { key: string; kind: "changed" | "added" | "removed" | "unchanged"; value: string; prev?: string }

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Key-level diff of two JSON objects (prev -> cur). Null when not comparable (B36). */
export function diffJson(prev: unknown, cur: unknown): DiffLine[] | null {
  if (!isPlainObject(prev) || !isPlainObject(cur)) return null;
  const keys = [...new Set([...Object.keys(prev), ...Object.keys(cur)])].sort();
  return keys.map((key) => {
    const inPrev = key in prev, inCur = key in cur;
    const pv = JSON.stringify(prev[key]), cv = JSON.stringify(cur[key]);
    if (!inPrev) return { key, kind: "added" as const, value: cv };
    if (!inCur) return { key, kind: "removed" as const, value: pv };
    if (pv !== cv) return { key, kind: "changed" as const, value: cv, prev: pv };
    return { key, kind: "unchanged" as const, value: cv };
  });
}
```
주의: 테스트 기대 순서는 정의 순서가 아니라 **키 정렬**이다(a,b,c,d) — sort 유지.

- [ ] **Step 4: 통과** · **Step 5: Commit** — `feat(redesign): add JSON key diff util`

### Task 5: 시각 포맷 + ticker (TDD)

**covers:** F25 B30(시각) D60 D63 C41(ticker)

**Files:** Create: `frontend/src/lib/time.ts`, `frontend/src/lib/time.test.ts`

- [ ] **Step 1: 실패하는 테스트**

```ts
import { describe, it, expect } from "vitest";
import { formatTime, relativeTime } from "./time";

describe("time", () => {
  it("absolute HH:MM:SS", () => {
    const d = new Date("2026-07-03T09:05:07");
    expect(formatTime(d.toISOString(), "absolute", "ko")).toMatch(/09:05:07/);
  });
  it("relative ko/en", () => {
    const now = Date.now();
    expect(relativeTime(new Date(now - 3000).toISOString(), "ko", now)).toBe("3초 전");
    expect(relativeTime(new Date(now - 120000).toISOString(), "en", now)).toBe("2m ago");
    expect(relativeTime(new Date(now - 7200000).toISOString(), "ko", now)).toBe("2시간 전");
  });
});
```

- [ ] **Step 2: 실패 확인**

- [ ] **Step 3: 구현**

```ts
// frontend/src/lib/time.ts
import { useEffect, useState } from "react";
import type { Lang } from "./i18n";

export function relativeTime(iso: string, lang: Lang, nowMs: number = Date.now()): string {
  const s = Math.max(0, Math.floor((nowMs - new Date(iso).getTime()) / 1000));
  const [n, unit] = s < 60 ? [s, 0] : s < 3600 ? [Math.floor(s / 60), 1] : [Math.floor(s / 3600), 2];
  const ko = ["초 전", "분 전", "시간 전"], en = ["s ago", "m ago", "h ago"];
  return lang === "ko" ? `${n}${ko[unit]}` : `${n}${en[unit]}`;
}

export function formatTime(iso: string, mode: "absolute" | "relative", lang: Lang, nowMs?: number): string {
  if (mode === "relative") return relativeTime(iso, lang, nowMs);
  return new Date(iso).toLocaleTimeString("en-GB"); // HH:MM:SS (F13/B30)
}

/** 1s ticker for relative mode (F25). Returns a counter to force re-render. */
export function useNowTick(enabled: boolean): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, [enabled]);
  return tick;
}
```

- [ ] **Step 4: 통과** · **Step 5: Commit** — `feat(redesign): add time formatting with relative ticker`

### Task 6: 연결 에러 분류 (TDD)

**covers:** F33 G19 B17 B46(데이터), C12

**Files:** Create: `frontend/src/lib/connectError.ts`, `frontend/src/lib/connectError.test.ts`

- [ ] **Step 1: 실패하는 테스트**

```ts
import { describe, it, expect } from "vitest";
import { classifyConnectError } from "./connectError";

describe("classifyConnectError", () => {
  it("auth", () => expect(classifyConnectError("not Authorized").key).toBe("errAuth"));
  it("bad credentials", () => expect(classifyConnectError("bad user name or password").key).toBe("errAuth"));
  it("tls", () => expect(classifyConnectError("x509: certificate signed by unknown authority").key).toBe("errTls"));
  it("refused", () => expect(classifyConnectError("dial tcp 127.0.0.1:1999: connect: connection refused").key).toBe("errRefused"));
  it("unknown host", () => expect(classifyConnectError("dial tcp: lookup nohost: no such host").key).toBe("errUnknownHost"));
  it("timeout", () => expect(classifyConnectError("context deadline exceeded").key).toBe("errTimeout"));
  it("generic keeps raw", () => {
    const r = classifyConnectError("weird failure");
    expect(r.key).toBe("errGeneric");
    expect(r.raw).toBe("weird failure");
  });
});
```

- [ ] **Step 2: 실패 확인**

- [ ] **Step 3: 구현**

```ts
// frontend/src/lib/connectError.ts
export interface ConnectError { key: string; host?: string; raw?: string }

const RULES: [RegExp, string][] = [
  [/not authori[sz]ed|bad user name or password|username or password/i, "errAuth"],
  [/x509|tls|certificate/i, "errTls"],
  [/connection refused/i, "errRefused"],
  [/no such host|lookup .* on/i, "errUnknownHost"],
  [/deadline exceeded|timeout|timed out/i, "errTimeout"],
];

export function classifyConnectError(raw: string, host?: string): ConnectError {
  for (const [re, key] of RULES) if (re.test(raw)) return { key, host, raw };
  return { key: "errGeneric", host, raw };
}
```

- [ ] **Step 4: 통과** · **Step 5: Commit** — `feat(redesign): add connect error classifier`

# Phase 1 — 백엔드

### Task 7: Settings 확장 (TDD)

**covers:** G6 G7(필드) C25 C38(영속) A7(recToastShown) A15(treeHintDismissed)

**Files:** Modify: `internal/config/config.go`; Test: `internal/config/config_test.go`

- [ ] **Step 1: 실패하는 테스트 추가** (config_test.go에 append)

```go
func TestSettingsNewFieldsRoundTrip(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.json")
	in := &Config{Settings: Settings{
		Theme: "system", RingBufferSize: 300, DefaultFormat: "json",
		Lang: "en", TimestampFormat: "relative", MessageOrder: "oldest",
		TreeHintDismissed: true, RecToastShown: true,
	}}
	if err := Save(path, in); err != nil {
		t.Fatalf("save: %v", err)
	}
	out, err := Load(path)
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	s := out.Settings
	if s.Lang != "en" || s.TimestampFormat != "relative" || s.MessageOrder != "oldest" ||
		!s.TreeHintDismissed || !s.RecToastShown {
		t.Fatalf("new fields not round-tripped: %+v", s)
	}
}

func TestSettingsDefaultsForNewFields(t *testing.T) {
	out, _ := Load(filepath.Join(t.TempDir(), "nope.json"))
	s := out.Settings
	if s.Lang != "ko" || s.TimestampFormat != "absolute" || s.MessageOrder != "newest" {
		t.Fatalf("defaults wrong: %+v", s)
	}
}
```

- [ ] **Step 2: 실패 확인** — `go test ./internal/config/ -v` → unknown field

- [ ] **Step 3: 구현** — `Settings` 구조체에 추가:

```go
	Lang              string `json:"lang"`              // ko | en
	TimestampFormat   string `json:"timestampFormat"`   // absolute | relative
	MessageOrder      string `json:"messageOrder"`      // newest | oldest
	TreeHintDismissed bool   `json:"treeHintDismissed"`
	RecToastShown     bool   `json:"recToastShown"`
```
`defaults()`를 `Settings{Theme: "dark", RingBufferSize: 200, DefaultFormat: "plain", Lang: "ko", TimestampFormat: "absolute", MessageOrder: "newest"}`로 갱신.

- [ ] **Step 4: 통과 확인** · **Step 5: Commit** — `feat(redesign): extend Settings with lang/timestamp/order/hint flags`

### Task 8: 링버퍼 즉시 적용 (TDD)

**covers:** G7 C39 B56(백엔드측)

**Files:** Modify: `internal/store/ringbuffer.go`, `internal/store/store.go`, `app.go`; Test: `internal/store/ringbuffer_test.go`

- [ ] **Step 1: 실패하는 테스트 추가**

```go
func TestRingBufferSetCapacityTrims(t *testing.T) {
	rb := NewRingBuffer(10)
	for i := 0; i < 10; i++ {
		rb.Append("t", mqtt.Message{Topic: "t", Payload: []byte{byte('0' + i)}})
	}
	rb.SetCapacity(3)
	got := rb.Get("t")
	if len(got) != 3 || string(got[0].Payload) != "7" {
		t.Fatalf("want last 3 (7..9), got %v", got)
	}
	// future appends respect new cap
	rb.Append("t", mqtt.Message{Topic: "t", Payload: []byte("x")})
	if len(rb.Get("t")) != 3 {
		t.Fatal("cap not applied to new appends")
	}
}
```

- [ ] **Step 2: 실패 확인** → SetCapacity undefined

- [ ] **Step 3: 구현**

ringbuffer.go에 추가:
```go
// SetCapacity changes the per-topic cap immediately, trimming existing buffers.
func (r *RingBuffer) SetCapacity(capacity int) {
	if capacity < 1 {
		capacity = 1
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.capacity = capacity
	for topic, buf := range r.byTopic {
		if len(buf) > capacity {
			r.byTopic[topic] = buf[len(buf)-capacity:]
		}
	}
}
```
store.go의 `MemoryStore`에 위임 + 인터페이스에 추가:
```go
// MessageStore interface에 추가:
	SetCapacity(n int)
// MemoryStore 구현:
func (s *MemoryStore) SetCapacity(n int) { s.ring.SetCapacity(n) }
```
app.go의 `SaveSettings`를 수정 — 저장 후 즉시 적용:
```go
func (a *App) SaveSettings(s config.Settings) error {
	a.cfg.Settings = s
	if a.store != nil {
		a.store.SetCapacity(s.RingBufferSize)
	}
	return config.Save(a.cfgPath, a.cfg)
}
```

- [ ] **Step 4: 통과** — `go test ./internal/... && go build ./...`
- [ ] **Step 5: Commit** — `feat(redesign): apply ring buffer size immediately via SetCapacity`

### Task 9: 구조화 상태 이벤트 + CancelConnect (TDD)

**covers:** C13 C15 C16 C17 A8 A9 A10(백엔드측) B60(취소), 스펙 §4 백엔드

**Files:** Modify: `internal/mqtt/client.go`, `internal/mqtt/v3.go`, `internal/mqtt/v5.go`, `app.go`; Test: `internal/mqtt/subs_test.go`(append)

- [ ] **Step 1: Callbacks 확장** (internal/mqtt/client.go)

`Callbacks`에 재연결 콜백 추가:
```go
// Callbacks are event hooks the client invokes.
type Callbacks struct {
	OnMessage        func(Message)
	OnConnect        func()
	OnConnectionLost func(error)
	OnReconnecting   func(attempt int) // fired per reconnect attempt
}
```

- [ ] **Step 2: v3 attempt 배선** (internal/mqtt/v3.go)

`v3Client` 구조체에 `attempts int` 필드 추가. `Connect`의 옵션 설정부에 추가:
```go
	opts.SetReconnectingHandler(func(_ paho3.Client, _ *paho3.ClientOptions) {
		v.mu.Lock()
		v.attempts++
		n := v.attempts
		v.mu.Unlock()
		if v.cb.OnReconnecting != nil {
			v.cb.OnReconnecting(n)
		}
	})
```
`SetOnConnectHandler` 콜백 안(재구독 후, OnConnect 호출 전)에 attempts 리셋:
```go
		v.mu.Lock()
		v.attempts = 0
		v.mu.Unlock()
```

- [ ] **Step 3: v5 attempt 배선** (internal/mqtt/v5.go)

`v5Client`에 `attempts int`, `connectedOnce bool` 필드 추가. `OnConnectError` 콜백을 수정 — 최초 연결 성공 이후의 에러만 재연결 시도로 집계:
```go
		OnConnectError: func(err error) {
			v.mu.Lock()
			v.lastErr = err
			once := v.connectedOnce
			if once {
				v.attempts++
			}
			n := v.attempts
			v.mu.Unlock()
			if once && v.cb.OnReconnecting != nil {
				v.cb.OnReconnecting(n)
			}
			if v.cb.OnConnectionLost != nil {
				v.cb.OnConnectionLost(err)
			}
		},
```
`OnConnectionUp`에서(재구독 후, OnConnect 호출 전):
```go
			v.mu.Lock()
			v.connectedOnce = true
			v.attempts = 0
			v.mu.Unlock()
```

- [ ] **Step 4: app.go — 구조화 emit + 연결 컨텍스트 + CancelConnect**

`App` 구조체에 `connCancel context.CancelFunc` 추가. `Connect`를 수정:
```go
// Connect opens a connection using a profile.
func (a *App) Connect(p config.Profile) error {
	a.mu.Lock()
	if a.connCancel != nil {
		a.connCancel() // tear down any previous connection lifetime ctx
	}
	if a.client != nil {
		_ = a.client.Disconnect()
	}
	a.store.Clear()
	client := mqtt.New(p.Version)
	a.client = client
	ctx, cancel := context.WithCancel(a.ctx)
	a.connCancel = cancel
	a.mu.Unlock()

	a.emitStatus("connecting", 0, "")
	cfg := mqtt.ConnectionConfig{ /* 기존 필드 매핑 그대로 유지 */ }
	err := client.Connect(ctx, cfg, mqtt.Callbacks{
		OnMessage:        func(m mqtt.Message) { a.batcher.Add(m) },
		OnConnect:        func() { a.emitStatus("connected", 0, "") },
		OnConnectionLost: func(err error) { a.emitStatus("disconnected", 0, err.Error()) },
		OnReconnecting:   func(attempt int) { a.emitStatus("reconnecting", attempt, "") },
	})
	if err != nil {
		a.emitStatus("disconnected", 0, err.Error())
	}
	return err
}

// emitStatus sends a structured status event to the frontend.
func (a *App) emitStatus(state string, attempt int, reason string) {
	runtime.EventsEmit(a.ctx, "mqtt:status", map[string]any{
		"state": state, "attempt": attempt, "reason": reason,
	})
}

// CancelConnect aborts an in-flight connection attempt (or tears down the
// current connection lifetime context).
func (a *App) CancelConnect() {
	a.mu.Lock()
	cancel := a.connCancel
	a.mu.Unlock()
	if cancel != nil {
		cancel()
	}
	a.emitStatus("disconnected", 0, "")
}
```
`Disconnect`도 `connCancel` 호출 후 `c.Disconnect()` 하도록 수정(같은 잠금 패턴 유지). **주의(v5):** autopaho의 수명은 Connect에 전달된 ctx에 묶인다 — 성공 후에는 cancel하지 말고 Disconnect/CancelConnect/다음 Connect에서만 cancel(위 구조가 그렇게 동작).

**v3 취소 대응** (internal/mqtt/v3.go Connect 끝부분): 토큰 대기를 ctx 취소 가능하게 교체:
```go
	v.client = paho3.NewClient(opts)
	t := v.client.Connect()
	done := make(chan struct{})
	go func() { t.Wait(); close(done) }()
	select {
	case <-done:
		return t.Error()
	case <-ctx.Done():
		return ctx.Err()
	case <-time.After(30 * time.Second):
		return fmt.Errorf("connect timeout")
	}
```

- [ ] **Step 5: 단위 테스트 추가** (internal/mqtt/subs_test.go에 append)

```go
func TestV3ReconnectingCallbackCounts(t *testing.T) {
	v := newV3Client()
	var got []int
	v.cb = Callbacks{OnReconnecting: func(n int) { got = append(got, n) }}
	// simulate what SetReconnectingHandler does
	for i := 0; i < 3; i++ {
		v.mu.Lock()
		v.attempts++
		n := v.attempts
		v.mu.Unlock()
		v.cb.OnReconnecting(n)
	}
	if len(got) != 3 || got[2] != 3 {
		t.Fatalf("want [1 2 3], got %v", got)
	}
}
```
(진짜 재연결 사이클은 통합/수동 검증 — MANUAL_TESTING에 시나리오 추가됨)

- [ ] **Step 6: 게이트** — `go build ./... && go vet ./... && go test ./... && go test -race ./internal/...` 전부 통과. `wails build -clean` 성공(CancelConnect 바인딩 노출 확인).

- [ ] **Step 7: Commit** — `feat(redesign): structured status events, reconnect attempts, CancelConnect`

# Phase 2 — 상태 · 라우팅

### Task 10: appStore 재작성

**covers:** 스펙 §4 상태 스케치 전부, C22 C28(paused 의미) F1 F24, D데이터 보관

**Files:** Modify: `frontend/src/store/appStore.ts`, `frontend/src/types.ts`

- [ ] **Step 1: types.ts에 추가**

```ts
export type Status = "disconnected" | "connecting" | "connected" | "reconnecting";
export interface StatusEvent { state: Status; attempt: number; reason: string }
```
(기존 `Status` 3종 타입을 위 4종으로 교체)

- [ ] **Step 2: appStore.ts 전체 재작성**

```ts
import { create } from "zustand";
import type { Message, TreeNode, Status } from "../types";
import type { Sub } from "../lib/mqttMatch";
import type { ConnectError } from "../lib/connectError";
import type { Lang } from "../lib/i18n";

export type MsgSource = "live" | "recorded";
export type Fmt = "json" | "plain" | "hex" | "base64";

export interface SettingsState {
  lang: Lang; theme: "dark" | "light" | "system";
  defaultFormat: Fmt; timestampFormat: "absolute" | "relative";
  messageOrder: "newest" | "oldest"; ringBufferSize: number;
}

interface AppState {
  // connection
  status: Status; broker: string; attempt: number;
  connectError: ConnectError | null;
  activeVersion: string; // "5.0" | "3.1.1" — 연결에 쓴 프로필의 버전 (B40 비활성 판단)
  // data
  tree: TreeNode | null; liveMessages: Message[];
  subs: Sub[]; recording: Set<string>;
  selectedTopic: string | null; selectedMsg: Message | null;
  msgSource: MsgSource;
  // ui
  paused: boolean; searchOpen: boolean; searchQuery: string;
  diffOn: boolean; fmt: Fmt;
  pubTopic: string; pubHint: boolean;
  treeHintDismissed: boolean; recToastShown: boolean;
  settings: SettingsState;
  // actions
  setStatus: (s: Status, attempt?: number) => void;
  setBroker: (b: string) => void;
  setConnectError: (e: ConnectError | null) => void;
  setActiveVersion: (v: string) => void;
  setTree: (t: TreeNode) => void;
  pushMessages: (ms: Message[]) => void;
  addSub: (pattern: string, qos: number) => boolean; // false = 중복/빈값
  removeSub: (pattern: string) => void;
  selectTopic: (t: string | null, latest?: Message | null) => void;
  selectMsg: (m: Message | null) => void;
  setMsgSource: (s: MsgSource) => void;
  setRecordingTopics: (ts: string[]) => void;
  toggleRecordingTopic: (t: string) => void;
  togglePaused: () => void;
  setSearch: (open: boolean, query?: string) => void;
  toggleDiff: () => void;
  setFmt: (f: Fmt) => void;
  setPubTopic: (t: string, hint: boolean) => void;
  dismissTreeHint: () => void;
  markRecToastShown: () => void;
  setSettings: (s: Partial<SettingsState>) => void;
  resetSession: () => void; // 새 연결 시(C4/C12): 데이터·구독·선택 초기화
}

const MAX_LIVE = 500;

export const useAppStore = create<AppState>((set, get) => ({
  status: "disconnected", broker: "", attempt: 0,
  connectError: null, activeVersion: "5.0",
  tree: null, liveMessages: [], subs: [], recording: new Set<string>(),
  selectedTopic: null, selectedMsg: null, msgSource: "live",
  paused: false, searchOpen: false, searchQuery: "",
  diffOn: false, fmt: "json",
  pubTopic: "", pubHint: false,
  treeHintDismissed: false, recToastShown: false,
  settings: { lang: "ko", theme: "dark", defaultFormat: "plain", timestampFormat: "absolute", messageOrder: "newest", ringBufferSize: 200 },

  setStatus: (s, attempt = 0) => set({ status: s, attempt }),
  setBroker: (b) => set({ broker: b }),
  setConnectError: (e) => set({ connectError: e }),
  setActiveVersion: (v) => set({ activeVersion: v }),
  setTree: (t) => set({ tree: t }),
  // F24: paused여도 수신은 계속 쌓는다(표시는 컴포넌트가 pause 시점 스냅샷). 단순화:
  // liveMessages는 항상 갱신하고, MessageList가 paused일 때 이전 rows를 유지한다.
  pushMessages: (ms) => set({ liveMessages: [...get().liveMessages, ...ms].slice(-MAX_LIVE) }),
  addSub: (pattern, qos) => {
    const p = pattern.trim();
    if (!p || get().subs.some((s) => s.pattern === p)) return false;
    set({ subs: [...get().subs, { pattern: p, qos }] });
    return true;
  },
  removeSub: (pattern) => set({ subs: get().subs.filter((s) => s.pattern !== pattern) }),
  selectTopic: (t, latest = null) =>
    set({ selectedTopic: t, selectedMsg: latest, msgSource: "live", ...(t ? { pubTopic: t, pubHint: true } : {}) }),
  selectMsg: (m) => set({ selectedMsg: m }),
  setMsgSource: (s) => set({ msgSource: s }),
  setRecordingTopics: (ts) => set({ recording: new Set(ts) }),
  toggleRecordingTopic: (t) => {
    const next = new Set(get().recording);
    next.has(t) ? next.delete(t) : next.add(t);
    set({ recording: next });
  },
  togglePaused: () => set({ paused: !get().paused }),
  setSearch: (open, query) => set({ searchOpen: open, searchQuery: open ? (query ?? get().searchQuery) : "" }),
  toggleDiff: () => {
    const on = !get().diffOn;
    set({ diffOn: on, ...(on ? { fmt: "json" as Fmt } : {}) }); // C33: 켜면 JSON 강제
  },
  setFmt: (f) => set({ fmt: f }),
  setPubTopic: (t, hint) => set({ pubTopic: t, pubHint: hint }),
  dismissTreeHint: () => set({ treeHintDismissed: true }),
  markRecToastShown: () => set({ recToastShown: true }),
  setSettings: (s) => set({ settings: { ...get().settings, ...s } }),
  resetSession: () =>
    set({
      tree: null, liveMessages: [], subs: [], selectedTopic: null, selectedMsg: null,
      msgSource: "live", paused: false, searchOpen: false, searchQuery: "",
      pubTopic: "", pubHint: false, connectError: null, attempt: 0,
    }),
}));
```

- [ ] **Step 3: 게이트** — `npx tsc --noEmit` (App.tsx 등 기존 소비자가 깨질 것 — **이 태스크에서 컴파일이 깨지는 것은 허용하지 않는다**: 기존 소비자의 호출부를 최소 수정(setStatus 시그니처, clear→resetSession 등)해 tsc 클린 상태로 커밋). 기존 UI 동작 임시 유지가 목적.

- [ ] **Step 4: Commit** — `feat(redesign): rewrite app store for redesign state model`

### Task 11: 이벤트 브리지 갱신

**covers:** C15(수신측) A9 A10(상태 데이터), 스펙 §4 데이터 흐름

**Files:** Modify: `frontend/src/bridge/events.ts`

- [ ] **Step 1: 재작성**

```ts
import { EventsOn, EventsOff } from "../../wailsjs/runtime/runtime";
import { useAppStore } from "../store/appStore";
import type { Message, TreeNode, StatusEvent } from "../types";

/** Wire Wails backend events into the store. Call once on mount; returns cleanup. */
export function initEventBridge(): () => void {
  EventsOn("mqtt:messages", (ms: Message[]) => useAppStore.getState().pushMessages(ms));
  EventsOn("mqtt:tree", (t: TreeNode) => useAppStore.getState().setTree(t));
  EventsOn("mqtt:status", (e: StatusEvent) => {
    const st = useAppStore.getState();
    st.setStatus(e.state, e.attempt);
    // reason은 연결 시도 실패 컨텍스트에서만 배너로 씀 — Connect 호출부가 처리.
  });
  return () => EventsOff("mqtt:messages", "mqtt:tree", "mqtt:status");
}
```

- [ ] **Step 2: 게이트** — tsc 클린 · **Step 3: Commit** — `feat(redesign): structured status event bridge`

### Task 12: App.tsx 라우팅 셸

**covers:** A3(레이아웃 골격) F6(showGuide) 스펙 §4 라우팅, C2 C5

**Files:** Modify: `frontend/src/App.tsx`

- [ ] **Step 1: 재작성** (아직 없는 컴포넌트는 이 태스크에서 최소 스텁 생성 — 이후 태스크가 본 구현으로 교체)

```tsx
import { useEffect, useState } from "react";
import { initEventBridge } from "./bridge/events";
import { useAppStore } from "./store/appStore";
import { GetProfiles, GetSettings, RecordedTopics } from "../wailsjs/go/main/App";
import { config } from "../wailsjs/go/models";
import { setLang } from "./lib/i18n";
import { Welcome } from "./components/Welcome";
import { ConnectionHome } from "./components/ConnectionHome";
import { ConnectionBar } from "./components/ConnectionBar";
import { ConnectionForm } from "./components/ConnectionForm";
import { SettingsModal } from "./components/SettingsModal";
import { ConnectingOverlay } from "./components/ConnectingOverlay";
import { ReconnectBanner } from "./components/ReconnectBanner";
import { TopicTree } from "./components/TopicTree";
import { MessageList } from "./components/MessageList";
import { PublishPanel } from "./components/PublishPanel";
import "./lib/tokens.css";
import "./App.css";

export function applyTheme(theme: string) {
  const resolved = theme === "system"
    ? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
    : theme;
  document.documentElement.dataset.theme = resolved;
}

function App() {
  const status = useAppStore((s) => s.status);
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const setRecordingTopics = useAppStore((s) => s.setRecordingTopics);
  const [profiles, setProfiles] = useState<config.Profile[]>([]);
  const [showConnect, setShowConnect] = useState(false);
  const [editProfile, setEditProfile] = useState<config.Profile | null>(null); // C9: 편집 진입
  const [showSettings, setShowSettings] = useState(false);
  const [showGuide, setShowGuide] = useState(false); // F6

  const reloadProfiles = () => GetProfiles().then((p) => setProfiles(p || []));

  useEffect(() => {
    const cleanup = initEventBridge();
    reloadProfiles();
    RecordedTopics().then((ts) => setRecordingTopics(ts || []));
    GetSettings().then((s) => {
      setSettings(s as Partial<import("./store/appStore").SettingsState>);
      setLang((s.lang as "ko" | "en") || "ko");
      applyTheme(s.theme || "dark");
    });
    return cleanup;
  }, []);

  // system theme live listener (C38)
  useEffect(() => {
    if (settings.theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const fn = () => applyTheme("system");
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, [settings.theme]);

  const connected = status === "connected" || status === "reconnecting";
  const inApp = connected || (status === "disconnected" && useAppStore.getState().tree !== null && useAppStore.getState().broker !== "");
  // view 파생: 연결됨(또는 앱 진입 후 끊김) → app / 미연결 && 프로필>0 → home / 그 외 welcome
  const view = inApp ? "app" : profiles.length > 0 ? "home" : "welcome";

  const openConnect = (edit?: config.Profile) => { setEditProfile(edit ?? null); setShowConnect(true); };

  return (
    <div className="layout">
      <div className="titlebar">{/* A11: 점 3개·아이콘·앱명·spacer·?·⚙ — CSS는 레지스트리 A11/B1/B2 */}
        <span className="tl-dots"><i /><i /><i /></span>
        <span className="app-icon">◈</span>
        <span className="app-name">MQTT Insight</span>
        <span className="spacer" />
        <button className="tb-btn" title="시작 가이드 다시 보기" onClick={() => setShowGuide(true)}>?</button>
        <button className="tb-btn" title="설정" onClick={() => setShowSettings(true)}>⚙</button>
      </div>
      <ConnectionBar onOpenConnect={() => openConnect()} />
      <ReconnectBanner onReconnect={() => openConnect()} />
      {view === "welcome" && <Welcome onConnect={() => openConnect()} />}
      {view === "home" && (
        <ConnectionHome profiles={profiles} onNew={() => openConnect()} onEdit={(p) => openConnect(p)} onProfilesChanged={reloadProfiles} />
      )}
      {view === "app" && (
        <div className="panes">
          <div className="pane tree-pane"><TopicTree /></div>
          <div className="right-col">
            <div className="pane msg-pane"><MessageList /></div>
            <div className="pane pub-pane"><PublishPanel /></div>
          </div>
        </div>
      )}
      {showGuide && view !== "welcome" && (
        <div className="guide-overlay"><Welcome onConnect={() => { setShowGuide(false); openConnect(); }} onClose={() => setShowGuide(false)} /></div>
      )}
      {showConnect && (
        <ConnectionForm editProfile={editProfile} onClose={() => setShowConnect(false)} onSaved={reloadProfiles} />
      )}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {status === "connecting" && <ConnectingOverlay />}
    </div>
  );
}
export default App;
```
`inApp` 파생 주의: 끊김 배너 중 view=app 유지(A10) — `broker`가 남아 있고 tree 존재하면 app 유지, 수동 해제(C4)는 `resetSession`+`setBroker("")`로 home 복귀. ConnectionBar의 해제 핸들러가 이를 수행(Task 17).

- [ ] **Step 2: 스텁 생성** — 아직 없는 `Welcome/ConnectionHome/ConnectingOverlay/ReconnectBanner`를 최소 스텁(빈 div 반환, props 시그니처는 위와 일치)으로 생성해 tsc 통과시킴. 각 본 구현 태스크가 교체.

- [ ] **Step 3: 게이트** — tsc 클린 + `wails build -clean` 성공.
- [ ] **Step 4: Commit** — `feat(redesign): app shell with view routing and guide overlay`

# Phase 3 — 공용 · 뷰 컴포넌트

> **공통 지침**: 각 태스크는 담당 레지스트리 ID 섹션을 열어 픽셀 수치·상태·카피 키를 채운다. CSS는 `App.css`에 컴포넌트별 섹션 주석(`/* === Welcome (B8-B11) === */`)으로 추가하고, 교체된 구 규칙은 삭제한다. 모든 문자열은 `t()` 사용(하드코딩 금지 — 패리티 테스트가 지키는 건 딕셔너리뿐이므로 컴포넌트에서 키 사용 여부는 감사 게이트가 확인).

### Task 13: 공용 소형 컴포넌트 4종

**covers:** B55(공용화) B59 B60 B61 B62 A7 A8 A9 A10 C13 C15 C16 C17 C18 C40 D50 D53 D54 D55

**Files:** Create: `frontend/src/components/SegmentedControl.tsx`, `Toast.tsx`, `ConnectingOverlay.tsx`, `ReconnectBanner.tsx`(스텁 교체); Modify: `frontend/src/App.css`

- [ ] **Step 1: SegmentedControl** — 재사용 세그먼트(설정·Live/Recorded·포맷 탭용):

```tsx
export function SegmentedControl<T extends string>({ options, value, onChange, size = "md" }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; size?: "sm" | "md";
}) {
  return (
    <span className={`seg seg-${size}`}>
      {options.map((o) => (
        <button key={o.value} className={o.value === value ? "on" : ""} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </span>
  );
}
```

- [ ] **Step 2: Toast** — 하단 중앙, 지속시간 후 자동 소멸(B59, 6.5s):

```tsx
import { useEffect } from "react";
export function Toast({ children, onDone, ms = 6500 }: { children: React.ReactNode; onDone: () => void; ms?: number }) {
  useEffect(() => { const id = setTimeout(onDone, ms); return () => clearTimeout(id); }, [onDone, ms]);
  return <div className="toast">{children}</div>;
}
```

- [ ] **Step 3: ConnectingOverlay** — 전면 dim + 카드 + 취소(B60, C13):

```tsx
import { t } from "../lib/i18n";
import { CancelConnect } from "../../wailsjs/go/main/App";
export function ConnectingOverlay() {
  return (
    <div className="connecting-overlay">
      <div className="connecting-card">
        <span className="spinner" />
        <span>{t("connecting")}</span>
        <button className="btn-outline" onClick={() => CancelConnect()}>{t("btnCancel")}</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: ReconnectBanner** — 재연결(노랑)/끊김(빨강) 배너(B61 B62 C15~C18). 재연결: 스피너+`t("reconnMsg",{n:attempt})`(시도 중엔 retrying)+[지금 재시도][중단]; 끊김(view=app에서 disconnected && broker 존재): ⚠+droppedMsg+[다시 연결]. [지금 재시도]/[다시 연결]=마지막 프로필로 Connect 재호출(App에서 콜백 주입), [중단]=`Disconnect()` 호출:

```tsx
import { useAppStore } from "../store/appStore";
import { t } from "../lib/i18n";
import { Disconnect } from "../../wailsjs/go/main/App";

export function ReconnectBanner({ onReconnect }: { onReconnect: () => void }) {
  const status = useAppStore((s) => s.status);
  const attempt = useAppStore((s) => s.attempt);
  const broker = useAppStore((s) => s.broker);
  if (status === "reconnecting") {
    return (
      <div className="banner banner-warn">
        <span className="spinner sm" />
        <span>{attempt > 0 ? t("reconnMsg", { n: attempt }) : t("retrying")}</span>
        <span className="spacer" />
        <button className="btn-warn-outline" onClick={onReconnect}>{t("retryNow")}</button>
        <button className="btn-outline" onClick={() => Disconnect()}>{t("stopRetry")}</button>
      </div>
    );
  }
  if (status === "disconnected" && broker !== "") {
    return (
      <div className="banner banner-err">
        <span>⚠</span><span>{t("droppedMsg")}</span>
        <span className="spacer" />
        <button className="btn-err" onClick={onReconnect}>{t("reconnectBtn")}</button>
      </div>
    );
  }
  return null;
}
```
주의: `onReconnect`는 App에서 "마지막 프로필로 즉시 Connect"를 주입(모달 아님) — App.tsx에서 마지막 연결 프로필을 상태로 보관하고 재호출하도록 Task 17에서 배선.

- [ ] **Step 5: CSS** — `.seg .toast .connecting-* .banner-* .spinner` 규칙을 레지스트리 B59~B62 수치로 App.css에 추가.
- [ ] **Step 6: 게이트** — tsc 클린. **Step 7: Commit** — `feat(redesign): shared segmented/toast/overlay/banner components`

### Task 14: Welcome

**covers:** A1 B8 B9 B10 B11 C5 F6(onClose) D10~D15

**Files:** Modify: `frontend/src/components/Welcome.tsx`(스텁 교체), `frontend/src/App.css`

- [ ] **Step 1: 구현**

```tsx
import { t } from "../lib/i18n";
export function Welcome({ onConnect, onClose }: { onConnect: () => void; onClose?: () => void }) {
  return (
    <div className="welcome">
      <div className="welcome-inner">
        <div className="hero-icon">◈</div>
        <h1>{t("welcomeTitle")}</h1>
        <p className="welcome-sub">{t("welcomeSub")}</p>
        <div className="steps">
          {[1, 2, 3].map((n) => (
            <div className="step-card" key={n}>
              <span className="step-num">{n}</span>
              <div className="step-title">{t(`step${n}Title`)}</div>
              <div className="step-desc">
                {n === 2 ? (<><span className="mono-chip">#</span> {t("step2Desc")}</>) : t(`step${n}Desc`)}
              </div>
            </div>
          ))}
        </div>
        <button className="cta" onClick={onConnect}>{t("welcomeCta")}</button>
        {onClose && <button className="btn-outline guide-back" onClick={onClose}>{t("guideClose")}</button>}
      </div>
    </div>
  );
}
```
- [ ] **Step 2: CSS** — 레지스트리 B8~B11 수치(60px 아이콘·그라디언트·그림자, H1 25/700, 3열 카드, 번호 뱃지, CTA) + fadeIn .3s + guide-overlay(전면, --bg 배경).
- [ ] **Step 3: 게이트** tsc · **Step 4: Commit** — `feat(redesign): welcome onboarding view`

### Task 15: ConnectionHome

**covers:** A2 A14 B12 B13 B14 B15 B16 B17 B18 C6 C7 C8 C9 C10 F27 D16 D17 D18 D51+

**Files:** Modify: `frontend/src/components/ConnectionHome.tsx`(스텁 교체), `frontend/src/App.css`

- [ ] **Step 1: 구현** (구조 완전 — 수치는 레지스트리)

```tsx
import { useEffect, useState } from "react";
import { config } from "../../wailsjs/go/models";
import { Connect, DeleteProfile } from "../../wailsjs/go/main/App";
import { useAppStore } from "../store/appStore";
import { classifyConnectError } from "../lib/connectError";
import { t } from "../lib/i18n";

export function ConnectionHome({ profiles, onNew, onEdit, onProfilesChanged }: {
  profiles: config.Profile[]; onNew: () => void; onEdit: (p: config.Profile) => void; onProfilesChanged: () => void;
}) {
  const [selected, setSelected] = useState<string>(profiles[0]?.name ?? "");
  const connectError = useAppStore((s) => s.connectError);
  const setConnectError = useAppStore((s) => s.setConnectError);
  const st = useAppStore.getState();
  useEffect(() => { if (!profiles.find((p) => p.name === selected)) setSelected(profiles[0]?.name ?? ""); }, [profiles]);
  const sel = profiles.find((p) => p.name === selected) ?? null;

  async function connect(p: config.Profile) {
    setConnectError(null);
    st.resetSession();
    st.setActiveVersion(p.version);
    st.setBroker(`${p.host}:${p.port}`);
    try { await Connect(p); } catch (e) {
      st.setBroker("");
      setConnectError(classifyConnectError(String(e), p.host));
    }
  }
  async function del(p: config.Profile) {
    if (!window.confirm(t("deleteConfirm", { name: p.name || p.host }))) return; // F27
    await DeleteProfile(p.name);
    onProfilesChanged();
  }

  return (
    <div className="home">
      <div className="home-left">
        <div className="home-header">{t("homeTitle")} · {profiles.length}</div>
        <div className="home-list">
          {profiles.map((p) => (
            <div key={p.name} className={`profile-card ${p.name === selected ? "sel" : ""}`}
              onClick={() => { setSelected(p.name); setConnectError(null); }}
              onDoubleClick={() => connect(p)}>
              <span className="pdot" />
              <div className="pmain"><div className="pname">{p.name || p.host}</div>
                <div className="phost">{p.host}:{p.port}</div></div>
              <span className="pbadge">{p.transport.toUpperCase()}</span>
            </div>
          ))}
        </div>
        <button className="new-conn" onClick={onNew}>{t("homeNew")}</button>
      </div>
      <div className="home-right">
        {sel ? (
          <div className="home-detail">
            <div className="app-icon lg">◈</div>
            <h2>{sel.name || sel.host}</h2>
            <div className="conn-str">{sel.transport}://{sel.host}:{sel.port}</div>
            <div className="info-cards">
              <div className="info-card"><span>{t("lblTransport")}</span><b>{sel.transport.toUpperCase()}</b></div>
              <div className="info-card"><span>{t("lblPort")}</span><b className="mono">{sel.port}</b></div>
            </div>
            <button className="big-connect" onClick={() => connect(sel)}>{t("homeConnect")}</button>
            {connectError && (
              <div className="err-banner">⚠ {t(connectError.key, { host: connectError.host ?? "", raw: connectError.raw ?? "" })}</div>
            )}
            <div className="home-actions">
              <button className="btn-outline" onClick={() => onEdit(sel)}>{t("homeEdit")}</button>
              <button className="btn-outline danger" onClick={() => del(sel)}>{t("homeDelete")}</button>
            </div>
          </div>
        ) : (
          <div className="empty-state"><span className="empty-icon">←</span>
            <div className="empty-title">{t("homeSelectTitle")}</div>
            <div className="empty-hint">{t("homeSelectHint")}</div></div>
        )}
      </div>
    </div>
  );
}
```
- [ ] **Step 2: CSS** — 레지스트리 B12~B18 (300px 좌측, 카드 상태 3종, 뱃지, 440px 상세, 정보 카드, 오류 배너).
- [ ] **Step 3: 게이트** tsc · **Step 4: Commit** — `feat(redesign): connection home launcher`

### Task 16: ConnectionForm 재설계 (연결 모달)

**covers:** A4 B43~B52 G1 F8 F14 F18 F29 C3 C8 C9 C11 C12 D45~D50 (+G9 보존)

**Files:** Modify: `frontend/src/components/ConnectionForm.tsx`(전면 재작성), `frontend/src/App.css`

- [ ] **Step 1: 재작성** — 구조 계약(코드 골격은 기존 v1.1 폼의 상태 관리 패턴 재사용):
  - props: `{ editProfile: config.Profile | null; onClose: () => void; onSaved: () => void }`
  - 상태: `tab: "quick"|"advanced"`(편집 진입 시 advanced=C9), `p: config.Profile`(editProfile 있으면 **전 필드 프리필**=F14/G1, 없으면 기본값 — 단 C3 경로는 App이 이전 폼 유지 없이 새 모달 마운트하므로 "직전 값 유지"는 미적용·기본값 시작. **F8 주의**: 프로토타입의 '값 유지'는 세션 상태였음 — 모달 재마운트 구조에서는 기본값으로 통일하고 이 결정을 감사 노트에 기록), `selectedChip: string | null`
  - 구성: 제목/서브(B45) → 오류 배너(B46: `connectError` 스토어 구독, `t(key,{host,raw})`) → 저장된 프로필 칩(B47: "+ 새 연결" 칩=폼 리셋, 프로필 칩 클릭=전 필드 로드+선택 표시, 필드 수정 시 선택 해제) → "연결 정보" 구분선(B48) → 탭(B49) → 빠른 탭(B50: 호스트/포트/전송 방식+힌트) / 고급 탭(B51 **G1 전 필드**: 프로필 이름·버전 / 호스트·포트·전송 방식·clientId·keepAlive·cleanSession·자동 재연결 / 아이디·비밀번호 / TLS(조건부: caCertPath·useSystemCAs·skipVerify) / WS(조건부: wsPath) / LWT(willTopic·willPayload·willQos·willRetained)) → 푸터(B52: 연결/취소)
  - 연결(C11/C12): 이름 비면 host를 이름으로; `SaveProfile(p)` 후 `Connect(p)` — Home의 connect와 동일하게 resetSession/activeVersion/broker 설정 + 실패 시 classify하여 배너(모달 유지). 성공 시 onSaved()+onClose().
  - Enter 제출/Esc 닫기(F28 — Task 24에서 일괄 추가하므로 여기선 구조만).
- [ ] **Step 2: CSS** — B43~B52 수치.
- [ ] **Step 3: 게이트** — tsc + `wails build -clean`.
- [ ] **Step 4: Commit** — `feat(redesign): connection modal with quick/advanced tabs and full profile fields`

### Task 17: ConnectionBar + 타이틀바 배선

**covers:** A11 B1~B7 C1 C2 C3 C4 E9 D1~D9 (+ReconnectBanner onReconnect 배선)

**Files:** Modify: `frontend/src/components/ConnectionBar.tsx`, `frontend/src/App.tsx`(lastProfile 보관·배선), `frontend/src/App.css`

- [ ] **Step 1: ConnectionBar 재작성**

```tsx
import { useAppStore } from "../store/appStore";
import { Disconnect } from "../../wailsjs/go/main/App";
import { t } from "../lib/i18n";

export function ConnectionBar({ onOpenConnect }: { onOpenConnect: () => void }) {
  const status = useAppStore((s) => s.status);
  const broker = useAppStore((s) => s.broker);
  const st = useAppStore.getState();
  const label = { connected: "statusConnected", connecting: "statusConnecting", reconnecting: "statusReconnecting", disconnected: "statusDisconnected" }[status];
  async function disconnect() { // C4: 수동 해제 = 데이터 클리어 + home 복귀
    await Disconnect();
    st.resetSession();
    st.setBroker("");
    st.setStatus("disconnected");
  }
  return (
    <div className="conn-bar">
      <span className={`dot ${status}`} />
      <span className="status-label">{t(label)}</span>
      <span className="broker mono">{broker}</span>
      <span className="spacer" />
      {status === "connected" && <button className="btn-outline" onClick={disconnect}>{t("btnDisconnect")}</button>}
      {status === "disconnected" && <button className="btn-accent" onClick={onOpenConnect}>{t("btnConnectShort")}</button>}
      {/* connecting/reconnecting: 버튼 없음 (A11) */}
    </div>
  );
}
```
- [ ] **Step 2: App.tsx 배선** — `lastProfile` 상태 보관(Home/Form의 connect 성공 시 setLastProfile — 콜백 prop 추가), `ReconnectBanner onReconnect={() => lastProfile && connectWith(lastProfile)}`(재시도=즉시 Connect). 타이틀바 CSS(38px, 점 3개 장식, B1/B2 버튼).
- [ ] **Step 3: CSS** — 상태 점 3색+halo(E9: 끊김 회색 .15), 44px 바.
- [ ] **Step 4: 게이트** tsc+build · **Step 5: Commit** — `feat(redesign): connection bar with 4-state dot and titlebar`

# Phase 4 — 메인 앱 패널

### Task 18: SubscriptionChips + 트리 empty state

**covers:** A12 B20 B21 B22 B23 B27 C19 C20 D20~D24 (+백엔드 Subscribe/Unsubscribe 호출)

**Files:** Create: `frontend/src/components/SubscriptionChips.tsx`; Modify: `frontend/src/App.css`

- [ ] **Step 1: SubscriptionChips 구현**

```tsx
import { useState } from "react";
import { useAppStore } from "../store/appStore";
import { Subscribe, Unsubscribe } from "../../wailsjs/go/main/App";
import { t } from "../lib/i18n";

export function SubscriptionChips() {
  const subs = useAppStore((s) => s.subs);
  const addSub = useAppStore((s) => s.addSub);
  const removeSub = useAppStore((s) => s.removeSub);
  const [adding, setAdding] = useState(false);
  const [pattern, setPattern] = useState("");
  const [qos, setQos] = useState(0);

  async function add() {
    if (addSub(pattern, qos)) await Subscribe(pattern.trim(), qos);
    setPattern(""); setQos(0); // C19: 중복이어도 입력 클리어
  }
  async function remove(p: string) { removeSub(p); await Unsubscribe(p); }

  return (
    <div className="sub-chips">
      <span className="sub-label">{t("subsLabel")}</span>
      {subs.map((s) => (
        <span className="chip" key={s.pattern}>
          {s.pattern}{s.qos !== 0 ? ` · q${s.qos}` : ""}
          <button className="chip-x" title={t("unsubTitle")} onClick={() => remove(s.pattern)}>✕</button>
        </span>
      ))}
      <button className="chip add" onClick={() => setAdding(!adding)}>{t("addSub")}</button>
      {adding && (
        <div className="add-sub-row">
          <input className="mono" placeholder={t("addSubPh")} value={pattern} onChange={(e) => setPattern(e.target.value)} />
          <select value={qos} onChange={(e) => setQos(+e.target.value)}><option value={0}>q0</option><option value={1}>q1</option><option value={2}>q2</option></select>
          <button className="btn-accent sm" onClick={add}>{t("addSubBtn")}</button>
        </div>
      )}
    </div>
  );
}
```
- [ ] **Step 2: empty state** — `TreeEmptyState` 컴포넌트를 같은 파일에 export(↯ ringpulse, `#` 버튼→`addSub("#",0)+Subscribe`, 특정 토픽 input, floodHint 각주 — B27/A12 수치).
- [ ] **Step 3: CSS** · **Step 4: 게이트** tsc · **Step 5: Commit** — `feat(redesign): subscription chips and tree empty state`

### Task 19: TopicTree 재설계

**covers:** A6 A15 B19 B24 B25 B26 B58 C21 C22 C23 C24 C25 F1 F5 F17 F21 F31 G2 G9 G10 G11 D19 D25~D29 (+A7 토스트 트리거)

**Files:** Modify: `frontend/src/components/TopicTree.tsx`(전면), `frontend/src/components/ContextMenu.tsx`(clamp 추가), `frontend/src/App.css`

- [ ] **Step 1: ContextMenu에 위치 clamp 추가** (F10) — 렌더 전 `x=Math.min(x, innerWidth-190)`, `y=Math.min(y, innerHeight-130)`.
- [ ] **Step 2: TopicTree 재작성** — 구조 계약:
  - 상단: 필터 입력(B19) → SubscriptionChips → 트리 헤더 "토픽 트리 · N"(B24, N=leaf 토픽 수) → 힌트 카드(A15/B25: `subs.length>0 && !treeHintDismissed`(F17); ✕→`dismissTreeHint()`+`SaveSettings`로 영속=C25) → 트리 또는 empty state(subs 0 && 토픽 0 → TreeEmptyState).
  - 필터(F21): `filter`로 **leaf 전체 경로** substring 매치 → 매칭 leaf+조상만 남긴 TreeNode를 만들어 arborist에 공급(arborist `searchTerm` 미사용).
  - 행(B26): 캐럿(arborist 기본 토글) + 기록 ●(recording.has) + 이름(leaf/branch 색·굵기) + 카운트 pill(**브랜치=재귀 합** — toArborist에서 계산=F5) + R 뱃지(tooltip `t("retainedTip")`) + 미리보기(leaf만 34자) + ⋯ 버튼(클릭=메뉴, 버튼 rect 기준 위치) + **비구독 dim**: `!matchesAny(fullTopic, subs)`인 leaf(및 모든 leaf가 dim인 브랜치)에 `opacity .45` 클래스.
  - 클릭(C22): 브랜치 토글 + 항상 `selectTopic(full, latestMsg)` — latestMsg는 History 재사용 대신 스토어 liveMessages에서 해당 토픽 마지막 항목(없으면 null; MessageList가 로드 후 최신 자동 선택 보정=F1).
  - 컨텍스트 메뉴(C24/B58): 이 토픽에 발행(`setPubTopic(full,true)` — 브랜치 허용) / 기록 켜기·끄기(**leaf만**=F31; 최초 켤 때 `!recToastShown`이면 Toast 표시+`markRecToastShown`+SaveSettings=A7) / Retained 삭제(retained leaf만; 기존 `deleteRetained` 빈 retained 발행 로직 보존=G9). **Unsubscribe 항목 없음**(G2).
  - `openByDefault={true}`(G11), height는 컨테이너 측정(`ResizeObserver` 또는 flex 100% — react-arborist는 숫자 필요하므로 부모 ref 측정 훅 사용), `RecordedTopics` 초기화는 App.tsx가 수행(G10 — Task 12에서 이미 배선).
- [ ] **Step 3: CSS** — B19/B24/B25/B26/B58 수치.
- [ ] **Step 4: 게이트** tsc+build · **Step 5: Commit** — `feat(redesign): topic tree with chips/hint/menu/dim and path filter`

### Task 20: MessageList 재설계

**covers:** A13 B28 B29 B30 B31 C26 C27 C28 C29 C30 C31 F3 F4 F9 F12 F16 F24 F25 G3 G4 G12 G13 D30 D32~D36 D38 D39 (+SearchBar 생성)

**Files:** Modify: `frontend/src/components/MessageList.tsx`(전면); Create: `frontend/src/components/SearchBar.tsx`; Modify: `frontend/src/App.css`

- [ ] **Step 1: SearchBar** (B29):

```tsx
import { useAppStore } from "../store/appStore";
import { t } from "../lib/i18n";
export function SearchBar({ matches, total }: { matches: number; total: number }) {
  const searchQuery = useAppStore((s) => s.searchQuery);
  const setSearch = useAppStore((s) => s.setSearch);
  return (
    <div className="search-row">
      <span className="glyph">⌕</span>
      <input className="mono" autoFocus placeholder={t("searchPh")} value={searchQuery}
        onChange={(e) => setSearch(true, e.target.value)} />
      {searchQuery && <span className="match-count mono">{matches} / {total}</span>}
      <button className="chip-x" onClick={() => setSearch(false)}>✕</button>
    </div>
  );
}
```
- [ ] **Step 2: MessageList 재작성** — 구조 계약:
  - 데이터(G12 유지): 토픽 선택 시 `History(topic)`(liveMessages 갱신마다 재조회) / 미선택 시 `liveMessages.slice(-150)`(F12) / Recorded 시 `QueryRecorded(topic,500)` reverse + Refresh 버튼(G3) + 기록 empty 카피(G4) + stuck 가드(G13: isRecorded false→live 복귀).
  - 일시정지(F24): `paused`가 켜진 순간의 rows 스냅샷을 ref로 보관하고 표시(수집·msg/s는 계속). 재개 시 스냅샷 해제.
  - 검색(C26/C27/F9): searchOpen 시 SearchBar; 필터=payload substring(대소문자 무시, `bytesToString`) + 전체 뷰에선 토픽명도; 카운트=매치/전체.
  - 정렬(D61): `settings.messageOrder`에 따라 rows 뒤집기(가상화 인덱싱은 기존 newest-first 패턴 재사용하되 oldest 먼저면 정방향).
  - 시각(B30/F25): `formatTime(m.timestamp, settings.timestampFormat, settings.lang)` + `useNowTick(settings.timestampFormat==="relative")`.
  - 툴바(B28): 토픽명/전체 라벨 → msg/s(전역 5초 창=F4: liveMessages의 timestamp로 계산, 수신 0이면 숨김) → 기록 뱃지+세그먼트(SegmentedControl: srcLive/srcRec) → spacer → ⌕(활성 accent) → 일시정지/재개 → 지우기(F3: 선택 토픽만/전체 — 스토어에 `clearMessages(topic?)` 액션 추가) → Recorded면 Refresh만.
  - empty 3종(A13/B31): 미선택 `←`/메시지 없음 `◇`/검색 0 `⌕`.
  - 행(B30): 시각·[토픽]·미리보기·R(tooltip)·qN(tooltip). 클릭=selectMsg. 선택 bg `.12`.
- [ ] **Step 3: 스토어 소폭 확장** — `clearMessages(topic: string | null)` 액션 추가(해당 토픽만 또는 전체 liveMessages 제거; History는 백엔드 소유라 프론트 표시만 클리어 — 표시용 `clearedAt` 타임스탬프 맵으로 필터).
- [ ] **Step 4: CSS** · **Step 5: 게이트** tsc+build · **Step 6: Commit** — `feat(redesign): message list with search, rate, pause snapshot, recorded view`

### Task 21: MessageDetail 재설계

**covers:** B32~B36 C32 C33 C34 F13 F15 G5 G16 G17 D37 D40 D41

**Files:** Modify: `frontend/src/components/MessageDetail.tsx`(전면), `frontend/src/components/MessageList.tsx`(key 제거=G16), `frontend/src/App.css`

- [ ] **Step 1: 재작성** — 구조 계약:
  - props `{ msg: Message }`. fmt는 **스토어**(초기값: 설정 로드 시 `setFmt(settings.defaultFormat)` — App.tsx에서 1회), 리마운트 key 제거(G16).
  - 헤더(B33): "메시지" + 포맷 탭(SegmentedControl 4종, 활성 accent) + Diff 버튼(활성 `#d9822b`, tooltip diffTip; `toggleDiff()`=켜면 JSON 강제).
  - 메타(B34/F13): topic / time(HH:MM:SS)·qos·size(`base64ToBytes(payload).length` B)/props 한 줄(G17: content-type·response-topic·userProps " · " 조인).
  - 본문: diffOn && fmt json이면 직전 메시지(같은 토픽, History에서 현재 메시지 직전 항목)와 `diffJson` → DiffLine 렌더(B36: `{`/`}` 래퍼, 콤마, 변경/추가/삭제 스타일, `← 이전값`); 비교 불가면 일반 렌더 폴백(버튼 활성 유지=F15). 일반: `formatPayload(msg.payload, fmt)`.
- [ ] **Step 2: CSS** · **Step 3: 게이트** tsc · **Step 4: Commit** — `feat(redesign): message detail with diff mode and sticky format`

### Task 22: PublishPanel 재설계

**covers:** B37~B42 C35 C36 C37 F2 F32 F34 G8 G9 D42~D44 (+3.1.1 비활성)

**Files:** Modify: `frontend/src/components/PublishPanel.tsx`(전면), `frontend/src/App.css`

- [ ] **Step 1: 재작성** — 구조 계약:
  - 스토어 pubTopic/pubHint 구독(트리 채움=C22/C24, 직접 수정 시 힌트 소멸=C37: onChange에서 `setPubTopic(v, false)`).
  - 헤더(B38): "발행" + pubHint && pubTopic 시 `t("pubFilledNote")`.
  - 발행 행(B39): 토픽 input(placeholder pubTopicPh) + QoS + retain + 발행 버튼(**pubTopic 비거나 status!=="connected"면 비활성**=G8/C18).
  - 속성(B40/B41): `▸/▾ 속성 · N`(N=채워진 필드 수); **activeVersion==="3.1.1"이면 opacity .45 비활성 + props311 안내**; 펼침 시 패널 176→316px(App.css `.pub-pane.expanded`); content-type(placeholder `t("ctPlaceholder")`=F34)/response topic/user prop 행.
  - 발행(C35): 기존 base64 인코딩·createFrom 패턴 보존(G9), v5 속성 포함해 `Publish`; 성공 후 30ms 뒤 `selectTopic(topic)` + 최신 메시지 선택(F2). paused여도 발행 수행(F32).
- [ ] **Step 2: CSS** · **Step 3: 게이트** tsc+build · **Step 4: Commit** — `feat(redesign): publish panel with expanding v5 properties`

# Phase 5 — 설정 · 마무리

### Task 23: SettingsModal 재설계

**covers:** A5 B53~B57 C38 C39 F7 G6 G7 G15 D57~D62 (+setLang/applyTheme 즉시 반영)

**Files:** Modify: `frontend/src/components/SettingsModal.tsx`(전면), `frontend/src/App.css`

- [ ] **Step 1: 재작성** — 구조 계약:
  - 열릴 때 스토어 settings 사용(이미 GetSettings 로드됨). **모든 변경 즉시**: 스토어 갱신 + `SaveSettings`(전체 Settings 직렬화 — treeHintDismissed/recToastShown 포함) + 부수효과(언어=`setLang`+리렌더 트리거, 테마=`applyTheme`, 기본 포맷=`setFmt` 즉시 반영=F7, 버퍼=백엔드 즉시 적용=G7·C39).
  - 구성(B53~B57): 헤더(⚙+설정+✕) / 일반(언어·테마 세그먼트) / 메시지 표시(기본 포맷·타임스탬프·정렬 + 힌트 텍스트) / 데이터(슬라이더 50–500 step 10 + 현재값 + 힌트) / 완료.
  - 백드롭 클릭·✕·완료 모두 닫기(F7).
- [ ] **Step 2: CSS** · **Step 3: 게이트** tsc+build · **Step 4: Commit** — `feat(redesign): settings modal with instant apply`

### Task 24: 키보드 지원 + 구 코드 정리

**covers:** F28 C42 G14 (+F30 확인, 구 CSS/코드 제거)

**Files:** Modify: `ConnectionForm.tsx`, `SubscriptionChips.tsx`, `SearchBar.tsx`, `SettingsModal.tsx`, `ConnectionHome.tsx`, `App.css`

- [ ] **Step 1: Enter 제출** — 연결 모달(호스트/포트 input에서 Enter=연결), 구독 인라인 행(Enter=구독), 트리 empty state input(Enter=구독), 검색 input은 라이브 필터라 불필요.
- [ ] **Step 2: Esc 닫기** — 연결 모달/설정 모달/가이드 오버레이/검색 행: `useEffect` keydown 리스너(ContextMenu는 기존 Esc 유지=G14).
- [ ] **Step 3: 구 코드 정리** — App.css에서 교체 안 된 구 규칙 제거, 미사용 import/컴포넌트 잔재 제거, `npx tsc --noEmit` + `npx vitest run` + `wails build -clean`.
- [ ] **Step 4: Commit** — `feat(redesign): keyboard support and legacy cleanup`

### Task 25: MANUAL_TESTING 전면 갱신 + 전체 게이트

**covers:** 스펙 §5 시각 게이트 준비, 재연결 수동 시나리오(C15~C18)

**Files:** Modify: `docs/MANUAL_TESTING.md`(전면 재작성)

- [ ] **Step 1: 재작성** — 뷰별 섹션: Welcome(3카드·CTA) / Connection Home(선택·더블클릭·편집 프리필 전 필드·삭제 확인) / 연결 모달(빠른/고급·오류 배너 종류별·칩) / 연결 중(오버레이·취소) / 재연결(브로커 docker restart로 배너·시도 카운트·중단·재시도) / 트리(칩 구독·해지 dim·필터·힌트·⋯ 메뉴 4항목·브랜치 기록 숨김) / 메시지(검색·msg/s·일시정지 스냅샷·지우기 범위·정렬·상대시각) / 상세(포맷·Diff 변경·추가·삭제·폴백) / 발행(비활성 조건·속성 확장·3.1.1 비활성·발행 후 자동 선택) / Recorded(토글·Refresh·재시작 후 ●) / 설정(즉시 적용 전 항목·언어 전환·시스템 테마) / `?` 가이드(세션 유지!). 각 항목에 관련 레지스트리 ID 병기.
- [ ] **Step 2: 전체 게이트** — `go test ./... && go test -race ./internal/... && cd frontend && npx vitest run && npx tsc --noEmit && cd .. && wails build -clean` 전부 통과.
- [ ] **Step 3: Commit** — `docs(redesign): rewrite manual testing checklist for redesign`

### Task 26 (프로세스): 커버리지 감사 게이트

구현 태스크가 아니라 **실행 단계 지시**다:
- [ ] 전 태스크 완료 후, 독립 감사 에이전트가 레지스트리(A1~G19) **전 항목**을 코드와 대조해 `구현/누락/부분` 판정표 작성 (구현자 보고 불신, 코드 직접 확인).
- [ ] 누락/부분 항목 수정 라운드 → 재감사(누락 0까지).
- [ ] 이후 시각 게이트: 프로토타입 HTML vs 실제 앱 나란히 수동 비교(사용자와 함께, MANUAL_TESTING 기준).

---

## Self-Review 결과

**고아 ID 검사** (레지스트리 전 그룹 → 태스크 매핑):
- A1(T14) A2(T15) A3(T12) A4(T16) A5(T23) A6(T19) A7(T13/T19) A8(T13/T9) A9·A10(T13/T9) A11(T12/T17) A12(T18) A13(T20) A14(T15) A15(T19) A16(제외·SIM) ✅
- B1~B7(T12/T17) B8~B11(T14) B12~B18(T15) B19~B27(T18/T19) B28~B31(T20) B32~B36(T21) B37~B42(T22) B43~B52(T16) B53~B57(T23) B58(T19) B59~B62(T13) B63(T1) ✅
- C1·C2(T12) C3·C4(T17) C5(T14) C6~C11(T15/T16) C12·C13(T9/T13/T15/T16) C14(제외·SIM) C15~C18(T9/T13/T17) C19·C20(T18) C21~C25(T19) C26~C31(T20) C32~C34(T21) C35~C37(T22) C38·C39(T23) C40(T1+각 태스크 CSS) C41(T13 토스트/T20 ticker/T22 30ms; SIM 타이머 제외) C42(T24) C43(각 태스크 CSS) ✅
- D1~D63(T2 딕셔너리 + 각 컴포넌트 사용; treeAdd·simDropTitle 제외) ✅
- E1~E10(T1; --desk 제외) ✅
- F1(T19/T20) F2(T22) F3(T20) F4(T20) F5(T19) F6(T12/T14) F7(T23) F8(T16에 결정 기록) F9(T20) F10(T19) F11(T1/각 CSS) F12(T20) F13(T21) F14(T16) F15(T21) F16(T20) F17(T19) F18(T16) F19(T13) F20(T17) F21(T19) F22(레이아웃 flex — T12/각 CSS) F23(T2) F24(T20) F25(T5/T20) F26(T19 파생) F27(T15) F28(T24) F29(T13/T16) F30(T2) F31(T19) F32(T22) F33(T2/T6) F34(T2/T22) ✅
- G1(T16) G2(T19) G3·G4(T20) G5(T21) G6·G7(T8/T23) G8(T22) G9(T19/T22) G10(T12) G11(T19) G12·G13(T20) G14(T24) G15(T1/T12) G16(T21) G17(T21) G18(T18) G19(T6/T15) ✅
→ **고아 ID 없음.**

**의도적 결정 1건(F8)**: 프로토타입의 "연결 바 진입 시 이전 폼 값 유지"는 세션 상태 전제 — 모달 재마운트 구조에선 기본값 시작으로 통일(T16에 기록, 감사 시 노트 확인).

**Placeholder 검사**: 코드 골격 + 레지스트리 ID 참조 정책은 헤더에 명시(정본 참조이지 TBD 아님). lib/백엔드/스토어/브리지/공용 컴포넌트는 완전 코드 제공. **Type 일관성**: 스토어 액션명(selectTopic/setPubTopic/toggleDiff/resetSession/clearMessages 등)을 T10 정의 기준으로 T13~T23에서 동일 사용 확인. `clearMessages`는 T20 Step 3에서 추가 정의 — T10 인터페이스에 미리 없음을 T20에 명시함.
