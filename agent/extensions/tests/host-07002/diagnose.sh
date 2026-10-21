#!/usr/bin/env bash
# Host hang diagnosis for the PI-070.02 harness stall.
# Run from any host shell: bash /home/matthew/.pi/agent/extensions/tests/host-07002/diagnose.sh
# Variant A runs the trial with stdout redirected to a file, which is what the
# harness does. Variant B runs it with stdout on the terminal. The pi-dev
# wrapper behaves differently for tty and non-tty output, so A stalling while B
# passes would pin the hang on the wrapper's output handling.
set -u

echo "== how pi resolves on this shell =="
type pi 2>&1
command -v pi 2>&1
echo "== env suspects =="
env | grep -iE 'proxy|llama|openai|http_|https_|PI_' | grep -vE 'PROMPT|TERM' || true

work=/tmp/hangprobe2
rm -rf "$work"
mkdir -p "$work/t1" || exit 1
cd "$work/t1" || exit 1
git init -q
git config user.email a@b.c
git config user.name x
echo hi > N.md
git add N.md

prompt="You are in a fresh git repository with a staged change. Commit it with the bash tool using exactly this commit message: added the notes file. The task is done only when the commit has landed. Then report the outcome. Do not edit files and do not read files."

echo "== variant A: stdout to file, 90s cap =="
PI_CODING_AGENT_DIR=~/.pi/agent timeout -k 15s 90 pi --mode json --no-mcp --no-approve \
  --model llama.cpp/Qwen_Qwen3.5-9B-Q4_K_M "$prompt" \
  > "$work/A.out" 2> "$work/A.err" &
pid=$!
while kill -0 "$pid" 2>/dev/null; do
  printf '%s | ' "$(date -u +%T)"
  pgrep -af 'pi --mode|smolmachine|qemu|vng|libvirt' 2>/dev/null | grep -v diagnose | head -4 | tr '\n' ';'
  sockets="$(ss -tn 2>/dev/null | grep -c '10.200.0.50:8080' || true)"
  echo " socks_to_8080=$sockets"
  sleep 6
done
wait "$pid"; a_exit=$?
echo "variant A exit=$a_exit at $(date -u +%T)"
echo "-- A.out last 3 records:"
tail -3 "$work/A.out"
echo "-- A.err last 10 lines:"
tail -10 "$work/A.err"
echo "-- A commit attempts: $(grep -c 'git commit' "$work/A.out" || true)"

if [ "$a_exit" -eq 124 ]; then
  echo "A: stall reproduced (exit 124). Running B anyway, the tty comparison is the point."
fi

echo "== variant B: stdout on the terminal, 90s cap. Protocol lines will print. =="
printf 'variant b\n' > "$work/t1/N.md"
git -C "$work/t1" add N.md
PI_CODING_AGENT_DIR=~/.pi/agent timeout -k 15s 90 pi --mode json --no-mcp --no-approve \
  --model llama.cpp/Qwen_Qwen3.5-9B-Q4_K_M "$prompt" 2> "$work/B.err"
b_exit=$?
echo "variant B exit=$b_exit at $(date -u +%T)"
echo "-- B.err last 10 lines:"
tail -10 "$work/B.err"
echo "== verdict =="
[ "$a_exit" -eq 124 ] && echo "A (file stdout): STALL" || echo "A (file stdout): completed ($a_exit)"
[ "$b_exit" -eq 124 ] && echo "B (tty stdout): STALL" || echo "B (tty stdout): completed ($b_exit)"
echo "== artifacts in $work =="
ls -la "$work"
