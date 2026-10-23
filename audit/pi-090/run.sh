#!/usr/bin/env bash
# run.sh CONFIG_DIR TASK_DIR OUT_DIR — one pi run on one task, scored by exact file match
set -u
CFG="$(realpath "$1")"; TASK="$(realpath "$2")"; OUT="$(realpath -m "$3")"
name="$(basename "$TASK")_$(basename "$CFG")"
work="$OUT/work-$name"
mkdir -p "$work" "$OUT/logs"
for f in "$TASK"/*; do
  base="$(basename "$f")"
  case "$base" in prompt.txt|expected.*) continue;; esac
  cp "$f" "$work/"
done
start=$(date +%s)
(
  cd "$work" || exit 99
  timeout 300 env PI_CODING_AGENT_DIR="$CFG" pi -p --no-session \
    --model opencode-go/mimo-v2.5 \
    "$(cat "$TASK/prompt.txt")" > "$OUT/logs/$name.log" 2>&1
)
rc=$?
end=$(date +%s)
pass=0
missed=0
for exp in "$TASK"/expected.*; do
  tgt="$(basename "$exp" | sed 's/^expected\.//')"
  if [ -f "$work/$tgt" ] && diff -q "$work/$tgt" "$exp" >/dev/null 2>&1; then
    pass=1
  else
    missed=1
  fi
done
[ "$missed" -eq 1 ] && pass=0
printf '%s\t%s\t%s\t%s\t%s\n' "$(basename "$CFG")" "$(basename "$TASK")" "$pass" "$rc" "$((end-start))" >> "$OUT/results.tsv"
echo "$name pass=$pass rc=$rc $((end-start))s"
