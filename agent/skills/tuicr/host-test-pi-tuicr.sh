#!/usr/bin/env bash
set -uo pipefail
source /home/matthew/.pi/agent/skills/host-tests/scripts/host-test-lib.sh

test_body() {
  local tuicr_v pi_out

  command -v tuicr >/dev/null 2>&1 || { echo "tuicr not on PATH" >&2; return 1; }
  command -v git   >/dev/null 2>&1 || { echo "git not on PATH" >&2; return 1; }
  command -v cargo >/dev/null 2>&1 || { echo "cargo not on PATH (needed for the terminal-bridge build)" >&2; return 1; }

  tuicr_v="$(tuicr --version 2>/dev/null | head -1)"
  [ -n "$tuicr_v" ] || { echo "tuicr --version printed nothing" >&2; return 1; }
  echo "tuicr: $tuicr_v"

  pi_out="$(pi list 2>&1)" || { echo "pi list failed" >&2; return 1; }
  if ! grep -q "npm:@luan.sh/pi-tuicr" <<<"$pi_out"; then
    echo "pi list does not show npm:@luan.sh/pi-tuicr" >&2
    return 1
  fi

  local pkg="/home/matthew/.pi/agent/npm/node_modules/@luan.sh/pi-tuicr/package.json"
  [ -f "$pkg" ] || { echo "missing $pkg" >&2; return 1; }
  local ver
  ver="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$pkg" | head -1)"
  [ "$ver" = "0.3.4" ] || { echo "expected package version 0.3.4, got '$ver'" >&2; return 1; }
  echo "package version: $ver"

  echo "preconditions OK. Interactive check: open pi TUI in a git repo,"
  echo "run the 'Review changes with tuicr' action, pick a target,"
  echo "add a comment in tuicr, submit, and confirm the prompt attachment."
}

host_test_main "pi-tuicr-integration" test_body
