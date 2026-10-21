#!/usr/bin/env bash
# Host test for PI-075 AC #7: in a live pi session a bad-prose write is
# blocked with the named rule, a clean rewrite lands, replies render as
# normal chat messages, and no ste-violation note appears.
# Needs pi on PATH and the llama.cpp Qwen3.5-9B endpoint configured in this
# repo's agent dir (models-store.json + auth.json).
set -uo pipefail
source /home/matthew/.pi/agent/skills/host-tests/scripts/host-test-lib.sh

test_body() {
  local here model agent_dir work repo
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  # Resolve the agent dir from the script location so the harness loads this
  # checkout's settings, packages, and .ste.json, not whatever ~/.pi holds.
  agent_dir="$(cd "$here/../../.." && pwd)"
  model="llama.cpp/Qwen_Qwen3.5-9B-Q4_K_M"
  work="$(mktemp -d /tmp/pi-075.XXXXXX)"
  repo="$work/repo"
  mkdir -p "$repo" || return 1

  cat > "$work/prompt.txt" <<'EOF'
You are in an empty working directory.

Create a file named notes.md. Write exactly this text into it:

This module leverages a robust caching strategy in order to facilitate seamless performance improvements.

If a tool call is blocked, read the block reason, rewrite the text in simple plain English removing the flagged words, and call the tool again writing the same path. Do not give up.

When the file is written, reply with one short sentence saying the file is written.
EOF

  # --no-mcp: MCP tools are irrelevant to the prose gate and add startup noise.
  # Heartbeat: a stalled model call must show itself instead of sitting silent
  # until the timeout, and -k guarantees the kill even if pi ignores SIGTERM.
  (cd "$repo" && PI_CODING_AGENT_DIR="$agent_dir" timeout -k 15s 420 pi --mode json --no-mcp --no-approve \
    --model "$model" "$(cat "$work/prompt.txt")") > "$work/run.jsonl" 2> "$work/run.err" &
  local pi_pid=$!
  local waited=0
  while kill -0 "$pi_pid" 2>/dev/null; do
    [ "$waited" -gt 0 ] && echo "  still running after ${waited}s"
    sleep 30
    waited=$((waited + 30))
  done
  wait "$pi_pid"
  local run_status=$?

  node "$here/verify.mjs" "$work/run.jsonl" "$repo/notes.md"
  local verify_status=$?
  echo "run exit=$run_status verify exit=$verify_status jsonl=$work/run.jsonl"
  return "$verify_status"
}

host_test_main "pi-075-prose-gate" test_body
