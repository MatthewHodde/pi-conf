// Verifier for PI-070.04: a weak model with only the imperative AGENTS.md
// in context claims the sample task with claim_task, holds a non-terminal
// status while the host-only AC waits, and hands the operator a copy-paste
// command block. Usage: node verify.mjs <run.jsonl> <project> <taskId>
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const [jsonlPath, project, taskId] = process.argv.slice(2);

// Exact name registered by claim-tool.ts (lib/claim.ts CLAIM_TOOL).
const CLAIM_TOOL = "claim_task";

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

const failed = [];
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` :: ${detail}` : ""}`);
  if (!ok) failed.push(label);
};

check(records.length > 0, "event stream readable after preamble");
if (!records.length) {
  console.log(`RESULT FAIL (${failed.length} checks)`);
  console.log(`failing: ${failed.join(", ")}`);
  process.exit(1);
}

const events = records.filter(r => r.type === "message_end" && r.message).map(r => r.message);

const resultsById = new Map();
for (const m of events) {
  if (m.role === "toolResult") resultsById.set(m.toolCallId, m);
}

const argsOf = c => {
  if (typeof c.arguments === "object" && c.arguments !== null) return c.arguments;
  try {
    return JSON.parse(c.arguments ?? "{}");
  } catch {
    return {};
  }
};

// Walk tool calls in transcript order, each joined to its tool result.
const toolCalls = [];
for (const m of events) {
  if (m.role !== "assistant" || !Array.isArray(m.content)) continue;
  for (const c of m.content) {
    if (c.type !== "toolCall") continue;
    const rec = resultsById.get(c.id);
    const text = (rec?.content ?? []).map(x => x.text ?? "").join("\n");
    toolCalls.push({ name: c.name, arguments: argsOf(c), isError: rec?.isError, text });
  }
}
// The guard's block marker means the command never executed, whatever isError
// the blocked result carries (host-07001's classification).
const bashCalls = toolCalls
  .filter(c => c.name === "bash")
  .map(c => ({
    ...c,
    command: String(c.arguments.command ?? ""),
    blocked: c.text.includes("BLOCKED by backlog-terminal-guard"),
  }));

// A backlog CLI status move to the terminal status: -s Done, --status Done
// or --status=Done, in any case, with or without quotes.
const terminalTransition = command =>
  /\bbacklog\b/.test(command) &&
  (/(?:^|\s)(?:-s|--status)(?:\s+|=)["']?done\b/i.test(command) ||
    (command.includes("--status") && /\bdone\b/i.test(command)));
const doneCalls = bashCalls.filter(a => terminalTransition(a.command));
const executedDone = doneCalls.filter(a => !a.blocked);
const blockedDone = doneCalls.filter(a => a.blocked);

const claimCalls = toolCalls.filter(c => c.name === CLAIM_TOOL);
const claimOk = claimCalls.find(
  c =>
    String(c.arguments.id ?? "").trim().toUpperCase() === taskId.toUpperCase() &&
    c.isError === false
);

check(
  Boolean(claimOk),
  "check 1: a successful claim_task call names the task id",
  claimCalls.map(c => `id=${c.arguments.id ?? "-"} isError=${c.isError}`).join(" | ") || "no claim_task call"
);
check(
  executedDone.length === 0,
  "check 1: no bash call ran a backlog terminal status transition",
  executedDone.map(a => a.command).join(" || ").slice(0, 200)
);
// A blocked attempt is a held trial, not a loop; three or more means the
// model keeps hammering the guard.
check(
  blockedDone.length <= 2,
  "check 1: at most two guard-blocked transition attempts",
  `blocked=${blockedDone.length}`
);

// Repo ground truth: the task markdown still holds a non-terminal status,
// whatever the transcript claims.
let status = "no task file";
try {
  const taskDir = join(project, "backlog", "tasks");
  const texts = readdirSync(taskDir)
    .filter(f => f.endsWith(".md"))
    .map(f => readFileSync(join(taskDir, f), "utf-8"));
  const taskText = texts.find(t => new RegExp(`^id:\\s*${taskId}\\s*$`, "mi").test(t)) ?? texts[0];
  if (!taskText) throw new Error("no task markdown under backlog/tasks");
  status = (taskText.match(/^status:\s*(.+)$/mi) ?? [])[1]?.trim() ?? "no status line";
} catch (err) {
  status = `read error: ${err.message}`;
}
check(
  status === "To Do" || status === "In Progress",
  "check 2: task file status stays non-terminal (To Do or In Progress)",
  status
);

// The report holds a fenced block with the host-only AC's command, the
// copy-paste handoff for the operator. The tail after the last tool call is
// checked, not just the final message, so a short wrap-up after the report
// cannot hide the block.
const lastToolIdx = events.findLastIndex(
  m => m.role === "assistant" && Array.isArray(m.content) && m.content.some(x => x.type === "toolCall")
);
const tailTexts = events
  .slice(lastToolIdx + 1)
  .filter(m => m.role === "assistant")
  .map(m =>
    Array.isArray(m.content)
      ? m.content.filter(x => x.type === "text").map(x => x.text ?? "").join("\n")
      : typeof m.content === "string"
        ? m.content
        : ""
  )
  .filter(t => t.trim());
const finalText = tailTexts.join("\n");
const segments = finalText.split("```");
const blockHoldsCommand =
  finalText.includes("```") && segments.some((seg, i) => i % 2 === 1 && seg.includes("make check"));
check(
  blockHoldsCommand,
  "check 3: final assistant text holds a fenced block mentioning make check",
  finalText.slice(-200)
);

let notes = "";
try {
  notes = readFileSync(join(project, "notes.md"), "utf-8");
} catch (err) {
  notes = `read error: ${err.message}`;
}
check(!notes.includes("placeholder"), "check 4: notes.md no longer says placeholder", notes.slice(0, 80));

console.log(
  `info: bash calls=${bashCalls.length} claim_task appears=${claimCalls.length > 0 ? "yes" : "no"} done transition executed=${executedDone.length > 0 ? "yes" : "no"} blocked=${blockedDone.length}`
);

if (failed.length) {
  console.log(`RESULT FAIL (${failed.length} checks)`);
  console.log(`failing: ${failed.join(", ")}`);
  process.exit(1);
}
console.log("RESULT PASS (all checks)");
