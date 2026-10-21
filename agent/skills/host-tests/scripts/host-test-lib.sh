#!/usr/bin/env bash
# Sourced by host test scripts. Never execute it directly.

host_test_main() {
  local name="$1" body="$2"
  shift 2

  if ! [[ "$name" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
    echo "host-test: invalid test name '$name', want only lowercase letters, digits, and hyphens" >&2
    exit 2
  fi

  local lib_dir root
  lib_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  root="${HOST_TEST_ROOT:-$(cd "$lib_dir/../../../.." && pwd)}"

  if [ -z "${HOST_TEST_ALLOW_IN_SANDBOX:-}" ] && host_test_in_sandbox "$lib_dir"; then
    echo "host-test: this script is running inside the sandbox; host tests run on the host only" >&2
    exit 2
  fi

  local results="$root/.host-tests/$name"
  if ! mkdir -p "$results"; then
    echo "host-test: cannot create results dir $results" >&2
    exit 2
  fi
  export HOST_TEST_ROOT="$root"

  local log="$results/output.log" record="$results/result.json"
  local started finished code status hostname
  started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  set +e +o pipefail
  ( "$body" "$@" ) 2>&1 | tee "$log"
  code=${PIPESTATUS[0]}
  finished="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  if [ "$code" -eq 0 ]; then status="pass"; else status="fail"; fi
  hostname="$(hostname)"

  if ! printf '{"name":"%s","status":"%s","exitCode":%d,"startedAt":"%s","finishedAt":"%s","hostname":"%s","log":"%s"}' \
      "$name" "$status" "$code" "$started" "$finished" "$hostname" ".host-tests/$name/output.log" \
      > "$record.tmp.$$" || ! mv -f "$record.tmp.$$" "$record"; then
    rm -f "$record.tmp.$$"
    echo "host-test: cannot write result record $record" >&2
    exit 2
  fi

  exit "$code"
}

host_test_in_sandbox() {
  local mounts
  if command -v findmnt >/dev/null 2>&1; then
    mounts="$(findmnt -n -T "$1" 2>/dev/null)"
  else
    mounts="$(mount 2>/dev/null | grep -F " on $1 ")"
  fi
  printf '%s' "$mounts" | grep -qi smolvm
}
