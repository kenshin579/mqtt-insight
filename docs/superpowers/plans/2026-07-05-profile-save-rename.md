# 프로필 저장 개선 (rename + 저장 후 연결) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 연결 모달에서 프로필 rename이 동작하게 하고, 저장을 연결 성공 이후가 아니라 연결 시도 전에 수행한다.

**Architecture:** upsert 로직을 `internal/config`의 `UpsertProfile(p, prevName)`로 옮겨 Wails 없이 테스트한다. 프론트는 편집 시작 시점의 원본 이름(`originName`)을 추적해 저장 시 전달하고, `connect()`에서 저장 → 연결 순서로 실행한다. 자동 이름은 `host:port` 형식.

**Tech Stack:** Go 1.25 (`internal/config`), Wails v2 바인딩, React 18 + TypeScript (`ConnectionForm.tsx`).

**Spec:** `docs/superpowers/specs/2026-07-05-profile-save-rename-design.md`

---

### Task 1: `config.AutoName` + `config.UpsertProfile` (Go, TDD)

**Files:**
- Modify: `internal/config/config.go` (HasHostPort 아래에 추가)
- Test: `internal/config/config_test.go`

- [ ] **Step 1: 실패하는 테스트 작성**

`internal/config/config_test.go` 끝에 추가:

```go
func TestAutoName(t *testing.T) {
	if got := AutoName("localhost", 1883); got != "localhost:1883" {
		t.Fatalf("AutoName = %q, want localhost:1883", got)
	}
}

func TestUpsertProfile(t *testing.T) {
	// 공통 시작 상태: Test1(localhost:1883), Other(10.0.0.5:8883)
	base := func() *Config {
		return &Config{Profiles: []Profile{
			{Name: "Test1", Host: "localhost", Port: 1883},
			{Name: "Other", Host: "10.0.0.5", Port: 8883},
		}}
	}
	names := func(c *Config) []string {
		out := make([]string, len(c.Profiles))
		for i, p := range c.Profiles {
			out[i] = p.Name
		}
		return out
	}

	t.Run("prevName 존재, 이름 유지 → 내용 교체", func(t *testing.T) {
		c := base()
		c.UpsertProfile(Profile{Name: "Test1", Host: "localhost", Port: 1884}, "Test1")
		if len(c.Profiles) != 2 || c.Profiles[0].Port != 1884 {
			t.Fatalf("got %+v", c.Profiles)
		}
	})

	t.Run("prevName 존재, 이름 변경 → rename, 개수 불변", func(t *testing.T) {
		c := base()
		c.UpsertProfile(Profile{Name: "Test2", Host: "localhost", Port: 1883}, "Test1")
		got := names(c)
		if len(got) != 2 || got[0] != "Test2" || got[1] != "Other" {
			t.Fatalf("names = %v", got)
		}
	})

	t.Run("rename 새 이름이 다른 프로필과 충돌 → 충돌 프로필 제거", func(t *testing.T) {
		c := base()
		c.UpsertProfile(Profile{Name: "Other", Host: "localhost", Port: 1883}, "Test1")
		if len(c.Profiles) != 1 || c.Profiles[0].Name != "Other" || c.Profiles[0].Host != "localhost" {
			t.Fatalf("got %+v", c.Profiles)
		}
	})

	t.Run("prevName 미존재 → 이름 기준 upsert 폴백", func(t *testing.T) {
		c := base()
		c.UpsertProfile(Profile{Name: "Test1", Host: "localhost", Port: 1999}, "Ghost")
		if len(c.Profiles) != 2 || c.Profiles[0].Port != 1999 {
			t.Fatalf("got %+v", c.Profiles)
		}
	})

	t.Run("새 프로필, 직접 지은 이름, host:port 중복 → 정상 추가", func(t *testing.T) {
		c := base()
		c.UpsertProfile(Profile{Name: "Prod", Host: "localhost", Port: 1883}, "")
		if len(c.Profiles) != 3 {
			t.Fatalf("names = %v", names(c))
		}
	})

	t.Run("새 프로필, 자동 이름, host:port 중복 → 추가 스킵", func(t *testing.T) {
		c := base()
		c.UpsertProfile(Profile{Name: "localhost:1883", Host: "localhost", Port: 1883}, "")
		if len(c.Profiles) != 2 {
			t.Fatalf("names = %v", names(c))
		}
	})

	t.Run("자동 이름끼리 같은 host 다른 port → 별도 프로필", func(t *testing.T) {
		c := &Config{}
		c.UpsertProfile(Profile{Name: "localhost:1883", Host: "localhost", Port: 1883}, "")
		c.UpsertProfile(Profile{Name: "localhost:8883", Host: "localhost", Port: 8883}, "")
		if len(c.Profiles) != 2 {
			t.Fatalf("names = %v", names(c))
		}
	})

	t.Run("자동 이름 프로필 재접속(같은 이름) → 교체, 중복 없음", func(t *testing.T) {
		c := &Config{}
		c.UpsertProfile(Profile{Name: "localhost:1883", Host: "localhost", Port: 1883}, "")
		c.UpsertProfile(Profile{Name: "localhost:1883", Host: "localhost", Port: 1883, ClientID: "x"}, "")
		if len(c.Profiles) != 1 || c.Profiles[0].ClientID != "x" {
			t.Fatalf("got %+v", c.Profiles)
		}
	})
}
```

