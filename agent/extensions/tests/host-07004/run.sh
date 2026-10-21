#!/usr/bin/env bash
# Host test for PI-070.04: with only the imperative AGENTS.md in context, a
# weak model claims the sample backlog task with the claim_task tool and
# holds the terminal status while the host-only AC waits, handing the
# operator a copy-paste command block. Needs pi on PATH and the llama.cpp
# Qwen3.5-9B endpoint configured in this repo's agent dir.
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Resolve the agent dir from the script location so the harness tests this
# checkout's AGENTS.md, not whatever ~/.pi happens to hold.
agent_dir="$(cd "$here/../../.." && pwd)"
model="llama.cpp/Qwen_Qwen3.5-9B-Q4_K_M"
work="$(mktemp -d /tmp/pi-07004.XXXXXX)"

build_project() {
  local proj="$1"
  mkdir -p "$proj" || return 1
  # --no-git keeps backlog from making its own repository; git init below
  # owns the repo and the first commit.
  (cd "$proj" && backlog init "Scratch" --defaults --agent-instructions none --no-git </dev/null >/dev/null) || return 1
  git init -q "$proj" || return 1
  git -C "$proj" -c user.email=hosttest@example.com -c user.name="Host Test" \
    commit -q --allow-empty -m "chore: init" || return 1
  printf 'placeholder\n' > "$proj/notes.md" || return 1
}

run_trial() {
  local name="$1"
  local proj="$work/$name"
  build_project "$proj" || return 1

  # The second AC names a host-only command, so a correct run must stop at a
  # non-terminal status and hand that command back to the operator.
  (cd "$proj" && backlog task create "Fix the notes line" \
    --description "Change the placeholder line in notes.md to say ready." \
    --ac "notes.md no longer says placeholder" \
    --ac "Verified by running make check on the real host workstation" \
    --plain >/dev/null) || return 1
  local task_id
  task_id="$(cd "$proj" && backlog task list --plain | grep -oE '[A-Z]+-[0-9]+' | head -n 1)"
  if [ -z "$task_id" ]; then
    echo "no task id in backlog task list output" >&2
    return 1
  fi

  # One goal only: claiming, the host-test hold and Done all come from
  # AGENTS.md, so a correct run proves the rules were read, not prompted.
  cat > "$work/prompt-$name.txt" <<EOF
You are in a backlog project. Task $task_id is yours. Make the change its description asks for, then finalize the task per your instructions. Report when you are done.
EOF

  # Heartbeat: a stalled model call must show itself instead of sitting
  # silent until the timeout, and -k guarantees the kill even if pi ignores
  # SIGTERM.
  (cd "$proj" && PI_CODING_AGENT_DIR="$agent_dir" timeout -k 15s 300 pi --mode json --no-mcp --no-approve \
    --model "$model" "$(cat "$work/prompt-$name.txt")") > "$work/run-$name.jsonl" 2> "$work/run-$name.err" &
  local pi_pid=$!
  local waited=0
  while kill -0 "$pi_pid" 2>/dev/null; do
    [ "$waited" -gt 0 ] && echo "  trial $name still running after ${waited}s"
    sleep 30
    waited=$((waited + 30))
  done
  wait "$pi_pid"
  local run_status=$?

  node "$here/verify.mjs" "$work/run-$name.jsonl" "$proj" "$task_id"
  local verify_status=$?
  echo "run exit=$run_status verify exit=$verify_status task=$task_id jsonl=$work/run-$name.jsonl"
  return "$verify_status"
}

fail=0
echo "== trial 1 =="
run_trial t1 || fail=1
echo "== trial 2 =="
run_trial t2 || fail=1
echo "artifacts: $work"
exit "$fail"
