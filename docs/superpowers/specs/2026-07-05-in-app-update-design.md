# 인앱 업데이트 — 새 버전 감지 + macOS 자기교체 스펙

> 작성일: 2026-07-05 · 상태: 승인 대기(스펙 리뷰) · 브랜치: `feature/in-app-update`
> 전제: GitHub Releases 기반 배포([release.yml](../../../.github/workflows/release.yml)), macOS 미서명(서명 활성화 시에도 본 설계 유효 — §7 참고)

## 1. 배경과 목표

현재 사용자는 새 릴리스를 직접 확인하고 zip을 받아 수동 교체해야 한다. 앱이 시작 시 새 버전을 감지해 배지로 알리고, 버튼 한 번으로 다운로드 → 자기교체 → 재시작까지 수행한다.

## 2. 결정 사항

| 항목 | 결정 |
|---|---|
| 업데이트 수준 | **반자동** — 감지·다운로드는 앱이, 적용은 사용자가 버튼으로 트리거. 완전 자동(백그라운드 설치) 없음 |
| 플랫폼 | **macOS만 자기교체**. Windows·예외 상황은 감지+알림 후 릴리스 페이지 열기 폴백 |
| 감지 시점 | **앱 시작 시 1회** (백그라운드). 주기 체크·수동 체크 버튼 없음(YAGNI) |
| 감지 방법 | GitHub API `GET /repos/kenshin579/mqtt-insight/releases/latest` 무인증 호출, `tag_name` semver 비교 |
| 알림 UI | **조용한 배지** — ⚙ 아이콘에 점 배지 + 설정 모달 푸터에 업데이트 버튼. 배너·모달 없음 |
| 교체 방식 | **.app 번들 통째 교체** (자체 구현, 외부 의존성 0). 바이너리 단독 교체(minio/selfupdate)·헬퍼 프로세스 방식 기각 |
| 릴리스 파이프라인 | **변경 없음** — 기존 `*-macos-universal.zip` 자산 그대로 사용 |
| 설정 | **"시작 시 업데이트 확인" 토글** 추가, 기본 켜짐 |

## 3. 동작 상세

### 감지 (시작 시 1회)

- 프론트 ready 후 백그라운드 goroutine에서 GitHub API 호출 (타임아웃 10초).
- 현재 버전이 `dev`(로컬 빌드)이거나 설정 토글이 꺼져 있으면 체크 스킵.
- `tag_name` > 현재 버전이면 Wails 이벤트 `update:available` emit:
  ```json
  { "version": "v0.3.0", "releaseURL": "https://github.com/.../releases/tag/v0.3.0", "assetURL": "https://.../mqtt-insight-v0.3.0-macos-universal.zip", "canSelfUpdate": true }
  ```
  `assetURL`은 실행 플랫폼용 자산(macOS: `*-macos-universal.zip`). 자산이 없으면 `assetURL`은 빈 문자열 → 프론트는 폴백 모드.
- 체크 실패(네트워크·rate limit·파싱)는 조용히 무시, 로그만 남김.

### 알림 UI

- ⚙ 아이콘 오른쪽 위에 점 배지(8px, `--err` 계열 색).
- 설정 모달 푸터: 기존 버전 표기를 `v0.2.0 → v0.3.0 사용 가능` + **[업데이트 후 재시작]** 버튼으로 확장.
- 진행 중에는 버튼이 진행률 표시(`다운로드 중… 42%`)로 전환, 완료 시 자동 재시작이라 별도 완료 상태 없음.

### 적용 (macOS 자기교체)

버튼 클릭 → `ApplyUpdate()` 바인딩:

1. **다운로드** — zip을 `os.TempDir()` 하위 고유 폴더에 저장. 진행률을 `update:progress` 이벤트(0–100)로 emit.
2. **추출** — Go `archive/zip`으로 추출. symlink 엔트리는 symlink로 복원, 실행 퍼미션 보존. Go로 받고 풀면 `com.apple.quarantine` 속성이 붙지 않아 미서명이어도 Gatekeeper가 발동하지 않는다.
3. **교체** — `os.Executable()`에서 `.app` 루트 역산(`Contents/MacOS/` 상위). 기존 `.app` → `<이름>.app.bak` rename → 새 `.app`을 제자리로 move(임시 폴더가 다른 볼륨일 수 있으므로 rename 실패 시 복사 폴백). macOS는 실행 중 앱 디렉터리를 rename해도 프로세스가 유지된다(inode 기반).
4. **재시작** — `open -n <교체된 .app>` 실행 후 `runtime.Quit()`.
5. **정리** — 새 인스턴스가 시작 시 자기 옆의 `.app.bak`을 발견하면 삭제(교체 성공이 확인된 시점의 정리).

