# 버전 pill — 상시 버전 표시 + 업데이트 알림 이동 스펙

> 작성일: 2026-07-26 · 상태: 구현 완료 (PR #22 병합) · 브랜치: `feature/version-pill`
> 전제: 인앱 업데이트 기능([2026-07-05 스펙](2026-07-05-in-app-update-design.md))이 이미 구현돼 있다. 본 스펙은 그 **알림 UI만** 재설계한다 — 감지·다운로드·자기교체 로직은 그대로다.

## 1. 배경

### 1.1 문제

새 버전이 나와도 **설정 모달을 열어야만 알 수 있다.**

현재 신호는 ⚙ 아이콘 오른쪽 위의 8px 점 배지 하나뿐이다(`App.tsx:95`). 점은 "무언가 있다"만 말하고 그게 업데이트라는 의미는 전달하지 못하며, 실제 업데이트 버튼과 진행률·에러 표시는 전부 설정 모달 푸터 안에 있다(`SettingsModal.tsx:154-177`).

**현재 버전도 설정 안에서만 보인다.** `SettingsModal.tsx:26`이 mount 시 `GetVersion()`을 호출해 푸터에 표시한다. "지금 뭘 쓰고 있지?"를 확인하려면 매번 설정을 열어야 한다.

### 1.2 이전 결정을 뒤집는 것

2026-07-05 스펙은 알림 UI를 **의도적으로** 조용하게 잡았다:

> 알림 UI | **조용한 배지** — ⚙ 아이콘에 점 배지 + 설정 모달 푸터에 업데이트 버튼. 배너·모달 없음

배너·모달을 기각한 판단 자체는 지금도 유효하다 — 이 앱은 라이브 스트림을 지켜보는 디버깅 도구라 세로 공간을 뺏거나 작업을 가로막는 UI가 해롭다. **본 스펙은 그 판단을 유지한 채** 알림을 설정 밖으로 꺼낸다. 배너도 모달도 쓰지 않는다.

### 1.3 목표

한 요소로 두 가지를 동시에 해결한다: **현재 버전이 항상 보이고, 업데이트가 있으면 그 자리에서 알아채고 실행할 수 있다.**

## 2. 결정 사항

| 항목 | 결정 |
|---|---|
| 배치 | **타이틀바** 앱 이름 오른쪽. 배너·모달 없음(2026-07-05 판단 유지) |
| 표시 | 상시 표시. 평시엔 버전 텍스트, 업데이트 시 accent pill |
| 업데이트 실행 | **전부 메인 화면에서.** 알림·진행률·실패까지 pill이 담당 |
| 클릭 동작 | **즉시 실행하지 않고 팝오버**를 연다 — §3.2 |
| 설정 모달 | 업데이트 블록과 버전 푸터 제거. "시작 시 업데이트 확인" 토글은 유지 |
| ⚙ 점 배지 | **제거** |
| 감지 로직 | **변경 없음** — 시작 시 1회, 기존 그대로 |
| 주기적 재확인 | 범위 밖 — §6 |

새로 도입하는 상수·임계값은 없다. 튜닝할 숫자가 없는 변경이다.

## 3. UI 계약

### 3.1 화면 상태

판정 결과는 5종(`hidden` / `plain` / `available` / `progress` / `error`)이고, 그중 `plain`이 평시와 로컬 빌드 두 경우를 담는다.

| 판정 | 상태 | 표시 | 클릭 |
|---|---|---|---|
| `hidden` | 버전 미로딩 | **렌더하지 않음** | — |
| `plain` | 평시 | `v0.2.0` — 흐린 텍스트 | 없음 |
| `plain` | 로컬 빌드 | `dev` — 흐린 텍스트 | 없음 |
| `available` | 업데이트 있음 | `v0.2.0 → v0.3.0` — accent pill | 팝오버 |
| `progress` | 다운로드 중 | `다운로드 중… 42%` | 없음(비활성) |
| `error` | 실패 | `업데이트 실패 ⚠`, 전문은 `title` 툴팁 | 팝오버 |

`dev` 표시는 실질적 정보다. 로컬 빌드에서는 업데이트 체크가 스킵되므로(`version != "dev"` 조건), 지금 보는 것이 릴리스 빌드인지가 눈에 보인다.

### 3.2 클릭은 즉시 재시작하지 않는다

**이 스펙에서 가장 중요한 결정이다.**

현재 설정 모달의 버튼은 누르면 곧바로 `ApplyUpdate()` → 다운로드 → **앱 재시작**이다. 설정을 열어 누른다는 행위 자체가 "의도했다"는 방벽이었다. 타이틀바 pill은 `?`·`⚙` 버튼 바로 옆이라 **잘못 누르기 쉽고**, 라이브 스트림을 보며 디버깅하던 중 재시작되면 세션이 통째로 사라진다.

그래서 클릭 시 기존 `ContextMenu`(`components/ContextMenu.tsx`)로 팝오버를 연다:

```
┌─────────────────────────────┐
│ 지금 업데이트 (재시작됨)      │
│ 릴리스 노트 보기             │
└─────────────────────────────┘
```

- `canSelfUpdate === false`이면 첫 항목을 숨기고 릴리스 노트만 남긴다
- 실패 상태에서는 "릴리스 노트 보기"만, 실패 전문은 pill의 `title` 툴팁에
- `ContextMenu`는 외부 클릭·Escape를 이미 처리하므로 새로 만들 것이 없다

### 3.3 ⚙ 점 배지 제거

업데이트 액션이 설정에서 빠지면 ⚙의 점은 **아무것도 없는 곳을 가리킨다.** 사용자를 설정으로 유도했는데 거기 업데이트가 없으면 더 혼란스럽다.

## 4. 구현

### 4.1 버전 출처를 한 곳으로

스토어에 `version: string`(초기값 `""`)과 `setVersion`을 추가하고, `App.tsx`의 기존 mount 초기화 블록(`App.tsx:44-58`)에서 `GetUpdateInfo()`와 나란히 한 번 채운다.

`SettingsModal`은 자체 `GetVersion()` 호출과 로컬 state를 버리고 스토어를 읽는다 — IPC 호출이 하나 줄고 버전 출처가 하나로 모인다.

스토어에는 이미 `updateInfo` / `updateProgress` / `updateError`가 있으므로, `version`만 더하면 pill이 필요한 상태가 전부 한 자리에 모인다.

### 4.2 상태 판정은 순수 함수로

```ts
// frontend/src/lib/pillState.ts
export type PillState =
  | { kind: "hidden" }
  | { kind: "plain"; text: string }
  | { kind: "available"; from: string; to: string; canSelfUpdate: boolean; releaseURL: string }
  | { kind: "progress"; pct: number }
  | { kind: "error"; message: string; releaseURL: string };

export function pillState(
  version: string,
  updateInfo: UpdateInfo | null,
  updateProgress: number | null,
  updateError: string | null,
): PillState
```

**우선순위를 명시한다: 에러 > 진행률 > 업데이트 있음 > 평시.**

`events.ts:16-20`의 `update:error` 핸들러가 `setUpdateProgress(null)`을 먼저 호출하긴 하지만, 판정이 그 호출 순서에 의존하면 핸들러를 건드리는 순간 조용히 깨진다. 순수 함수 안에서 우선순위를 고정한다.

### 4.3 컴포넌트

**`frontend/src/components/VersionPill.tsx`** — 신규.

```
입력: 스토어의 version, updateInfo, updateProgress, updateError
출력: 타이틀바에 들어갈 <span> + 필요 시 ContextMenu
의존: pillState, ApplyUpdate/BrowserOpenURL(wailsjs), ContextMenu, i18n
```

`App.tsx`는 타이틀바에 `<VersionPill />` 한 줄을 끼우고, `updateInfo` 구독과 `upd-dot` 마크업을 제거한다. **App은 배치만 알고 업데이트 로직은 모른다.**

### 4.4 파일별 변경

| 파일 | 변경 |
|---|---|
| `frontend/src/lib/pillState.ts` | 신규 — 상태 판정 순수 함수 |
| `frontend/src/lib/pillState.test.ts` | 신규 — §5.2 |
| `frontend/src/components/VersionPill.tsx` | 신규 — pill + 팝오버 |
| `frontend/src/store/appStore.ts` | `version` 필드와 `setVersion` 추가 |
| `frontend/src/App.tsx` | 타이틀바에 `<VersionPill />`, `updateInfo` 구독·`upd-dot` 제거, mount 시 `GetVersion()` |
| `frontend/src/components/SettingsModal.tsx` | 업데이트 블록·`GetVersion()`·버전 푸터 제거 |
| `frontend/src/lib/i18n.ts` | 짧은 실패 라벨 1개 추가(ko/en) |
| `frontend/src/App.css` | `.version-pill` 상태별 스타일 추가, `.upd-dot` 제거 |

**i18n 키 정리** — 대부분 재사용한다.

| 용도 | 키 |
|---|---|
| 팝오버 "지금 업데이트" | `updRestart` 재사용 (`업데이트 후 재시작`) |
| 팝오버 "릴리스 노트 보기" | `updOpenRelease` 재사용 (`릴리스 페이지 열기`) |
| 진행률 | `updDownloading` 재사용 (`다운로드 중… {pct}%`) |
| 실패 툴팁 전문 | `updError` 재사용 (`업데이트 실패: {msg}`) |
| 업데이트 pill 툴팁 | `updAvailable` 재사용 (`새 버전 {v} 사용 가능`) |
| pill의 짧은 실패 라벨 | **신규 1개** `updFailedShort` — `updError`는 `{msg}`가 붙어 pill에 넣기엔 길다 |
| `v0.2.0 → v0.3.0` | 키 불필요 — 버전 문자열과 화살표뿐이라 번역할 것이 없다 |

`updAvailable`은 설정 모달에서만 쓰이던 키지만 버리지 않는다. §5.1의 좁은 창 처리에서 pill 텍스트가 ellipsis로 잘리는데, 그때 `title` 툴팁에 들어갈 문구로 정확히 맞는다.

즉 **신규 키는 `updFailedShort` 하나뿐이고, 제거되는 키는 없다.**

**Go 백엔드는 전혀 바뀌지 않는다.** `GetVersion` / `GetUpdateInfo` / `ApplyUpdate` 바인딩과 `update:*` 이벤트를 그대로 쓴다.

## 5. 엣지 케이스 · 테스트

### 5.1 엣지 케이스

- **버전 미로딩** — 스토어 초기값이 `""`. 이때는 pill을 렌더하지 않는다. 시작 직후 `v` 같은 깨진 텍스트가 잠깐 보이는 것보다 낫다
- **에러 + 진행률 동시** — 에러 우선. 이벤트 핸들러 호출 순서에 의존하지 않는다
- **업데이트 중 재클릭** — 진행 중 상태는 클릭 비활성. 백엔드에도 `a.updating` 가드가 있다
- **자기교체 불가** — 번들 밖 실행이나 translocation. 팝오버에서 "지금 업데이트"를 숨긴다
- **실패 후 재시도** — 팝오버를 다시 열면 "지금 업데이트"가 나온다. `setUpdateError(null)`을 먼저 호출해 이전 에러를 지운다(기존 설정 버튼과 동일)
- **좁은 창** — `min-width: 0` + `text-overflow: ellipsis`로 자르고 전문은 `title` 툴팁에
- **`dev` 빌드** — 체크가 스킵되므로 `updateInfo`는 항상 null. `dev` 텍스트만

### 5.2 테스트

**vitest — `lib/pillState.test.ts`**

- 빈 버전 → `hidden`
- 버전만 있고 `updateInfo` 없음 → `plain`
- `version === "dev"` → `plain`, 텍스트 `dev`
- `updateInfo` 있음 → `available`, `canSelfUpdate`와 `releaseURL` 전달
- `updateProgress` 세팅 → `progress`
- **진행률과 에러 동시 → `error`** (핸들러 순서 무관)
- 에러만 있고 `updateInfo` 없음 → 동작 명시. `updateError`는 `ApplyUpdate` 실패 시에만 나오고 그때는 `updateInfo`가 반드시 존재하므로 실제로는 도달 불가 — `plain`으로 떨어뜨리고 테스트로 고정한다

**수동 확인** (`docs/MANUAL_TESTING.md`에 추가)

자기교체는 실제 릴리스가 있어야 검증된다.

- [ ] 릴리스 빌드에서 pill에 현재 버전이 보인다
- [ ] 로컬 빌드에서는 `dev`가 보인다
- [ ] 새 버전이 있으면 pill이 accent로 바뀌고 `v0.2.0 → v0.3.0`을 표시한다
- [ ] pill 클릭 시 **바로 재시작되지 않고** 팝오버가 뜬다
- [ ] "지금 업데이트" → 진행률이 pill에 표시되고 완료 시 재시작된다
- [ ] 실패 시 pill이 실패 상태가 되고 툴팁에 전문이 보인다
- [ ] 설정 모달에 업데이트 블록이 없고 "시작 시 업데이트 확인" 토글은 남아 있다
- [ ] ⚙에 점 배지가 더는 뜨지 않는다

## 6. 범위 밖

- **주기적 업데이트 재확인** — 감지는 지금도 시작 시 1회다. pill이 상시 보이더라도 앱을 오래 켜 둔 세션 동안에는 갱신되지 않는다. 별개 변경이므로 이번에 건드리지 않는다
- **Windows 자기교체** — 2026-07-05 스펙대로 macOS만 자기교체, 나머지는 릴리스 페이지 폴백
- **배너·모달** — §1.2의 판단을 유지한다. pill로 부족한 것이 확인되면 그때 별도로 논의한다
