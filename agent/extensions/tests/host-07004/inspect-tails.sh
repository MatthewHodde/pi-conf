#!/usr/bin/env bash
# Diagnostic for PI-070.04 round 4: print what each trial's final report tail
# actually contained and whether pi cut it off, so check 3's failure shape is
# an evidence question instead of a guess.
set -uo pipefail
# shellcheck disable=SC1091
source /home/matthew/.pi/agent/skills/host-tests/scripts/host-test-lib.sh

# Force the repo root: a stray HOST_TEST_ROOT in the operator's shell would
# silently write the record somewhere else, and absence here then reads as a
# harness failure. Sibling scripts rely on the lib's default for the same effect.
unset HOST_TEST_ROOT

test_body() {
  local dir=/tmp/pi-07004.7tPkEy
  if [ ! -d "$dir" ]; then
    echo "artifact dir missing: $dir" >&2
    return 1
  fi
  node - "$dir" <<'EOF'
const fs = require("node:fs");
const dir = process.argv[2];
for (const t of ["t1", "t2"]) {
  const file = `${dir}/run-${t}.jsonl`;
  if (!fs.existsSync(file)) { console.log(`== ${t}: missing ${file}`); continue; }
  const recs = fs.readFileSync(file, "utf8").split("\n").filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const ev = recs.filter(r => r.type === "message_end" && r.message).map(r => r);
  const msgs = ev.map(r => r.message);
  const lastToolIdx = msgs.findLastIndex(
    m => m.role === "assistant" && Array.isArray(m.content) && m.content.some(x => x.type === "toolCall")
  );
  const tail = msgs.slice(lastToolIdx + 1)
    .filter(m => m.role === "assistant")
    .map(m => Array.isArray(m.content)
      ? m.content.filter(x => x.type === "text").map(x => x.text || "").join("\n")
      : (typeof m.content === "string" ? m.content : ""))
    .filter(s => s.trim());
  const last = ev[ev.length - 1];
  const text = tail.join("\n<<<next assistant message>>>\n");
  const fenced = text.includes("```") && text.split("```").some((s, i) => i % 2 === 1 && s.includes("make check"));
  console.log(`== ${t} ==`);
  console.log(`records=${recs.length} lastRole=${last?.message?.role} stopReason=${last?.stopReason ?? "(absent)"}`);
  console.log(`tail text blocks=${tail.length}`);
  console.log("--- begin tail ---");
  console.log(text || "(empty tail)");
  console.log("--- end tail ---");
  console.log(`analysis: fencedMakeCheck=${fenced} containsMakeCheck=${text.includes("make check")} backticked=${text.includes("`make check`")}`);
  console.log("");
}
EOF
}

host_test_main "pi-07004-trial-tails" test_body
