// Verifier for PI-075 AC #7: the live-session prose gate blocks bad prose
// with the named rule, a clean rewrite lands, replies render as chat, and no
// ste-violation note appears.
// Usage: node verify.mjs <run.jsonl> <notes-path>
import { readFileSync } from "node:fs";

const [jsonlPath, notesPath] = process.argv.slice(2);

// The pi wrapper prints a banner to stdout before pi's JSONL. Skip any
// preamble lines that do not parse so wrapper noise cannot crash the verifier.
const records = [];
let skipped = 0;
for (const line of readFileSync(jsonlPath, "utf-8").split("\n")) {
  if (!line) continue;
  try {
    records.push(JSON.parse(line));
  } catch {
    skipped++;
  }
}
if (skipped) console.log(`note: skipped ${skipped} non-JSON line(s) (wrapper preamble or corrupt record)`);

let failures = 0;
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` :: ${detail}` : ""}`);
  if (!ok) failures++;
};

check(records.length > 0, "event stream readable after preamble");
if (!records.length) {
  console.log(`RESULT FAIL (${failures} checks)`);
  process.exit(1);
}

const events = records.filter(r => r.type === "message_end" && r.message).map(r => r.message);

const resultsById = new Map();
for (const m of events) {
  if (m.role === "toolResult") resultsById.set(m.toolCallId, m);
}

// One walk attaches each tool call's outcome to the call itself.
const calls = [];
for (const m of events) {
  if (m.role !== "assistant" || !Array.isArray(m.content)) continue;
  for (const c of m.content) {
    if (c.type !== "toolCall") continue;
    const rec = resultsById.get(c.id);
    calls.push({
      name: c.name,
      isError: rec?.isError,
      text: (rec?.content ?? []).map(x => x.text ?? "").join("\n"),
    });
  }
}

const proseWrites = calls.filter(c => c.name === "write" || c.name === "edit");
const blocked = proseWrites.find(
  c => c.isError === true &&
    c.text.includes("Simplified Technical English") &&
    c.text.includes("dictionary/not-approved-word"),
);
check(Boolean(blocked), "a write was blocked with the named rule", `writes=${proseWrites.length}`);
if (!blocked) {
  console.log(`RESULT FAIL (${failures} checks)`);
  process.exit(1);
}
check(/\d+:\d+/.test(blocked.text), "the block reason gives line and column",
  blocked.text.slice(0, 120).replace(/\n/g, " | "));

const landed = proseWrites.find(c => c.isError === false && c === proseWrites.at(-1));
check(Boolean(landed), "a later write succeeded after the block");

let fileText = "";
try {
  fileText = readFileSync(notesPath, "utf-8");
} catch {
  // The failed read is itself the assertion: the file must exist.
}
check(fileText.trim() !== "", "notes.md exists and is non-empty", notesPath);
check(!fileText.includes("leverages"), "the landed text has no flagged word",
  fileText.slice(0, 120).replace(/\n/g, " | "));

const violations = records.filter(
  r => r.customType === "ste-violation" ||
    (r.message && r.message.customType === "ste-violation"),
);
check(violations.length === 0, "no ste-violation message in the transcript",
  `count=${violations.length}`);

check(!calls.some(c => c.name === "say"), "no call to a say tool ever happened");

const last = [...events].reverse().find(m => m.role === "assistant");
const parts = Array.isArray(last?.content) ? last.content : [];
const tail = parts.filter(p => p.type === "text").map(p => p.text ?? "").join("\n").trim();
check(
  tail !== "" && !parts.some(p => p.type === "toolCall"),
  "the final reply is a plain chat message, not a tool entry",
  tail.slice(0, 120).replace(/\n/g, " | "),
);

console.log(`RESULT ${failures === 0 ? "PASS" : "FAIL"} (${failures} failures)`);
process.exit(failures === 0 ? 0 : 1);
