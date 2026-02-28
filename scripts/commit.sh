#!/usr/bin/env bash
# =============================================================================
# commit.sh — Verify changes, commit to feature branch, and merge into main.
#
# Usage:
#   ./scripts/commit.sh [OPTIONS] "commit message"
#
# Options:
#   -b, --branch BRANCH   Feature branch name (default: current branch)
#   -m, --main   BRANCH   Main branch name (default: main)
#   --no-verify           Skip verification steps
#   --no-merge            Commit to feature branch only, skip merge to main
#   -h, --help            Show this help
#
# Examples:
#   ./scripts/commit.sh "feat: add user auth"
#   ./scripts/commit.sh -b my-feature "fix: resolve null pointer"
#   ./scripts/commit.sh --no-merge "wip: draft implementation"
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

# ── load .env (optional) ─────────────────────────────────────────────────────
# Only processes lines that match exactly: UPPER_VAR=value
# Ignores comments, blank lines, and lines with special characters in the key.
if [[ -f .env ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    # must match IDENTIFIER=... (alphanumeric + underscore key, no spaces)
    [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue
    key="${BASH_REMATCH[1]}"
    value="${BASH_REMATCH[2]}"
    value="${value%%#*}"                          # strip inline comments
    value="${value//$'\r'/}"                      # strip Windows CR
    value="${value#"${value%%[! ]*}"}"            # ltrim
    value="${value%"${value##*[! ]}"}"            # rtrim
    # env vars already in environment take precedence over .env
    [[ -z "${!key+x}" ]] && declare "$key=$value"
  done < .env
fi

# ── repo guard ───────────────────────────────────────────────────────────────
# REPO_NAME can be set in .env; falls back to the actual directory name.
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) \
  || { echo -e "\033[0;31m[ERR]\033[0m  Not inside a git repository." >&2; exit 1; }
ACTUAL_REPO=$(basename "$REPO_ROOT")
EXPECTED_REPO="${REPO_NAME:-$ACTUAL_REPO}"   # if unset, skip guard (permissive)
if [[ -n "${REPO_NAME:-}" && "$ACTUAL_REPO" != "$EXPECTED_REPO" ]]; then
  echo -e "\033[0;31m[ERR]\033[0m  Wrong repository: '$ACTUAL_REPO'." >&2
  echo -e "\033[0;31m[ERR]\033[0m  Expected '$EXPECTED_REPO' (set in .env)." >&2
  exit 1
fi

# ── colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO]${RESET} $*"; }
success() { echo -e "${GREEN}[OK]${RESET}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET} $*"; }
error()   { echo -e "${RED}[ERR]${RESET}  $*" >&2; }
header()  { echo -e "\n${BOLD}${CYAN}══ $* ══${RESET}"; }
fail()    { error "$*"; exit 1; }

# ── defaults (env vars from .env override built-in defaults) ─────────────────
FEATURE_BRANCH=""
MAIN_BRANCH="${MAIN_BRANCH:-main}"   # .env MAIN_BRANCH > built-in default
SKIP_VERIFY=false
SKIP_MERGE=false
COMMIT_MSG=""

# ── arg parsing ──────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    -b|--branch)   FEATURE_BRANCH="$2"; shift 2 ;;
    -m|--main)     MAIN_BRANCH="$2";    shift 2 ;;
    --no-verify)   SKIP_VERIFY=true;    shift   ;;
    --no-merge)    SKIP_MERGE=true;     shift   ;;
    -h|--help)
      sed -n '3,20p' "$0"; exit 0 ;;
    -*)
      fail "Unknown option: $1" ;;
    *)
      COMMIT_MSG="$1"; shift ;;
  esac
done

[[ -z "$COMMIT_MSG" ]] && fail "Commit message required. Usage: $0 \"your message\""

# ── resolve branch ───────────────────────────────────────────────────────────
CURRENT_BRANCH=$(git branch --show-current)
[[ -z "$FEATURE_BRANCH" ]] && FEATURE_BRANCH="$CURRENT_BRANCH"

# ── guard: nothing staged or unstaged? ───────────────────────────────────────
if [[ -z "$(git status --porcelain)" ]]; then
  warn "Working tree is clean — nothing to commit."
  exit 0
fi

# =============================================================================
# STEP 1 — VERIFICATION
# =============================================================================
if [[ "$SKIP_VERIFY" == false ]]; then
  header "Verification"

  # -- sensitive file check ---------------------------------------------------
  info "Checking for sensitive files..."
  SENSITIVE_PATTERNS=(".env" "*.pem" "*.key" "*.p12" "id_rsa" "credentials.json")
  STAGED_FILES=$(git diff --cached --name-only 2>/dev/null || true)
  UNSTAGED_FILES=$(git diff --name-only 2>/dev/null || true)
  ALL_CHANGED="$STAGED_FILES
