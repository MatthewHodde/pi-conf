#!/usr/bin/env bash
# Smallest real host test. Run it on the host; the sandbox reads the record back.
set -uo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/scripts/host-test-lib.sh"

test_body() {
  echo "lib: $HOST_TEST_ROOT/agent/skills/host-tests/scripts/host-test-lib.sh"
  if [ ! -f "$HOST_TEST_ROOT/agent/skills/host-tests/scripts/host-test-lib.sh" ]; then
    echo "lib file missing under $HOST_TEST_ROOT" >&2
    return 1
  fi
  echo "uname: $(uname -srm)"
}

host_test_main "mount-roundtrip" test_body
