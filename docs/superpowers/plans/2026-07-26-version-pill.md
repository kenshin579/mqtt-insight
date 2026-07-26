# 버전 pill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 현재 버전을 타이틀바에 상시 표시하고, 업데이트 알림·실행·진행률·실패를 설정 모달에서 그 자리로 옮긴다.

**Architecture:** 상태 판정은 `lib/pillState.ts`의 순수 함수가 전담하고, `components/VersionPill.tsx`가 그 결과를 그리며 클릭 시 기존 `ContextMenu`로 팝오버를 연다. `App.tsx`는 타이틀바에 컴포넌트를 배치만 한다. **Go 백엔드는 전혀 바뀌지 않는다** — 기존 `GetVersion`/`GetUpdateInfo`/`ApplyUpdate` 바인딩과 `update:*` 이벤트를 그대로 쓴다.

**Tech Stack:** React 18 + TypeScript + zustand, vitest. Wails v2 바인딩(생성 코드, 수정 금지).

**Spec:** `docs/superpowers/specs/2026-07-26-version-pill-design.md`

---

## File Structure

### 신규

| 파일 | 책임 |
|---|---|
| `frontend/src/lib/pillState.ts` | 스토어 4개 값 → 어떤 pill을 그릴지 판정 (순수) |
| `frontend/src/lib/pillState.test.ts` | 위 테스트 |
| `frontend/src/components/VersionPill.tsx` | pill 렌더 + 팝오버 |

### 수정

| 파일 | 변경 |
|---|---|
| `frontend/src/store/appStore.ts` | `version` 필드 + `setVersion` |
| `frontend/src/store/appStore.test.ts` | `version`이 세션 리셋을 넘어 살아남는지 |
| `frontend/src/lib/i18n.ts` | `updFailedShort` 추가 (ko/en) |
| `frontend/src/App.tsx` | mount 시 `GetVersion()`, 타이틀바에 `<VersionPill />`, `upd-dot` 제거 |
| `frontend/src/components/SettingsModal.tsx` | 업데이트 블록·`GetVersion()`·버전 푸터 제거 |
| `frontend/src/App.css` | `.version-pill` 추가, 죽은 규칙 제거 |
| `docs/MANUAL_TESTING.md` | 수동 확인 항목 |

### 태스크 순서 근거

Task 1~3은 **순수 추가**라 빌드가 계속 green이다. Task 4는 컴포넌트를 만들지만 아직 아무도 쓰지 않아 역시 green. Task 5에서 처음 화면에 나타나고, Task 6이 설정 모달을 정리한다. **Task 5와 6 사이에도 앱은 정상 동작한다** — 잠시 pill과 설정 양쪽에 업데이트 UI가 보일 뿐이다.

---

## Task 1: pillState 판정 함수

스토어의 4개 값에서 pill의 표시 상태를 결정한다. UI가 없는 순수 함수라 전 분기를 테스트로 덮을 수 있다.

**Files:**
- Create: `frontend/src/lib/pillState.ts`
- Test: `frontend/src/lib/pillState.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/lib/pillState.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { pillState } from "./pillState";
import type { UpdateInfo } from "../types";

const upd: UpdateInfo = {
  version: "v0.3.0",
  releaseURL: "https://example.test/releases/v0.3.0",
  assetURL: "https://example.test/mqtt-insight-v0.3.0-macos-universal.zip",
  canSelfUpdate: true,
};

describe("pillState", () => {
  it("hides until the version has loaded", () => {
    expect(pillState("", null, null, null)).toEqual({ kind: "hidden" });
  });

  it("shows the plain version when no update is known", () => {
    expect(pillState("v0.2.0", null, null, null)).toEqual({ kind: "plain", text: "v0.2.0" });
  });

  it("shows a dev build as-is", () => {
    expect(pillState("dev", null, null, null)).toEqual({ kind: "plain", text: "dev" });
  });

  it("carries canSelfUpdate and the release URL when an update exists", () => {
    expect(pillState("v0.2.0", upd, null, null)).toEqual({
      kind: "available",
      from: "v0.2.0",
      to: "v0.3.0",
      canSelfUpdate: true,
      releaseURL: upd.releaseURL,
    });
  });

  it("passes canSelfUpdate through when self-update is unavailable", () => {
    expect(pillState("v0.2.0", { ...upd, canSelfUpdate: false }, null, null)).toMatchObject({
      kind: "available",
      canSelfUpdate: false,
    });
  });

  it("reports a download in progress", () => {
    expect(pillState("v0.2.0", upd, 42, null)).toEqual({ kind: "progress", pct: 42 });
  });

  it("treats 0% as in progress, not as absent", () => {
    // A truthiness check instead of `!== null` would fall through to "available"
    // here and the pill would flip back to the update prompt mid-download.
    expect(pillState("v0.2.0", upd, 0, null)).toEqual({ kind: "progress", pct: 0 });
  });

  it("prefers the error over progress regardless of handler order", () => {
    expect(pillState("v0.2.0", upd, 42, "disk full")).toEqual({
      kind: "error",
      message: "disk full",
      releaseURL: upd.releaseURL,
    });
  });

  it("falls back to the plain version if an error arrives with no update info", () => {
    expect(pillState("v0.2.0", null, null, "stray")).toEqual({ kind: "plain", text: "v0.2.0" });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd frontend && npx vitest run src/lib/pillState.test.ts`