- [ ] **Step 2: 실패 확인**

Run: `go test ./internal/config/ -run 'TestAutoName|TestUpsertProfile' -v`
Expected: FAIL — `undefined: AutoName`, `c.UpsertProfile undefined` (컴파일 에러)

- [ ] **Step 3: 구현**

`internal/config/config.go` — import에 `"fmt"` 추가, `HasHostPort` 아래에:

```go
// AutoName is the default profile name when the user leaves it blank.
// Must stay in sync with the same template in ConnectionForm.tsx.
func AutoName(host string, port int) string {
	return fmt.Sprintf("%s:%d", host, port)
}

// UpsertProfile inserts or updates a profile. prevName is the profile's
// name when editing began ("" for a new profile); it lets a rename update
// the original entry instead of being dropped or duplicated.
func (c *Config) UpsertProfile(p Profile, prevName string) {
	if prevName != "" && prevName != p.Name {
		if i := c.indexByName(prevName); i >= 0 {
			// rename: the new name overwrites any other profile holding it
			if j := c.indexByName(p.Name); j >= 0 && j != i {
				c.Profiles = append(c.Profiles[:j], c.Profiles[j+1:]...)
				if j < i {
					i--
				}
			}
			c.Profiles[i] = p
			return
		}
	}
	if i := c.indexByName(p.Name); i >= 0 {
		c.Profiles[i] = p
		return
	}
	// auto-named quick connect must not pile up entries for a broker
	// that is already saved under another name
	if p.Name == AutoName(p.Host, p.Port) && c.HasHostPort(p.Host, p.Port) {
		return
	}
	c.Profiles = append(c.Profiles, p)
}

func (c *Config) indexByName(name string) int {
	for i := range c.Profiles {
		if c.Profiles[i].Name == name {
			return i
		}
	}
	return -1
}
```

- [ ] **Step 4: 통과 확인**

Run: `go test ./internal/config/ -v`
Expected: 전부 PASS (기존 테스트 포함)

- [ ] **Step 5: 커밋**

```bash
git add internal/config/config.go internal/config/config_test.go
git commit -m "feat(config): UpsertProfile with rename support and narrowed dedup guard"
```

---

### Task 2: `app.go` `SaveProfile` 시그니처 변경

**Files:**
- Modify: `app.go:90-104` (SaveProfile)

주의: 이 커밋에서는 `frontend/wailsjs/` 재생성을 하지 않는다 (하면 프론트 호출부가 1-인자라 tsc가 깨짐). 재생성은 Task 3에서 프론트 수정과 함께 간다.

- [ ] **Step 1: SaveProfile 교체**

`app.go`의 기존 `SaveProfile` 전체(90~104행)를 다음으로 교체:

```go
// SaveProfile upserts a profile and persists. prevName is the profile's
// name when editing began ("" for a new profile) so renames update the
// original entry.
func (a *App) SaveProfile(p config.Profile, prevName string) error {
	a.cfg.UpsertProfile(p, prevName)
	return config.Save(a.cfgPath, a.cfg)
}
```

- [ ] **Step 2: Go 검증**

Run: `go vet ./... && go test ./...`
Expected: PASS (통합 테스트는 `-tags=integration`이 아니므로 브로커 불필요)

- [ ] **Step 3: 커밋**

```bash
git add app.go
git commit -m "feat: SaveProfile takes prevName for rename-aware upsert"
```

---

### Task 3: 프론트 — `originName` 추적 + 저장 후 연결

**Files:**
- Modify: `frontend/src/components/ConnectionForm.tsx`
- Regenerate: `frontend/wailsjs/` (`wails generate module` — 직접 수정 금지)

- [ ] **Step 1: Wails 바인딩 재생성**

Run: `wails generate module`
Expected: `frontend/wailsjs/go/main/App.d.ts`의 `SaveProfile`이 `(arg1:config.Profile,arg2:string)=>Promise<void>`로 갱신됨. 확인:

