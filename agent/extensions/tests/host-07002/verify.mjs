// Verifier for PI-070.02 AC #3: a weak model blocked once succeeds on the
// immediately following commit attempt.
// Usage: node verify.mjs <run.jsonl> <invalid-message> <corrected-subject> <repo>
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const [jsonlPath, invalidMsg, correctedSubject, repo] = process.argv.slice(2);

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

// JSON-mode records carry no message id. message_end holds the final content of
// each message (message_start shows partial or empty content), so take only ends.
const events = records.filter(r => r.type === "message_end" && r.message).map(r => r.message);

const attempts = [];
const resultsById = new Map();
for (const m of events) {
  if (m.role === "toolResult") resultsById.set(m.toolCallId, m);
  if (m.role === "assistant" && Array.isArray(m.content)) {
    for (const c of m.content) {
      if (c.type === "toolCall" && c.name === "bash" && c.arguments?.command?.includes("git commit")) {
        attempts.push({ id: c.id, command: c.arguments.command });
      }
    }
  }
}

check(attempts.length >= 2, "at least two commit attempts", `got ${attempts.length}`);
if (attempts.length < 2) {
  console.log(`RESULT FAIL (${failures} checks)`);
  process.exit(1);
}

const resultText = id => (resultsById.get(id)?.content ?? []).map(c => c.text ?? "").join("\n");
const isBlock = text => text.includes("Copy this corrected subject line");
// Mirrors the guard's subject rules (type, optional scope, colon, description,
// 50 char cap): the follow-up attempt must be a message the guard would accept.
const CONVENTIONAL = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-z0-9_-]+\))?!?:\s.+$/;
const messageOf = command => {
  const m = command.match(/git commit[^"']*-(?:m\s+)(["'])([\s\S]*?)\1/);
  return m ? m[2] : null;
};

const first = attempts[0];
const firstResult = resultText(first.id);
check(first.command.includes(invalidMsg), "first attempt used the invalid message", first.command.slice(0, 120));
check(isBlock(firstResult), "first attempt was blocked with the correction", firstResult.slice(0, 160).replace(/\n/g, " | "));
check(firstResult.includes(correctedSubject), "block reason carried the corrected subject", correctedSubject);

const second = attempts[1];
const secondResult = resultText(second.id);
const secondMessage = messageOf(second.command);
check(secondMessage !== null, "second attempt used a -m commit message", second.command.slice(0, 120));
check(secondMessage !== null && CONVENTIONAL.test(secondMessage) && secondMessage.length <= 50 && !secondMessage.endsWith("."),
  "second attempt message is valid under the guard", String(secondMessage));
check(!isBlock(secondResult), "following attempt was not blocked", secondResult.slice(0, 160).replace(/\n/g, " | "));
const secondRec = resultsById.get(second.id);
check(secondRec?.isError === false, "immediately following attempt succeeded (tool result not an error)", String(secondRec?.isError));
check(!/Secret scan/i.test(secondResult), "following attempt passed the secret scan", secondResult.slice(0, 160).replace(/\n/g, " | "));

const logSubject = execSync("git log -1 --format=%s", { cwd: repo, encoding: "utf-8" }).trim();
check(secondMessage !== null && logSubject === secondMessage, "commit landed in git log with the second attempt's subject", logSubject);

const blockCount = attempts.filter(a => isBlock(resultText(a.id))).length;
check(blockCount === 1, "exactly one block in the run", `blocks=${blockCount}`);

console.log(secondMessage === correctedSubject
  ? `info: second attempt copied the corrected subject verbatim`
  : `info: second attempt adapted the correction to "${secondMessage}" and still converged`);

console.log(failures ? `RESULT FAIL (${failures} checks)` : "RESULT PASS (all checks)");
process.exit(failures ? 1 : 0);
