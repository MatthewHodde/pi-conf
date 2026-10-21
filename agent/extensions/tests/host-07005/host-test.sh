#!/usr/bin/env bash
set -uo pipefail
source /home/matthew/.pi/agent/skills/host-tests/scripts/host-test-lib.sh

test_body() {
  local here out rc work passes t
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

  out="$(bash "$here/run.sh" 2>&1)"
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
  if [ -z "$work" ]; then
    echo "run.sh reported no artifacts dir" >&2
    return 1
  fi

  for t in t1 t2; do
    if [ ! -x "$work/$t/.git/hooks/pre-commit" ]; then
      echo "pre-commit hook missing or not executable in trial $t" >&2
      return 1
    fi
  done
}

host_test_main "pi-07006-no-bypass" test_body
