#!/usr/bin/env bash
# Release-checklist evidence, run once on the operator's workstation.
# Confirms `node --version` reports v20 or newer and records the kernel
# version of the machine it ran on. The lib refuses to run inside the
# smolvm sandbox, so a fresh record under
# .host-tests/release-workstation-check/ can only come from the host.
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
lib="$here/../agent/skills/host-tests/scripts/host-test-lib.sh"
if [ ! -f "$lib" ]; then
  echo "host-test: lib not found at $lib" >&2
  exit 2
fi
source "$lib"

test_body() {
  local out major

  echo "record-dir: $HOST_TEST_ROOT/.host-tests/release-workstation-check"
  echo "kernel-version: $(uname -srm)"

  if ! out="$(node --version 2>&1)"; then
    echo "node --version failed: $out" >&2
    return 1
  fi
  echo "node-version: $out"

  if [[ "$out" =~ ^v([0-9]+)(\.|$) ]]; then
    major="${BASH_REMATCH[1]}"
  else
    echo "node --version reported no vX.Y.Z version: '$out'" >&2
    return 1
  fi

  if [ "$major" -lt 20 ]; then
    echo "node $out is older than the required v20" >&2
    return 1
  fi
  echo "node $out meets the v20-or-newer requirement"
}

host_test_main "release-workstation-check" test_body
