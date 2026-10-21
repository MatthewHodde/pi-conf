#!/usr/bin/env bash
set -uo pipefail
# shellcheck disable=SC1091
source /home/matthew/.pi/agent/skills/host-tests/scripts/host-test-lib.sh

test_body() {
  local here out rc work passes
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

  set -o pipefail
  out="$(bash "$here/run.sh" 2>&1 | tee >(cat >&2))"
  rc=$?
  echo "$out"
  if [ "$rc" -ne 0 ]; then
    echo "run.sh exited $rc" >&2
    return 1
  fi

  passes="$(printf '%s\n' "$out" | grep -c 'RESULT PASS')"
  if [ "$passes" != "2" ]; then
    echo "expected 2 RESULT PASS lines, got $passes" >&2
    return 1
  fi

  work="$(printf '%s\n' "$out" | sed -n 's/^artifacts: //p' | tail -1)"
  if [ -z "$work" ] || [ ! -d "$work" ]; then
    echo "run.sh reported no artifacts dir" >&2
    return 1
  fi
}

host_test_main "pi-07004-agents-imperatives" test_body
