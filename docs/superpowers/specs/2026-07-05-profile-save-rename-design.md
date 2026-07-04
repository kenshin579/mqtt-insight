# 프로필 저장 개선: rename + 저장 후 연결 (2026-07-05)

## 배경 / 문제

연결 모달에서 저장된 프로필을 불러와 이름을 바꾸고 Connect하면 변경이 조용히 무시된다.

원인 (`app.go SaveProfile`):

1. upsert가 **이름으로만** 매칭하므로 이름이 바뀌면 "기존 프로필 수정"임을 알 수 없다.
2. 새 프로필로 추가하려는 경로는 `HasHostPort` 가드(같은 host:port 프로필 존재 시 추가 스킵)에 걸려 아무것도 저장되지 않는다. 에러도 없다.

부수 문제 두 가지도 함께 발견됨:

- 저장이 `Connect` **성공 후**에만 실행되어, 연결에 실패하면 편집 내용이 통째로 날아간다.
- 자동 이름이 host만 사용해서(`C11`), 같은 host의 다른 port에 Quick connect하면 이름이 충돌해 기존 프로필을 덮어쓴다.

## 결정 사항

브레인스토밍에서 확정한 규칙:

1. **저장 후 연결**: Connect 버튼은 프로필을 먼저 저장하고 나서 연결한다. 연결 실패해도 편집 내용은 보존된다. 별도 저장 버튼은 두지 않는다.
2. **rename 지원**: 편집 시작 시점의 원본 이름을 프론트가 기억했다가 저장 시 백엔드에 전달한다. 이름이 바뀌면 기존 프로필이 rename된다 (새 프로필 생성 아님).
3. **자동 이름 = `host:port`**: 이름을 비워두면 `localhost:1883` 형태로 명명한다. 고유하면서 어느 브로커인지 읽힌다. (untitled-N 방식은 구별 정보가 없어 기각)
4. **중복 방지 가드 축소**: host:port 중복 시 저장을 무시하는 동작은 **자동 명명된 Quick connect에만** 적용한다. 사용자가 직접 이름 지은 새 프로필은 host:port가 겹쳐도 저장된다 (같은 브로커 + 다른 인증 프로필 허용).

기존 스펙 인벤토리(`2026-07-03-redesign-inventory.md`)의 C11("이름 비면 host로 기본값")과 C12("성공 시 프로필 자동 저장(host+port 중복 제외)")는 이 문서의 규칙으로 대체된다.

## 프론트엔드 (`frontend/src/components/ConnectionForm.tsx`)

- 새 상태 `originName: string` 추가.
  - `pickChip(sp)` → `sp.name`, `editProfile` 진입 → `editProfile.name`, `newChip()` → `""`.
  - 필드 수정으로 칩의 시각적 선택(`selectedChip`)이 풀려도(B47) `originName`은 유지한다. "무엇을 편집 중인가"는 시각 상태와 별개.
- 자동 이름: `p.name.trim()`이 비어 있으면 `${p.host}:${p.port}` 템플릿으로 채운다.
- `connect()` 순서 변경:
  1. `SaveProfile(finalP, originName)` — 실패 시 오류 배너 표시 후 중단(연결 시도 안 함).
  2. 저장 성공 시 `reloadProfiles()` + `originName = finalP.name` 갱신 (연결 실패 후 재시도가 stale prevName을 넘기지 않도록).
  3. `Connect(finalP)` — 실패 시 기존 오류 배너, 모달 유지. 저장은 이미 반영된 상태.

## 백엔드 (`internal/config` + `app.go`)

upsert 로직을 `config` 패키지로 이동해 Wails 없이 테스트 가능하게 한다.

```go
// internal/config
func (c *Config) UpsertProfile(p Profile, prevName string)
```

로직:

1. `prevName != ""`이고 그 이름의 프로필이 존재 → 그 자리를 `p`로 교체 (rename 포함). `p.Name`이 **다른** 기존 프로필과 겹치면 그 프로필은 제거한다 ("그 이름으로 저장"의 의미상 덮어쓰기).
2. `prevName`이 비었거나 못 찾음 → 이름 기준 upsert. 해당 이름의 프로필이 없어 새로 append하는 경우, `p.Name`이 자동 명명 형식(`fmt.Sprintf("%s:%d", p.Host, p.Port)`)과 일치하고 이미 같은 host:port 프로필이 있으면 append를 건너뛴다.
   - "못 찾음 → upsert 폴백" 덕분에 저장 성공 → 연결 실패 → 재시도 시에도 멱등하다.

`app.go`:

```go
func (a *App) SaveProfile(p config.Profile, prevName string) error {
    a.cfg.UpsertProfile(p, prevName)
    return config.Save(a.cfgPath, a.cfg)
}
```

`HasHostPort`는 기존 테스트가 있으므로 공개 메서드로 유지하고 `UpsertProfile` 내부에서 재사용한다.

Wails 바인딩 시그니처 변경 → `frontend/wailsjs/`는 `wails dev`/`wails build`가 재생성 (직접 수정 금지).

## 오류 처리

- 저장 실패(디스크 쓰기 등): 기존 오류 배너 재사용, 연결 중단.
- rename 대상(prevName) 프로필이 이미 삭제된 경우: 에러 없이 일반 upsert로 처리.

## 테스트

Go — `internal/config/config_test.go`에 `UpsertProfile` 테스트 추가:

| 케이스 | 기대 |
|---|---|
| prevName 존재 + 이름 유지 | 해당 프로필 내용 교체 |
| prevName 존재 + 이름 변경 | rename됨, 프로필 수 불변 |
| rename한 새 이름이 다른 프로필과 충돌 | 충돌 프로필 제거, rename 반영 |
| prevName 미존재 | 이름 기준 upsert로 폴백 |
| 새 프로필, 직접 지은 이름, host:port 중복 | 정상 추가 |
| 새 프로필, 자동 이름(`host:port`), host:port 중복 | 추가 스킵 |
| 자동 이름끼리 같은 host 다른 port | 각각 별도 프로필 (이름 충돌 없음) |

수동 — `docs/MANUAL_TESTING.md`에 추가:

- 프로필 rename 후 Connect → 칩 목록에 새 이름 하나만 존재.
- 잘못된 host로 수정 후 Connect 실패 → 재시도 없이 모달 닫고 다시 열어도 편집 내용 유지.
- Quick connect 반복 → 프로필이 쌓이지 않음.