$UNSTAGED_FILES"
  BLOCKED=false
  for pat in "${SENSITIVE_PATTERNS[@]}"; do
    while IFS= read -r f; do
      [[ -z "$f" ]] && continue
      if [[ "$f" == $pat ]]; then
        error "Sensitive file detected: $f"
        BLOCKED=true
      fi
    done <<< "$ALL_CHANGED"
  done
  [[ "$BLOCKED" == true ]] && fail "Blocked — sensitive files in changeset. Add them to .gitignore first."
  success "No sensitive files found."

  # -- Python syntax / tests --------------------------------------------------
  if [[ -f backend/pyproject.toml ]]; then
    info "Checking Python syntax (py_compile)..."
    PYFILES=$(git diff --name-only HEAD -- '*.py' 2>/dev/null || true)
    PYFILES+=$'\n'$(git diff --cached --name-only -- '*.py' 2>/dev/null || true)
    SYNTAX_ERRORS=0
    while IFS= read -r f; do
      [[ -z "$f" || ! -f "$f" ]] && continue
      python3 -m py_compile "$f" 2>/dev/null || { error "Syntax error in $f"; SYNTAX_ERRORS=$((SYNTAX_ERRORS+1)); }
    done <<< "$PYFILES"
    [[ $SYNTAX_ERRORS -gt 0 ]] && fail "$SYNTAX_ERRORS Python syntax error(s) found."
    success "Python syntax OK."

    if command -v pytest &>/dev/null; then
      info "Running Python tests..."
      if pytest backend/ -q --tb=short 2>&1 | tee /tmp/pytest_out.txt; then
        success "Python tests passed."
      else
        error "Python tests FAILED:"
        cat /tmp/pytest_out.txt
        fail "Fix tests before committing."
      fi
    else
      warn "pytest not on PATH — skipping Python tests."
    fi
  fi

  # -- TypeScript type-check + lint + build -----------------------------------
  if [[ -f frontend/package.json ]]; then
    if [[ ! -d frontend/node_modules ]]; then
      warn "frontend/node_modules not found — skipping TS and lint checks. Run 'npm install' in frontend/ first."
    else
      info "Running frontend type-check (tsc)..."
      if (cd frontend && ./node_modules/.bin/tsc --noEmit 2>&1); then
        success "TypeScript type-check passed."
      else
        fail "TypeScript errors found — fix before committing."
      fi

      info "Running ESLint..."
      if (cd frontend && npm run lint 2>&1); then
        success "ESLint passed."
      else
        fail "ESLint errors found — fix before committing."
      fi
    fi
  fi

  success "All verification checks passed."
fi

# =============================================================================
# STEP 2 — COMMIT TO FEATURE BRANCH
# =============================================================================
header "Commit to feature branch: ${BOLD}$FEATURE_BRANCH${RESET}"

# ensure we're on the right branch
if [[ "$CURRENT_BRANCH" != "$FEATURE_BRANCH" ]]; then
  info "Switching to $FEATURE_BRANCH..."
  git checkout "$FEATURE_BRANCH"
fi

# stage everything not already staged
STAGED=$(git diff --cached --name-only)
if [[ -z "$STAGED" ]]; then
  info "Staging all changes (excluding .gitignore patterns)..."
  git add -A
else
  info "Using already-staged files."
fi

git commit -m "$COMMIT_MSG

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"

FEATURE_SHA=$(git rev-parse --short HEAD)
success "Committed $FEATURE_SHA to '$FEATURE_BRANCH'."

# =============================================================================
# STEP 3 — MERGE INTO MAIN
# =============================================================================
if [[ "$SKIP_MERGE" == false ]]; then
  header "Merge '$FEATURE_BRANCH' into '$MAIN_BRANCH'"

  # verify main exists
  if ! git show-ref --verify --quiet "refs/heads/$MAIN_BRANCH"; then
    fail "Branch '$MAIN_BRANCH' does not exist locally."
  fi

  info "Switching to $MAIN_BRANCH..."
  git checkout "$MAIN_BRANCH"

  info "Merging $FEATURE_BRANCH → $MAIN_BRANCH (fast-forward preferred)..."
  if git merge --ff-only "$FEATURE_BRANCH" 2>/dev/null; then
    success "Fast-forward merge succeeded."
  else
    warn "Fast-forward not possible — creating merge commit."
    git merge "$FEATURE_BRANCH" -m "merge($FEATURE_BRANCH): $COMMIT_MSG" --no-edit
    success "Merge commit created."
  fi

  MAIN_SHA=$(git rev-parse --short HEAD)
  success "main is now at $MAIN_SHA."

  # return to feature branch so caller isn't left on main
  if [[ "$FEATURE_BRANCH" != "$MAIN_BRANCH" ]]; then
    git checkout "$FEATURE_BRANCH"
    info "Returned to '$FEATURE_BRANCH'."
  fi
fi

# =============================================================================
# SUMMARY
# =============================================================================
header "Done"
echo -e "  Feature branch : ${BOLD}$FEATURE_BRANCH${RESET} @ $(git rev-parse --short "$FEATURE_BRANCH")"
if [[ "$SKIP_MERGE" == false ]]; then
  echo -e "  Main branch    : ${BOLD}$MAIN_BRANCH${RESET} @ $(git rev-parse --short "$MAIN_BRANCH")"
fi
echo -e "  Message        : $COMMIT_MSG"
echo ""
warn "Branches are local only. Run 'git push origin $FEATURE_BRANCH $MAIN_BRANCH' to publish."
