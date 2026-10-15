#!/bin/bash
# apply-all-patches.sh
#
# Applies all .patch files in ~/.pi/agent/npm/patches/ to their target packages.
# Run this after `pi install` or `pi update` to re-apply local modifications.
#
# Patches use standard `git apply` format with paths relative to
# ~/.pi/agent/npm/ (e.g. a/node_modules/pi-ollama/src/settings.ts).
#
# Usage:
#   bash ~/.pi/agent/extensions/apply-all-patches.sh
#   bash ~/.pi/agent/extensions/apply-all-patches.sh --check   # dry-run, report status

set -uo pipefail

NPM_DIR="$HOME/.pi/agent/npm"
PATCHES_DIR="$HOME/.pi/agent/extensions/patches"
CHECK_ONLY=0

if [ "${1:-}" = "--check" ]; then
  CHECK_ONLY=1
fi

echo "=== apply-all-patches ==="
echo "Target: $NPM_DIR"
echo ""

if [ ! -d "$PATCHES_DIR" ]; then
  echo "ERROR: $PATCHES_DIR not found"
  exit 1
fi

shopt -s nullglob
PATCHES=("$PATCHES_DIR"/*.patch)
shopt -u nullglob

if [ ${#PATCHES[@]} -eq 0 ]; then
  echo "No .patch files found in $PATCHES_DIR"
  exit 0
fi

cd "$NPM_DIR"

for patch in "${PATCHES[@]}"; do
  name=$(basename "$patch")
  echo "--- $name ---"

  if [ $CHECK_ONLY -eq 1 ]; then
    if git apply --check "$patch" 2>/dev/null; then
      echo "  status: NOT applied (would apply cleanly)"
    else
      # Check if already applied by seeing if reverse applies
      if git apply --reverse --check "$patch" 2>/dev/null; then
        echo "  status: ALREADY applied"
      else
        echo "  status: CONFLICT (cannot apply)"
      fi
    fi
  else
    if git apply "$patch" 2>/dev/null; then
      echo "  applied ✓"
    elif git apply --reverse --check "$patch" 2>/dev/null; then
      echo "  already applied (skipping)"
    else
      echo "  FAILED — conflict, manual intervention needed"
    fi
  fi
done

echo ""
echo "=== Done ==="
