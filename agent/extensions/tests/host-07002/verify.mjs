// Host-test verifier for PI-070.02 AC #3: a weak model blocked once succeeds
// on the immediately following commit attempt.
// Usage: node verify.mjs <run.jsonl> <invalid-message> <corrected-subject> <repo>
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const [jsonlPath, invalidMsg, correctedSubject, repo] = process.argv.slice(2);
const records = readFileSync(jsonlPath, "utf-8").split("\n").filter(Boolean).map(l => JSON.parse(l));

let failures = 0;
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` :: ${detail}` : ""}`);
  if (!ok) failures++;
};

// JSON-mode records carry no message id. message_end holds the final content of
// each message (message_start shows partial or empty content), so take only ends.
const events = records.filter(r => r.type === "message_end" && r.message).map(r => r.message);

// Chronological commit attempts: bash toolCalls whose command contains the trigger.
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

const first = attempts[0];
const firstResult = resultText(first.id);
check(first.command.includes(invalidMsg), "first attempt used the invalid message", first.command.slice(0, 120));
check(isBlock(firstResult), "first attempt was blocked with the correction", firstResult.slice(0, 160).replace(/\n/g, " | "));
check(firstResult.includes(correctedSubject), "block reason carried the corrected subject", correctedSubject);

const second = attempts[1];
const secondResult = resultText(second.id);
check(second.command.includes(correctedSubject), "immediately following attempt used the corrected subject", second.command.slice(0, 120));
check(!isBlock(secondResult), "following attempt was not blocked", secondResult.slice(0, 160).replace(/\n/g, " | "));
check(!secondResult.includes("Secret scanner"), "following attempt passed the secret scan", secondResult.slice(0, 160).replace(/\n/g, " | "));

const logSubject = execSync("git log -1 --format=%s", { cwd: repo, encoding: "utf-8" }).trim();
check(logSubject === correctedSubject, "commit landed in git log with the corrected subject", logSubject);

const blockCount = attempts.filter(a => isBlock(resultText(a.id))).length;
check(blockCount === 1, "exactly one block in the run", `blocks=${blockCount}`);

console.log(failures ? `RESULT FAIL (${failures} checks)` : "RESULT PASS (all checks)");
process.exit(failures ? 1 : 0);