Expected: FAIL — `Cannot find module './pillState'`

- [ ] **Step 3: 구현**

`frontend/src/lib/pillState.ts`:

```ts
import type { UpdateInfo } from "../types";

export type PillState =
  | { kind: "hidden" }
  | { kind: "plain"; text: string }
  | { kind: "available"; from: string; to: string; canSelfUpdate: boolean; releaseURL: string }
  | { kind: "progress"; pct: number }
  | { kind: "error"; message: string; releaseURL: string };

/**
 * What the titlebar pill should show.
 *
 * The priority — error, then progress, then an available update — is fixed here
 * rather than inferred from which store fields happen to be set. The
 * `update:error` handler in `bridge/events.ts` does clear the progress before
 * setting the error, but a judgement that leans on that call order breaks
 * silently the moment someone edits the handler.
 */
export function pillState(
  version: string,
  updateInfo: UpdateInfo | null,
  updateProgress: number | null,
  updateError: string | null,
): PillState {
  if (!version) return { kind: "hidden" };

  if (updateInfo) {
    if (updateError) {
      return { kind: "error", message: updateError, releaseURL: updateInfo.releaseURL };
    }
    if (updateProgress !== null) {
      return { kind: "progress", pct: updateProgress };
    }
    return {
      kind: "available",
      from: version,
      to: updateInfo.version,
      canSelfUpdate: updateInfo.canSelfUpdate,
      releaseURL: updateInfo.releaseURL,
    };
  }

  // An error without updateInfo should be unreachable: updateError is only set
  // by a failed ApplyUpdate, which needs an update to apply. Falling back to the
  // plain version rather than inventing an error state that has no release link
  // to offer.
  return { kind: "plain", text: version };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd frontend && npx vitest run src/lib/pillState.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/lib/pillState.ts frontend/src/lib/pillState.test.ts
git commit -m "feat(frontend): add titlebar pill state resolution"
```

---

## Task 2: 스토어에 버전 추가

지금 버전은 `SettingsModal`이 mount할 때마다 직접 가져온다. pill이 상시 보이려면 App 레벨에서 한 번만 가져와 스토어에 둬야 한다.

