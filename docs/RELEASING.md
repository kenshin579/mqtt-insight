# Releasing

1. main이 릴리스할 상태인지 확인 (CI 그린, MANUAL_TESTING 스모크).
2. 버전 결정 (semver). 태그 발행:
   git tag vX.Y.Z && git push origin vX.Y.Z
3. GitHub Actions → Release 워크플로 성공 확인 (~10분).
4. 릴리스 페이지 검증: macOS zip / Windows installer·portable 3개 첨부, 자동 노트 확인.
5. 설치 스모크: macOS zip 받아 실행(우클릭-열기), 설정 모달 푸터 버전 = 태그 확인.
6. 실패 시: 워크플로 수정 → 릴리스·태그 삭제 후 재발행
   gh release delete vX.Y.Z --yes && git push --delete origin vX.Y.Z && git tag -d vX.Y.Z
   → 수정 머지 후 2번부터 다시.
