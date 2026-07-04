# Releasing

## 표준 절차 (스크립트)

```bash
make release VERSION=v0.2.0
```

`scripts/release.sh`가 다음을 수행한다:
1. 사전 검증 — main 브랜치·클린 트리·origin/main 동기화·gh 인증·태그 중복
2. 확인 프롬프트 → 태그 발행·push
3. Release 워크플로 실시간 감시 (macOS universal + Windows, 약 5~10분)
4. 성공 시 릴리스 URL·산출물 목록 출력 / 실패 시 실패 로그 출력

**실패 후 재발행** (워크플로 수정 머지 후):

```bash
make release VERSION=v0.2.0 FORCE=1   # 기존 릴리스·태그 삭제 후 재발행
```

## 릴리스 전 체크

- main CI 그린
- `docs/MANUAL_TESTING.md` 스모크 (make run으로 환경 기동)

## 릴리스 후 검증

- 릴리스 페이지: macOS zip / Windows installer·portable 3개 첨부 + 자동 노트
- 설치 스모크: macOS zip 받아 실행(우클릭-열기 또는 `xattr -cr`), 설정 모달 푸터 버전 = 태그 확인

## 수동 절차 (참고 — 스크립트가 하는 일)

```bash
git tag vX.Y.Z && git push origin vX.Y.Z          # 발행
gh release delete vX.Y.Z --yes \
  && git push --delete origin vX.Y.Z \
  && git tag -d vX.Y.Z                             # 재발행 전 정리
```