**Files:**
- Modify: `frontend/src/store/appStore.ts`
- Test: `frontend/src/store/appStore.test.ts` (기존 파일에 추가)

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/store/appStore.test.ts` 끝의 `describe` 블록 안에 추가:

```ts
  it("keeps the build version across a session reset", () => {
    // The version is a property of the binary, not of a broker session —
    // reconnecting must not blank the pill.
    const st = useAppStore.getState();
    st.setVersion("v0.2.0");
    st.resetSession();
    expect(useAppStore.getState().version).toBe("v0.2.0");
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd frontend && npx vitest run src/store/appStore.test.ts`
Expected: FAIL — `st.setVersion is not a function`

- [ ] **Step 3: 구현**

`frontend/src/store/appStore.ts`의 `AppState` 인터페이스에서 `// update` 주석 블록을 다음으로 교체:

```ts
  // update
  version: string; // build version from Go; "" until GetVersion resolves
  updateInfo: UpdateInfo | null;
```

액션 선언에서 `setUpdateInfo` 위에 추가:

```ts
  setVersion: (v: string) => void;
```

초기 상태에서 `updateInfo: null,`로 시작하는 줄을 교체:

```ts
  version: "", updateInfo: null, updateProgress: null, updateError: null,
```

구현에서 `setUpdateInfo` 위에 추가:

```ts
  setVersion: (v) => set({ version: v }),
```

`resetSession`은 건드리지 않는다 — 버전은 세션이 아니라 바이너리의 속성이다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd frontend && npx vitest run src/store/appStore.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/store/appStore.ts frontend/src/store/appStore.test.ts
git commit -m "feat(frontend): hold the build version in the store"
```

---

## Task 3: i18n 문구 추가

pill은 폭이 좁아 `updError`(`업데이트 실패: {msg}`)를 그대로 넣을 수 없다. 짧은 라벨이 하나 필요하다. 전문은 툴팁으로 간다.

`i18n.test.ts`가 ko/en 키 집합 일치와 빈 문자열 없음을 검사하므로 **반드시 양쪽에 넣는다.**

**Files:**
- Modify: `frontend/src/lib/i18n.ts`

- [ ] **Step 1: ko 사전에 추가**

`updError: '업데이트 실패: {msg}',` 바로 아래에 추가:

```ts
    updFailedShort: '업데이트 실패',
```

- [ ] **Step 2: en 사전에 추가**

`updError: 'Update failed: {msg}',` 바로 아래에 추가:

```ts
    updFailedShort: 'Update failed',
```

- [ ] **Step 3: 키 일치 테스트 통과 확인**

Run: `cd frontend && npx vitest run src/lib/i18n.test.ts`
Expected: PASS — "ko and en have identical key sets" 포함

- [ ] **Step 4: 커밋**

```bash
git add frontend/src/lib/i18n.ts
git commit -m "feat(i18n): add the short update-failed label for the pill"
```

---

## Task 4: VersionPill 컴포넌트

**Files:**
- Create: `frontend/src/components/VersionPill.tsx`

- [ ] **Step 1: 구현**

`frontend/src/components/VersionPill.tsx`:

```tsx
import { useState } from "react";
import { ApplyUpdate } from "../../wailsjs/go/main/App";
import { BrowserOpenURL } from "../../wailsjs/runtime/runtime";
import { useAppStore } from "../store/appStore";
import { pillState } from "../lib/pillState";
import { t } from "../lib/i18n";
import { ContextMenu, type MenuItem } from "./ContextMenu";

/**
 * The build version in the titlebar, which doubles as the update affordance.
 *
 * Clicking never applies the update directly. This sits next to the ? and gear
 * buttons, and applying downloads and then restarts the app — a mis-click would
 * throw away whatever live session the user was watching. It opens a popover
 * and lets them choose.
 */
export function VersionPill() {
  const version = useAppStore((s) => s.version);
  const updateInfo = useAppStore((s) => s.updateInfo);
  const updateProgress = useAppStore((s) => s.updateProgress);
  const updateError = useAppStore((s) => s.updateError);
  const setUpdateError = useAppStore((s) => s.setUpdateError);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const st = pillState(version, updateInfo, updateProgress, updateError);

  if (st.kind === "hidden") return null;
  if (st.kind === "plain") return <span className="version-pill">{st.text}</span>;
  if (st.kind === "progress") {
    return <span className="version-pill busy">{t("updDownloading", { pct: st.pct })}</span>;
  }

  const items: MenuItem[] = [];
  if (st.kind === "available" && st.canSelfUpdate) {
    items.push({
      label: t("updRestart"),
      // Clear any earlier failure first, so a retry does not start out looking
      // like it already failed.
      onClick: () => { setUpdateError(null); void ApplyUpdate(); },
    });
  }
  items.push({ label: t("updOpenRelease"), onClick: () => BrowserOpenURL(st.releaseURL) });

  function openMenu(e: React.MouseEvent<HTMLButtonElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    setMenu({ x: r.left, y: r.bottom + 4 });
  }

  return (
    <>
      {st.kind === "available" ? (
        // The title carries the full text for the case where a narrow window
        // ellipsises the pill.
        <button className="version-pill update" onClick={openMenu} title={t("updAvailable", { v: st.to })}>
          {st.from} → {st.to}
        </button>
      ) : (
        <button className="version-pill failed" onClick={openMenu} title={t("updError", { msg: st.message })}>
          {t("updFailedShort")} ⚠
        </button>
      )}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} />}
    </>
  );
}
```

- [ ] **Step 2: 타입체크 확인**

Run: `cd frontend && npx tsc --noEmit`
Expected: 출력 없음. 아직 아무도 이 컴포넌트를 쓰지 않지만 컴파일은 통과해야 한다.

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/components/VersionPill.tsx
git commit -m "feat(frontend): add the titlebar version pill

Clicking opens a popover rather than applying the update, because the pill
sits beside the ? and gear buttons and applying restarts the app."
```

---

## Task 5: 타이틀바에 배치

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: import와 스토어 구독 정리**

`frontend/src/App.tsx:4`의 wailsjs import에 `GetVersion`을 추가:

