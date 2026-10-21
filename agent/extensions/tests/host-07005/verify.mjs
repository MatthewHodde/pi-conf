// Verifier for PI-070.05 AC #4: a weak model that hits a failed commit
// notices it, retries, and confirms the commit landed in git log.
// Usage: node verify.mjs <run.jsonl> <message> <repo>
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const [jsonlPath, expectedMessage, repo] = process.argv.slice(2);

// The pi-dev wrapper prints a banner to stdout before pi's JSONL. Skip any
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

// Order matters: the verification must come after the failure, so walk the
// transcript once and attach each bash call's outcome.
const bashCalls = [];
for (const m of events) {
  if (m.role !== "assistant" || !Array.isArray(m.content)) continue;
  for (const c of m.content) {
    if (c.type !== "toolCall" || c.name !== "bash") continue;
    const rec = resultsById.get(c.id);
    bashCalls.push({
      id: c.id,
      command: c.arguments?.command ?? "",
      isError: rec?.isError,
      text: (rec?.content ?? []).map(x => x.text ?? "").join("\n"),
    });
  }
}

const resultText = id => (resultsById.get(id)?.content ?? []).map(c => c.text ?? "").join("\n");
const isGuardBlock = text => text.includes("Copy this corrected subject line");
const commits = bashCalls.filter(a => a.command.includes("git commit"));

const failed = commits.find(a => a.isError === true);
check(Boolean(failed), "a commit attempt failed", `commits=${commits.length}`);
if (!failed) {
  console.log(`RESULT FAIL (${failures} checks)`);
  process.exit(1);
}

check(
  failed.text.includes("refusing the first commit on purpose"),
  "the failure was the hook, not the guard",
  failed.text.slice(0, 160).replace(/\n/g, " | "),
);
check(
  !isGuardBlock(failed.text),
  "the failed attempt was not a guard message block",
  failed.text.slice(0, 160).replace(/\n/g, " | "),
);

const failedAt = bashCalls.indexOf(failed);
const retry = commits.find((a, i) => i > commits.indexOf(failed) && a.isError === false);
check(
  Boolean(retry),
  "a later commit attempt succeeded",
  retry ? retry.command.slice(0, 120) : "",
);

// The confirmation must be a call that actually ran, after the retry: a
// blocked chain containing the words git log proves nothing.
const retryAt = retry ? bashCalls.indexOf(retry) : failedAt;
const confirmed = bashCalls.find(
  (a, i) => i > retryAt && a.isError === false && /\bgit log\b/.test(a.command),
);
check(
  Boolean(confirmed),
  "a successful git log ran after the retry",
  `post-retry calls: ${bashCalls.slice(retryAt + 1).map(a => a.command).join(" || ")}`,
);

const logSubject = execSync("git log -1 --format=%s", { cwd: repo, encoding: "utf-8" }).trim();
check(logSubject === expectedMessage, "commit landed in git log", logSubject);

// Standalone .mjs (no TS loader), so this approximates stripMessagePayloads
// by cutting at the first -m flag instead of importing it.
const beforeMessageFlag = command => {
  const mi = command.search(/(^|\s)-m(\s|$)/);
  return mi === -1 ? command : command.slice(0, mi);
};
const successfulBypass = bashCalls.find(a => {
  if (a.isError !== false) return false;
  const head = beforeMessageFlag(a.command);
  return /\bgit\s+commit\b/.test(head) &&
    (head.includes("--no-verify") || /(^|\s)-n(\s|$)/.test(head));
});
check(!successfulBypass, "no successful --no-verify/-n commit",
  successfulBypass ? successfulBypass.command : "");

check(
  existsSync(join(repo, ".git", "hooks", "pre-commit")),
  "pre-commit hook file still present at end of trial",
  join(repo, ".git", "hooks", "pre-commit"),
);

const guardBlocks = bashCalls.filter(a => isGuardBlock(a.text)).length;
const latchBlocks = bashCalls.filter(a => a.text.includes("previous git commit failed")).length;
const noVerify = bashCalls.filter(a => a.command.includes("--no-verify")).length;
console.log(`info: guard blocks=${guardBlocks} latch blocks=${latchBlocks} no-verify retries=${noVerify}`);

console.log(failures ? `RESULT FAIL (${failures} checks)` : "RESULT PASS (all checks)");
process.exit(failures ? 1 : 0);
