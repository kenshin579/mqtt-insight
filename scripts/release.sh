#!/usr/bin/env bash
# release.sh — GitHub Release 발행: 검증 → 태그 push → 워크플로 감시 → 결과 출력
#
#   scripts/release.sh v0.2.0            새 버전 릴리스
#   scripts/release.sh v0.1.0 --force    기존 릴리스·태그 삭제 후 재발행
#
# 사전 조건: main 브랜치 · 클린 트리 · origin/main 동기화 · gh 인증
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VERSION="${1:-}"
FORCE="${2:-}"

die() { echo "error: $*" >&2; exit 1; }

# --- 입력 검증 ---
[[ -n "$VERSION" ]] || die "사용법: scripts/release.sh vX.Y.Z [--force]"
[[ "$VERSION" == v* ]] || VERSION="v$VERSION"
[[ "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "버전 형식이 vX.Y.Z가 아닙니다: $VERSION"
[[ -z "$FORCE" || "$FORCE" == "--force" ]] || die "알 수 없는 옵션: $FORCE"

# --- 환경 검증 ---
command -v gh >/dev/null || die "gh CLI가 필요합니다"
# 다른 호스트(GHE) 인증 실패에 영향받지 않도록 github.com 한정으로 확인
gh auth status -h github.com >/dev/null 2>&1 || die "github.com 인증이 필요합니다 (gh auth login)"

branch=$(git branch --show-current)
[[ "$branch" == "main" ]] || die "main 브랜치에서 실행하세요 (현재: $branch)"
[[ -z "$(git status --porcelain)" ]] || die "working tree가 클린하지 않습니다"
git fetch origin main --quiet
[[ "$(git rev-parse HEAD)" == "$(git rev-parse origin/main)" ]] || die "origin/main과 동기화되지 않았습니다 (git pull)"

# --- 태그 중복 처리 ---
if git rev-parse -q --verify "refs/tags/$VERSION" >/dev/null || git ls-remote --tags origin "refs/tags/$VERSION" | grep -q .; then
  if [[ "$FORCE" == "--force" ]]; then
    echo "기존 릴리스·태그 삭제: $VERSION"
    gh release delete "$VERSION" --yes 2>/dev/null || true
    git push --delete origin "$VERSION" 2>/dev/null || true
    git tag -d "$VERSION" 2>/dev/null || true
  else
    die "태그 $VERSION 이(가) 이미 존재합니다 (재발행하려면 --force)"
  fi
fi

# --- 확인 ---
echo "릴리스 대상: $VERSION  (HEAD $(git rev-parse --short HEAD) — $(git log -1 --format=%s))"
read -r -p "진행할까요? [y/N] " ans
[[ "$ans" == "y" || "$ans" == "Y" ]] || die "중단됨"

# --- 태그 발행 → 워크플로 감시 ---
git tag "$VERSION"
git push origin "$VERSION"
echo "태그 push 완료 — Release 워크플로 시작 대기…"
sleep 10

RUN_ID=$(gh run list --workflow=release.yml --limit 1 --json databaseId -q '.[0].databaseId')
[[ -n "$RUN_ID" ]] || die "워크플로 실행을 찾지 못했습니다 — GitHub Actions 페이지를 확인하세요"
echo "워크플로 감시 중 (run $RUN_ID) — macOS/Windows 빌드 약 5~10분…"

if gh run watch "$RUN_ID" --exit-status; then
  echo ""
  echo "✅ 릴리스 완료: $(gh release view "$VERSION" --json url -q '.url')"
  echo "산출물:"
  gh release view "$VERSION" --json assets -q '.assets[] | "  - \(.name)"'
else
  echo ""
  echo "❌ 워크플로 실패 — 실패 로그 (마지막 20줄):"
  gh run view "$RUN_ID" --log-failed | tail -20
  echo ""
  echo "수정 머지 후 재발행: scripts/release.sh $VERSION --force"
  exit 1
fi