```ts
import { Connect, GetProfiles, GetSettings, RecordedTopics, GetUpdateInfo, GetVersion } from "../wailsjs/go/main/App";
```

컴포넌트 import 목록(`import { TopicTree } ...` 근처)에 추가:

```ts
import { VersionPill } from "./components/VersionPill";
```

`const updateInfo = useAppStore((s) => s.updateInfo);` 줄을 **삭제**하고, 그 자리에 추가:

```ts
  const setVersion = useAppStore((s) => s.setVersion);
```

> `setUpdateInfo`는 그대로 둔다 — `GetUpdateInfo()` pull에 여전히 쓰인다.

- [ ] **Step 2: mount 시 버전 조회**

mount `useEffect` 안, `GetUpdateInfo().then(...)` 줄 바로 위에 추가:

```ts
    GetVersion().then(setVersion);
```

- [ ] **Step 3: 타이틀바 마크업 교체**

`<span className="app-name">MQTT Insight</span>` 줄 바로 아래에 추가:

```tsx
        <VersionPill />
```

그리고 ⚙ 버튼의 점 배지를 제거한다 — 다음 줄을

```tsx
          ⚙{updateInfo && <i className="upd-dot" />}
```

이렇게 바꾼다:

```tsx
          ⚙
```

> 업데이트 액션이 설정에서 빠지면 이 점은 아무것도 없는 곳을 가리킨다.

- [ ] **Step 4: 타입체크와 테스트 확인**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: tsc 출력 없음, vitest 전체 통과

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/App.tsx
git commit -m "feat(frontend): show the version pill in the titlebar

Drops the gear dot badge: with the update action leaving settings, it
would point at a screen that no longer has one."
```

---

## Task 6: 설정 모달 정리

**Files:**
- Modify: `frontend/src/components/SettingsModal.tsx`

- [ ] **Step 1: 업데이트 블록 삭제**

`{updateInfo && (` 로 시작해 `)}` 로 끝나는 블록 전체(`settings-update` div를 감싸는 부분)를 삭제한다.

- [ ] **Step 2: 버전 푸터 삭제**

`settings-footer` 안의 다음 줄을 삭제:

```tsx
          <div className="settings-version">mqtt-insight {version}</div>
```

- [ ] **Step 3: 죽은 상태와 import 제거**

다음을 삭제한다:

```ts
  const updateInfo = useAppStore((s) => s.updateInfo);
  const updateProgress = useAppStore((s) => s.updateProgress);
  const updateError = useAppStore((s) => s.updateError);
  const setUpdateError = useAppStore((s) => s.setUpdateError);
  const [version, setVersion] = useState("");
```

```ts
  useEffect(() => { GetVersion().then(setVersion); }, []);
```

import 1~3행 — `react`, `wailsjs/go/main/App`, `wailsjs/runtime/runtime` — 을 다음 **한 줄**로 교체:

```ts
import { SaveSettings } from "../../wailsjs/go/main/App";
```

> 4행의 `import { config } from "../../wailsjs/go/models";` 는 `patch()`가 계속 쓰므로 **그대로 둔다.** 5행 이하(`useAppStore`, `i18n`, `theme`, `SegmentedControl`, `useEscape`)도 전부 남는다.
>
> `useEffect`/`useState`/`GetVersion`/`ApplyUpdate`/`BrowserOpenURL`이 모두 쓰이지 않게 되어 React import 줄과 두 wailsjs import 줄이 사라지는 것이다. 삭제 전에 파일 안에 다른 사용처가 없는지 grep으로 확인할 것.

- [ ] **Step 4: 확인**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: tsc 출력 없음, vitest 전체 통과

추가 확인: `grep -n "useState\|useEffect\|ApplyUpdate\|BrowserOpenURL\|GetVersion" frontend/src/components/SettingsModal.tsx` → 출력 없음

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/components/SettingsModal.tsx
git commit -m "refactor(frontend): move the update affordance out of settings

The 'check for updates at startup' toggle stays — that is a setting. The
notification, progress and failure states now live on the titlebar pill."
```

---

## Task 7: 스타일

**Files:**
- Modify: `frontend/src/App.css`

- [ ] **Step 1: `.upd-dot` 규칙 삭제**

16-17행의 두 줄짜리 규칙을 삭제:

```css
.upd-dot { position: absolute; top: 1px; right: 1px; width: 7px; height: 7px; border-radius: 50%;
  background: var(--err); pointer-events: none; }
```

