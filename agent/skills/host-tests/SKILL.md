---
name: host-tests
description: "Turns a test that cannot run inside the smolvm sandbox (real builds, KVM, host hardware or network) into a single-execution script the operator runs once. The script reports through the shared project mount, so results come back without any copy-paste."
---

# Host tests

Some tests belong on the host (decision-003). Write one script per test. The
operator runs it once. The script writes its result to the project root that
host and sandbox share. The session reads that record back. Nothing gets pasted
into the conversation.

## Isolation contract

- The script reports only through `<root>/.host-tests/`. There is no other
  channel between host and sandbox, and adding one is out of scope.
- The operator runs one command and comes back. The operator never pastes test
  output into the conversation.
- The sandbox never executes the script. `host_test_main` refuses when the lib's
  own directory sits on a smolvm mount, so a sandbox run fails loudly instead of
  producing a fake host result.

## Writing a test

Create the script next to the code it covers:

```bash
#!/usr/bin/env bash
set -uo pipefail
source /home/matthew/.pi/agent/skills/host-tests/scripts/host-test-lib.sh

test_body() {
  local got
  got="$(my-binary --version)"
  if [ "$got" != "my-binary 1.4.2" ]; then
    echo "expected 'my-binary 1.4.2', got '$got'" >&2
    return 1
  fi
}

host_test_main "my-binary-version" test_body
```

The name must match `^[a-z0-9][a-z0-9-]*$`. It becomes the result path, so
reuse one stable name per test. Each run overwrites the previous record.

Assert observed behavior against a literal expected value. Call the code the way
its user calls it. An assertion that still holds when every command returns
nothing is not a test. See
[principle-test-behavior-not-implementation](../../npm/node_modules/@whamp/pi-pstack/skills/principle-test-behavior-not-implementation/SKILL.md).

## Handoff

The handoff is one command:

```
bash /home/matthew/.pi/path/to/the-script.sh
```

Nothing else. When the operator returns, or on a later turn, read the record:

```
cat /home/matthew/.pi/.host-tests/<name>/result.json
cat /home/matthew/.pi/.host-tests/<name>/output.log
```

Check that `finishedAt` is later than the handoff time. A missing or stale
record means the command did not run. Ask whether they ran the command, never
for its output.

## Result record

The lib writes it atomically, so a reader sees either the old record or the new
one, never a partial file:

```json
{
  "name": "my-binary-version",
  "status": "pass",
  "exitCode": 0,
  "startedAt": "2026-10-21T06:00:00Z",
  "finishedAt": "2026-10-21T06:00:31Z",
  "hostname": "host-name",
  "log": ".host-tests/my-binary-version/output.log"
}
```

Exit codes are the test body's own. Exit 2 is reserved for the harness failing
to do its job: a bad name, a sandbox run, an unwritable results dir. A harness
failure writes no record, so its absence in `.host-tests/` is the signal.

## Harness self-check

`tests/selftest.sh` exercises the lib (pass, fail, bad name, sandbox refusal,
unwritable results) and needs only bash and grep. Run it in the sandbox to
verify changes to the lib, and on the host to verify the mount contract:

```
bash /home/matthew/.pi/agent/skills/host-tests/tests/selftest.sh
```

`tests/demo.sh` is the smallest real host test. It writes a record to the
actual `.host-tests/` dir, which is how the sandbox confirms a host run
happened.
