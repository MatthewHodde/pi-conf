#!/usr/bin/env bash
# Host test for PI-070.01: with the git-wt layout block injected into the
# system prompt, a weak model starting at the bare root lands the staged
# commit in the sibling worktree without running a work-tree command at the
# root. Needs pi on PATH and the llama.cpp Qwen3.5-9B endpoint configured in
# this repo's agent dir (models-store.json + auth.json).
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Resolve the agent dir from the script location so the harness tests this
# checkout's extension, not whatever ~/.pi happens to hold.
agent_dir="$(cd "$here/../../.." && pwd)"
model="llama.cpp/Qwen_Qwen3.5-9B-Q4_K_M"
work="$(mktemp -d /tmp/pi-07001.XXXXXX)"
message="chore: add the notes file"

build_layout() {
  local repo="$1"
  mkdir -p "$repo" || return 1
  git init -q "$repo/src" || return 1
  git -C "$repo/src" -c user.email=hosttest@example.com -c user.name="Host Test" \
    commit -q --allow-empty -m "chore: init" || return 1
  # Renaming before cloning points the bare repo's HEAD at main, so the bare
  # root's git log follows the branch the model is asked to commit on.
  git -C "$repo/src" branch -qm main || return 1
  git clone -q --bare "$repo/src" "$repo/.bare" || return 1
  printf 'gitdir: ./.bare\n' > "$repo/.git" || return 1
  git --git-dir="$repo/.bare" worktree add "$repo/main" main >/dev/null 2>&1 || return 1
  # The model commits with no identity flags, so repo-local config supplies it.
  git --git-dir="$repo/.bare" config user.email hosttest@example.com || return 1
  git --git-dir="$repo/.bare" config user.name "Host Test" || return 1
  printf 'host test\n' > "$repo/main/NOTES.md" || return 1
  git -C "$repo/main" add NOTES.md || return 1
}

run_trial() {
  local name="$1"
  local repo="$work/$name"
  build_layout "$repo" || return 1

  # One goal, no command script and no mention of .bare or worktrees: the
  # injected layout block is the only signal about where git works.
  cat > "$work/prompt-$name.txt" <<'EOF'
You are in a git-wt repository. A file is staged and ready to commit.

Commit it with the bash tool using exactly this commit message: chore: add the notes file

The task is done only when the commit has landed in git log. Then report the outcome.

Do not edit files and do not read files.
EOF

  # Start at the bare root: that is the location the guidance has to save.
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