`.tb-btn.gear`의 `position: relative`는 남겨도 무해하지만, 배지를 위해 있던 것이므로 함께 정리한다 — `.tb-btn.gear { font-size: 14px; position: relative; }`를 `.tb-btn.gear { font-size: 14px; }`로.

- [ ] **Step 2: `.version-pill` 규칙 추가**

`.titlebar .app-name` 규칙 바로 아래에 추가:

```css
.version-pill { font-family: var(--font-mono); font-size: 10.5px; color: var(--dim2);
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: none; }
.version-pill.busy { color: var(--dim); }
button.version-pill { background: var(--chip); border: none; border-radius: 999px;
  padding: 2px 8px; cursor: pointer; }
button.version-pill.update { color: var(--accent); }
button.version-pill.failed { color: var(--err); }
button.version-pill:hover { background: var(--hoverbg); }
```

착수 전에 `--chip`, `--accent`, `--err`, `--hoverbg`, `--dim`, `--dim2`가 `frontend/src/lib/tokens.css`에 실제로 정의돼 있는지 확인할 것. 없는 이름이 있으면 하드코딩 대신 같은 용도의 기존 변수를 찾아 쓰고, 무엇을 썼는지 보고할 것.

- [ ] **Step 3: 죽은 설정 모달 스타일 삭제**

Task 6에서 마크업이 사라졌으므로 다음 규칙들을 삭제:

```css
.settings-update { ... }
.settings-update-label { ... }
.settings-update-error { ... }
.settings-update-error a { ... }
.settings-version { ... }
```

삭제 전에 `grep -rn "settings-update\|settings-version" frontend/src --include=*.tsx` 로 남은 사용처가 없음을 확인할 것.

- [ ] **Step 4: 확인**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: 통과

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/App.css
git commit -m "style(frontend): add version pill styles, drop the dead update rules"
```

---

## Task 8: 수동 확인 항목과 전체 검증

자기교체는 실제 릴리스가 있어야 검증되므로 체크리스트로 남긴다.

**Files:**
- Modify: `docs/MANUAL_TESTING.md`

- [ ] **Step 1: 체크리스트 추가**

`docs/MANUAL_TESTING.md` 끝에 추가:

```markdown

## 버전 pill (2026-07-26)

`dev` 빌드에서 확인 가능한 것과, 실제 릴리스가 있어야 확인 가능한 것을 나눠 둔다.

**dev 빌드에서 (`make dev`)**

- [ ] 타이틀바 앱 이름 오른쪽에 `dev`가 보인다
- [ ] `dev`는 클릭해도 아무 일도 일어나지 않는다
- [ ] ⚙에 점 배지가 더는 뜨지 않는다
- [ ] 설정 모달에 업데이트 블록과 버전 표기가 없고, "시작 시 업데이트 확인" 토글은 남아 있다

**릴리스 빌드 + 새 버전이 있을 때**

- [ ] pill에 현재 버전이 보인다 (`v0.2.0`)
- [ ] 새 버전이 있으면 accent 색으로 `v0.2.0 → v0.3.0`을 표시한다
- [ ] pill 클릭 시 **바로 재시작되지 않고** 팝오버가 뜬다
- [ ] 팝오버의 "업데이트 후 재시작" → 진행률이 pill에 표시되고 완료 시 재시작된다
- [ ] 팝오버의 "릴리스 페이지 열기" → 브라우저가 열린다
- [ ] 창을 좁히면 pill이 잘리고, 마우스를 올리면 툴팁에 전문이 보인다
- [ ] 실패 시 pill이 `업데이트 실패 ⚠`가 되고 툴팁에 실패 사유가 보인다
- [ ] 실패 후 팝오버를 다시 열어 재시도할 수 있다
```

- [ ] **Step 2: 전체 테스트**

Run (저장소 루트에서): `make test`
Expected: Go vet/test 전 패키지 ok, vitest 전체 통과, tsc 오류 0건

- [ ] **Step 3: 앱을 띄워 눈으로 확인**

Run: `make dev`

`dev` 빌드이므로 업데이트 체크는 스킵된다. 위 "dev 빌드에서" 4개 항목을 확인하고, 확인 후 앱을 닫는다.

- [ ] **Step 4: 커밋**

```bash
git add docs/MANUAL_TESTING.md
git commit -m "docs: add the version pill manual checklist"
```

---

## 완료 후

1. `git log --oneline main..HEAD`로 8개 커밋 확인
2. PR 생성 (글로벌 정책: `gh pr create` + HEREDOC, `--reviewer` 사용 금지)
3. 스펙 §6의 범위 밖 항목(주기적 업데이트 재확인)은 그대로 둔다 — 필요해지면 별도 논의