### 폴백 (릴리스 페이지 열기)

다음 경우 버튼 라벨이 "릴리스 페이지 열기"로 바뀌고 `BrowserOpenURL(releaseURL)`만 수행:

- **Windows** (자기교체는 후속 버전에서)
- **App Translocation** — `os.Executable()` 경로에 `/AppTranslocation/` 포함 시. 미서명 앱을 quarantine 해제 없이 실행하면 읽기 전용 임시 경로에서 실행되므로 자기교체 불가
- `.app` 번들 밖 실행(`wails dev` 등) — 단, 이 경우는 대부분 `dev` 버전이라 체크 자체가 스킵됨
- 플랫폼 자산을 릴리스에서 못 찾은 경우(`assetURL` 빈 문자열)

폴백 여부는 Go가 판단해 `update:available` 페이로드에 `canSelfUpdate: bool`로 내려준다.

### 에러 처리

- 다운로드·추출 실패: 임시 폴더 정리 후 `update:error` 이벤트 → 푸터에 에러 메시지 + 릴리스 페이지 링크.
- 교체 중 실패: `.bak`을 원위치로 rollback 후 동일 에러 처리. rollback까지 실패하면(디스크 오류 수준) 에러 메시지에 수동 복구 안내(릴리스 페이지 링크) 표시.
- `ApplyUpdate` 중복 호출 방지: 진행 중 플래그로 무시.

## 4. 아키텍처

**신규 — Go `internal/update/`**

- `check.go` — `Check(current string) (*Info, error)`: GitHub API 호출, semver 비교, 플랫폼 자산 선택. `Info{Version, ReleaseURL, AssetURL, CanSelfUpdate}`
- `semver.go` — `v` prefix 허용 태그 비교(외부 의존성 없이 단순 구현)
- `apply.go` — `Apply(ctx, assetURL, progress func(int)) error`: 다운로드 → 추출 → 교체 오케스트레이션. 플랫폼 판단·번들 경로 역산 포함
- `apply_darwin.go` — `.app` swap/rollback, `open -n` 재실행
- `cleanup.go` — 시작 시 `.bak` 정리

**수정**

- `app.go` — startup에서 goroutine으로 Check 후 `update:available` emit; `ApplyUpdate()` 바인딩 추가; startup 시 `update.Cleanup()` 호출
- `internal/config/` — 설정에 `checkUpdates bool` 필드(기본 true, 기존 설정 파일에 필드 없으면 true로 마이그레이션)
- `frontend/src/bridge/events.ts` — `update:available` / `update:progress` / `update:error` 수신
- `frontend/src/store/appStore.ts` — `updateInfo`, `updateProgress`, `updateError` 상태
- ⚙ 버튼 컴포넌트 — `updateInfo` 있으면 점 배지
- 설정 모달 — 푸터 업데이트 버튼(자기교체/폴백/진행률/에러 상태) + "시작 시 업데이트 확인" 토글

## 5. 테스트

- `internal/update/` 단위 테스트: semver 비교 케이스, `httptest` 기반 API 응답 파싱·자산 선택, 임시 디렉터리에 가짜 `.app` 구조를 만들어 swap·rollback·`.bak` 정리 검증 (실제 프로세스 재시작 제외)
- 프론트: 스토어 상태 전이는 기존 vitest 패턴으로 (배지·버튼 상태)
- 수동: `docs/MANUAL_TESTING.md`에 체크리스트 추가 — 구버전을 `-ldflags "-X main.version=v0.0.1"`로 로컬 빌드해 실제 최신 릴리스로 업데이트되는지, translocation 상태(quarantine 유지) 폴백, Windows 폴백

## 6. 비범위 (후속 후보)

- Windows 자기교체(portable exe 교체·installer silent 실행)
- 주기적 체크·수동 체크 버튼
- 릴리스 노트 인앱 표시
- delta 업데이트

## 7. 서명 활성화 시 영향

Apple Developer 서명·노타라이즈가 켜져도(백로그 항목) 본 설계는 그대로 동작한다 — Go 다운로드는 quarantine을 붙이지 않으므로 서명 유무와 무관하게 교체·실행 가능하고, 서명된 번들 통째 교체는 서명 무결성도 유지한다. 오히려 translocation 폴백 케이스가 줄어든다.
