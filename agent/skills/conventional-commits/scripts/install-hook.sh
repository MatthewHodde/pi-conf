#!/usr/bin/env bash
# install-hook.sh — Install conventional commits git hook
set -euo pipefail

HOOK_DIR="${1:-.git/hooks}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

mkdir -p "$HOOK_DIR"

cat > "$HOOK_DIR/commit-msg" << 'EOF'
#!/usr/bin/env bash
# Conventional Commits hook — validates commit message format

# Skip if commit is amend or merge
if [[ "$*" == *"--amend"* ]] || [[ "$*" == *"--no-edit"* ]]; then
  exit 0
fi

COMMIT_MSG_FILE="$1"
MESSAGE=$(cat "$COMMIT_MSG_FILE")
FIRST_LINE=$(head -n1 "$COMMIT_MSG_FILE")

# Types: feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert
TYPES="feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert"

# Check subject line length
if [[ ${#FIRST_LINE} -gt 50 ]]; then
  echo ""
  echo "✗ Subject line exceeds 50 characters (${#FIRST_LINE})"
  echo "  Got: $FIRST_LINE"
  echo ""
  echo "  Run 'git commit --amend' to fix this commit message."
  echo ""
  exit 1
fi

# Check body line lengths
LINE_NUM=2
while IFS= read -r line; do
  if [[ ${#line} -gt 72 ]]; then
    echo ""
    echo "✗ Line $LINE_NUM exceeds 72 characters (${#line})"
    echo "  Got: $line"
    echo ""
    echo "  Run 'git commit --amend' to fix this commit message."
    echo ""
    exit 1
  fi
  LINE_NUM=$((LINE_NUM + 1))
done < <(echo "$MESSAGE" | tail -n +2)

# Check format
if [[ ! "$FIRST_LINE" =~ ^($TYPES)(\([a-z0-9_-]+\))?\!?:\ .+$ ]]; then
  echo ""
  echo "✗ Invalid commit message format"
  echo ""
  echo "  Got: $FIRST_LINE"
  echo ""
  echo "  Expected: <type>: <description>"
  echo "  Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert"
  echo "  Example: feat: add user authentication"
  echo ""
  echo "  Run 'git commit --amend' to fix this commit message."
  echo ""
  exit 1
fi
EOF

chmod +x "$HOOK_DIR/commit-msg"
echo "✓ Installed conventional commits hook to $HOOK_DIR/commit-msg"
