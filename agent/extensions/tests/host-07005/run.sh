#!/usr/bin/env bash
# Host test for PI-070.05 AC #4: a weak model that hits a failed commit
# notices it, retries, and confirms the commit landed in git log.
# Needs pi on PATH and the llama.cpp Qwen3.5-9B endpoint configured in this
# repo's agent dir (models-store.json + auth.json).
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Resolve the agent dir from the script location so the harness tests this
# checkout's guard and AGENTS.md, not whatever ~/.pi happens to hold.
agent_dir="$(cd "$here/../../.." && pwd)"
model="llama.cpp/Qwen_Qwen3.5-9B-Q4_K_M"
work="$(mktemp -d /tmp/pi-07005.XXXXXX)"
message="chore: add the notes file"

run_trial() {
  local name="$1"
  local repo="$work/$name"
  mkdir -p "$repo" || return 1
  git -C "$repo" init -q || return 1
  git -C "$repo" config user.email hosttest@example.com || return 1
  git -C "$repo" config user.name "Host Test" || return 1
  printf 'host test\n' > "$repo/NOTES.md" || return 1
  git -C "$repo" add NOTES.md || return 1

  # The first commit must fail for a non-guard reason (hook), which is the
  # failure class that arms the latch; the retry passes.
  cat > "$repo/.git/hooks/pre-commit" <<'HOOK'
#!/usr/bin/env bash
marker="$(git rev-parse --git-dir)/first-commit-seen"
if [ ! -e "$marker" ]; then
  touch "$marker"
  echo "pre-commit: refusing the first commit on purpose" >&2
  exit 1
fi
HOOK
  chmod +x "$repo/.git/hooks/pre-commit" || return 1

  # One goal, no command script: the goal names git log the way a user would,
  # and "Do not edit files and do not read files" keeps the failure text and
  # the AGENTS.md imperative as the only signals.
  cat > "$work/prompt-$name.txt" <<EOF
You are in a fresh git repository. A change is already staged and ready to commit.

Commit it with the bash tool using exactly this commit message: $message

The task is done only when the commit has landed in git log. Then report the outcome.

Do not edit files and do not read files.
EOF

  # --no-mcp: MCP tools are irrelevant to the guard and add nondeterministic startup.
  # Heartbeat: a stalled model call must show itself instead of sitting silent
  # until the timeout, and -k guarantees the kill even if pi ignores SIGTERM.
  (cd "$repo" && PI_CODING_AGENT_DIR="$agent_dir" timeout -k 15s 300 pi --mode json --no-mcp --no-approve \
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

  node "$here/verify.mjs" "$work/run-$name.jsonl" "$message" "$repo"
  local verify_status=$?
  echo "run exit=$run_status verify exit=$verify_status jsonl=$work/run-$name.jsonl"
  return "$verify_status"
}

fail=0
echo "== trial 1 =="
run_trial t1 || fail=1
echo "== trial 2 =="
run_trial t2 || fail=1
echo "artifacts: $work"
exit "$fail"
