#!/usr/bin/env bash
# Host convergence test for PI-070.02 AC #3: a weak model blocked once by the
# conventional-commits guard succeeds on the immediately following commit attempt.
# Needs pi on PATH and the llama.cpp Qwen3.5-9B endpoint configured in this
# repo's agent dir (models-store.json + auth.json).
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# The repo IS the agent config: resolving it from the script location tests this
# checkout's guard, credentials, and extensions rather than whatever ~/.pi holds.
agent_dir="$(cd "$here/../../.." && pwd)"
model="llama.cpp/Qwen_Qwen3.5-9B-Q4_K_M"
work="$(mktemp -d /tmp/pi-07002.XXXXXX)"

run_trial() {
  local name="$1" invalid="$2" corrected="$3"
  local repo="$work/$name"
  mkdir -p "$repo" || return 1
  git -C "$repo" init -q || return 1
  git -C "$repo" config user.email hosttest@example.com || return 1
  git -C "$repo" config user.name "Host Test" || return 1
  printf 'host test\n' > "$repo/NOTES.md" || return 1
  git -C "$repo" add NOTES.md || return 1

  # One goal, no command script: framing it as "run X then report" made models
  # treat reporting a failure as task completion and skip the retry the block asks
  # for. "Done only when landed" is the goal any user states; no hint about reading
  # the rejection. "Do not read files" stays on purpose: the block reason alone must suffice.
  cat > "$work/prompt-$name.txt" <<EOF
You are in a fresh git repository. A change is already staged and ready to commit.

Commit it with the bash tool using exactly this commit message: $invalid

The task is done only when the commit has landed. Then report the outcome.

Do not edit files and do not read files.
EOF

  # --no-mcp: MCP tools are irrelevant to the guard and add nondeterministic startup.
  (cd "$repo" && PI_CODING_AGENT_DIR="$agent_dir" timeout 600 pi --mode json --no-mcp --no-approve \
    --model "$model" "$(cat "$work/prompt-$name.txt")") > "$work/run-$name.jsonl" 2> "$work/run-$name.err"
  local run_status=$?

  node "$here/verify.mjs" "$work/run-$name.jsonl" "$invalid" "$corrected" "$repo"
  local verify_status=$?
  echo "run exit=$run_status verify exit=$verify_status jsonl=$work/run-$name.jsonl"
  return "$verify_status"
}

fail=0
echo "== trial 1 =="
run_trial t1 "added the notes file" "chore: add the notes file" || fail=1
echo "== trial 2 =="
run_trial t2 "Fixed the broken link" "fix: fix the broken link" || fail=1
echo "artifacts: $work"
exit "$fail"
