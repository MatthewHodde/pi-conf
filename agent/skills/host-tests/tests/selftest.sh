#!/usr/bin/env bash
# Exercises host-test-lib.sh in a temp root. Runs in the sandbox and on the host.
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
lib="$here/../scripts/host-test-lib.sh"
tmp="$(mktemp -d /tmp/host-selftest.XXXXXX)"
trap 'chmod -R u+w "$tmp" 2>/dev/null; rm -rf "$tmp"' EXIT

checks=0
fail=0

expect_exit() {
  checks=$((checks + 1))
  if [ "$2" -ne "$3" ]; then
    echo "FAIL $1: expected exit $2, got $3" >&2
    fail=1
  fi
}

expect_grep() {
  checks=$((checks + 1))
  if ! grep -qF -- "$3" "$2"; then
    echo "FAIL $1: expected $3 in $2" >&2
    echo "  content: $(cat "$2" 2>&1)" >&2
    fail=1
  fi
}

write_script() {
  {
    echo '#!/usr/bin/env bash'
    echo 'set -uo pipefail'
    echo "source \"$lib\""
    echo "$2"
    echo "host_test_main \"$1\" test_body"
  } > "$tmp/scenario.sh"
}

root="$tmp/root"
mkdir -p "$root"
export HOST_TEST_ALLOW_IN_SANDBOX=1

write_script passcase 'test_body() { echo "hello from pass"; return 0; }'
HOST_TEST_ROOT="$root" bash "$tmp/scenario.sh" > "$tmp/pass.out" 2>&1
expect_exit "pass runs" 0 $?
record="$root/.host-tests/passcase/result.json"
expect_grep "pass name" "$record" '"name":"passcase"'
expect_grep "pass status" "$record" '"status":"pass"'
expect_grep "pass exit code" "$record" '"exitCode":0'
expect_grep "pass log" "$root/.host-tests/passcase/output.log" "hello from pass"

write_script failcase 'test_body() { echo "wrong value: 3" >&2; return 3; }'
HOST_TEST_ROOT="$root" bash "$tmp/scenario.sh" > "$tmp/fail.out" 2>&1
expect_exit "fail propagates" 3 $?
record="$root/.host-tests/failcase/result.json"
expect_grep "fail status" "$record" '"status":"fail"'
expect_grep "fail exit code" "$record" '"exitCode":3'
expect_grep "fail log" "$root/.host-tests/failcase/output.log" "wrong value: 3"

write_script unused 'test_body() { return 0; }'
sed -i 's/host_test_main "unused"/host_test_main "Bad Name"/' "$tmp/scenario.sh"
HOST_TEST_ROOT="$root" bash "$tmp/scenario.sh" > "$tmp/badname.out" 2>&1
expect_exit "bad name" 2 $?
expect_grep "bad name reason" "$tmp/badname.out" "invalid test name"

in_sandbox=0
if findmnt -n -T "$here" 2>/dev/null | grep -qi smolvm; then
  in_sandbox=1
fi

write_script guardcase 'test_body() { return 0; }'
env -u HOST_TEST_ALLOW_IN_SANDBOX HOST_TEST_ROOT="$root" bash "$tmp/scenario.sh" > "$tmp/guard.out" 2>&1
guard_rc=$?
if [ "$in_sandbox" -eq 1 ]; then
  expect_exit "guard refuses in sandbox" 2 "$guard_rc"
  expect_grep "guard reason" "$tmp/guard.out" "inside the sandbox"
else
  expect_exit "guard allows on host" 0 "$guard_rc"
  expect_grep "host record" "$root/.host-tests/guardcase/result.json" '"status":"pass"'
fi

if [ "$(id -u)" -ne 0 ]; then
  ro_root="$tmp/ro-root"
  mkdir -p "$ro_root"
  chmod 555 "$ro_root"
  HOST_TEST_ROOT="$ro_root" bash "$tmp/scenario.sh" > "$tmp/ro.out" 2>&1
  expect_exit "unwritable root" 2 $?
  expect_grep "unwritable reason" "$tmp/ro.out" "cannot create results dir"
  chmod 755 "$ro_root"
fi

echo "selftest: $checks checks, fail=$fail"
exit "$fail"
