#!/usr/bin/env bash
# validate-commit.sh — Validate git commit messages against Conventional Commits spec
set -euo pipefail

# Allowed commit types
TYPES="feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert"

usage() {
  cat << 'EOF'
Usage: validate-commit.sh <message|--last|->

Validate a git commit message against Conventional Commits format.

Arguments:
  <message>   Commit message string to validate
  --last      Validate the last git commit message
  -           Read message from stdin

Examples:
  validate-commit.sh "feat: add feature"
  validate-commit.sh --last
  echo "fix: resolve bug" | validate-commit.sh -
EOF
  exit "${1:-0}"
}

[[ "${1:-}" == "-h" || "${1:-}" == "--help" ]] && usage 0

# Get commit message
get_message() {
  case "${1:-}" in
    --last)
      git log -1 --pretty=%B 2>/dev/null || { echo "Error: Not a git repository or no commits" >&2; exit 1; }
      ;;
    -)
      cat
      ;;
    "")
      echo "Error: No message provided" >&2; usage 1
      ;;
    *)
      echo "$1"
      ;;
  esac
}

# Validate conventional commit format
validate() {
  local message="$1"
  local first_line

  # Get first line (subject)
  first_line=$(echo "$message" | head -n1)

  # Check empty
  if [[ -z "$first_line" ]]; then
    echo "✗ Empty commit message"
    return 1
  fi

  # Check subject line length
  if [[ ${#first_line} -gt 50 ]]; then
    echo "✗ Subject line exceeds 50 characters (${#first_line})"
    echo "  Got: $first_line"
    return 1
  fi

  # Check body line lengths
  local line_num=2
  while IFS= read -r line; do
    if [[ ${#line} -gt 72 ]]; then
      echo "✗ Line $line_num exceeds 72 characters (${#line})"
      echo "  Got: $line"
      return 1
    fi
    line_num=$((line_num + 1))
  done < <(echo "$message" | tail -n +2)

  # Pattern: type[(scope)][!]: description
  # - type: lowercase letters only
  # - scope: optional, alphanumeric + hyphens + underscores
  # - !: optional breaking change indicator
  # - colon + space required
  # - description: lowercase first letter, no trailing period
  if [[ "$first_line" =~ ^($TYPES)(\([a-z0-9_-]+\))?\!?:\ .+$ ]]; then
    local description="${first_line#*: }"

    # Check description doesn't end with period
    if [[ "$description" =~ \.$ ]]; then
      echo "✗ Description should not end with a period"
      echo "  Got: $first_line"
      return 1
    fi

    echo "✓ Valid conventional commit: $first_line"
    return 0
  else
    echo "✗ Invalid conventional commit format"
    echo "  Got: $first_line"
    echo ""
    echo "  Expected: <type>: <description>"
    echo "  Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert"
    echo "  Example: feat: add user authentication"
    echo "  With scope: feat(auth): implement OAuth2"
    echo "  Breaking: feat!: redesign config"
    return 1
  fi
}

# Main
message=$(get_message "${1:-}")
validate "$message"