```bash
grep "SaveProfile" frontend/wailsjs/go/main/App.d.ts
```

- [ ] **Step 2: `originName` 상태 추가**

`ConnectionForm.tsx`에서 `selectedChip` 선언(26행) 아래에 추가:

```tsx
  // What we are editing: the profile's name when editing began ("" = new).
  // Survives chip deselection (B47) — visual state and edit identity differ.
  const [originName, setOriginName] = useState<string>(editProfile?.name ?? "");
```

`pickChip`/`newChip`을 다음으로 교체:

```tsx
  function pickChip(sp: config.Profile) {
    setP(config.Profile.createFrom(sp));
    setSelectedChip(sp.name);
    setOriginName(sp.name);
  }
  function newChip() {
    setP(empty());
    setSelectedChip(null);
    setOriginName("");
  }
```

- [ ] **Step 3: `connect()`를 저장 → 연결 순서로 교체**

기존 `connect()` 함수(62~82행) 전체를 다음으로 교체:

```tsx
  async function connect() {
    // Auto-name must stay in sync with config.AutoName in Go.
    const finalP = config.Profile.createFrom({ ...p, name: p.name.trim() || `${p.host}:${p.port}` });
    setConnectError(null);
    setConnecting(true);
    // Save first: edits survive a failed connect (spec 2026-07-05).
    try {
      await SaveProfile(finalP, originName);
      setOriginName(finalP.name); // retry must not reuse a stale prevName
      reloadProfiles();
      onSaved();
    } catch (e) {
      setConnectError(classifyConnectError(String(e), finalP.host));
      setConnecting(false);
      return;
    }
    try {
      resetSession();
      setActiveVersion(finalP.version);
      setBroker(`${finalP.host}:${finalP.port}`);
      await Connect(finalP);
      onConnected?.(finalP);
      onClose();
    } catch (e) {
      setBroker("");
      setConnectError(classifyConnectError(String(e), finalP.host));
    } finally {
      setConnecting(false);
    }
  }
```

변경 요점: `SaveProfile`이 `Connect` 앞으로, 실패 시 연결 시도 없이 중단. `onSaved()`(부모 App.tsx의 `reloadProfiles`)는 저장 직후 호출 — 연결이 실패해도 사이드바가 갱신되도록. 기존 코드에서 `onSaved()`가 성공 경로에만 있던 것과 달라진다.

- [ ] **Step 4: 검증**

Run: `make test`
Expected: go vet/test + vitest + `tsc --noEmit` 전부 PASS

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/components/ConnectionForm.tsx frontend/wailsjs
git commit -m "feat(frontend): save profile before connect, track origin name for rename"
```

---

### Task 4: 수동 테스트 체크리스트 갱신

**Files:**
- Modify: `docs/MANUAL_TESTING.md` — "## 3. 연결 모달 (A4)" 섹션 끝에 추가

- [ ] **Step 1: 시나리오 추가**

62행("저장된 프로필 칩 목록 표시…") 항목 아래에 추가:

```markdown
- [ ] 프로필 칩 선택 → 이름 변경 → Connect → 재접속 후 모달을 다시 열면 칩에 **새 이름 하나만** 존재(구 이름 사라짐, 중복 없음)
- [ ] 프로필 칩 선택 → 존재하지 않는 host로 수정 → Connect 실패 → 모달 닫고 다시 열어도 수정 내용이 프로필에 저장되어 있음(저장 후 연결)
- [ ] 이름을 비우고 Quick connect → 프로필 이름이 `host:port` 형식으로 저장, 같은 브로커에 반복 접속해도 프로필이 쌓이지 않음
- [ ] 같은 host:port에 **직접 지은 다른 이름**으로 새 프로필 저장 → 두 프로필 공존(예: 인증 정보만 다른 프로필)
```

- [ ] **Step 2: 인코딩 확인 및 커밋**

```bash
file -I docs/MANUAL_TESTING.md   # charset=utf-8 확인
git add docs/MANUAL_TESTING.md
git commit -m "docs: manual test scenarios for profile save/rename"
```

---

### Task 5: 최종 검증

- [ ] **Step 1: 전체 테스트**

Run: `make test`
Expected: 전부 PASS

- [ ] **Step 2: 실제 앱 스모크 (가능한 환경이면)**

```bash
make run     # mosquitto + 앱 + 피드
```

Task 4에서 추가한 체크리스트 4항목을 GUI로 확인. 완료 후 `make down`.

- [ ] **Step 3: 브랜치 정리 판단**

superpowers:finishing-a-development-branch 스킬로 PR 생성 여부 결정.
