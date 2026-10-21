// Verifier for PI-070.01: with the git-wt layout block injected, the model
// starts at the bare root and lands the staged commit in the sibling
// worktree: no root work-tree command, no guard bypass, no retry loop.
// Usage: node verify.mjs <run.jsonl> <message> <root>
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const [jsonlPath, expectedMessage, root] = process.argv.slice(2);

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

// Walk bash calls in transcript order, each joined to its tool result.
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

// A "git commit" segment of a chained command. Token-boundary matching so
// `git -C <dir> commit` counts and prose like `--grep=commit` does not;
// echo/printf segments only quote the words and run no git.
const commitSegments = command =>
  command
    .split(/\s*(?:&&|\|\||;|\|)\s*/)
    .filter(s => /\bgit\b(?:\s+\S+)*\s+commit\b/.test(s) && !/^(?:echo|printf)\b/.test(s.trim()));

const commits = bashCalls.filter(a => commitSegments(a.command).length > 0);

// (1) Repo ground truth plus a successful commit call in the transcript.
let logSubject = "";
try {
  logSubject = execSync("git log -1 --format=%s", { cwd: join(root, "main"), encoding: "utf-8" }).trim();
} catch (err) {
  logSubject = `exec error: ${err.message}`;
}
check(logSubject === expectedMessage, "worktree tip subject equals the message", logSubject);

const goodCommit = commits.find(a => a.isError === false);
check(Boolean(goodCommit), "a successful git commit bash call exists",
  commits.map(a => `${a.isError === false ? "ok" : "err"}: ${a.command}`).join(" || ").slice(0, 200));

// (2) The fatal text of a work-tree command run at the root or in .bare, in
// any tool result anywhere in the transcript.
const fatalResult = [...resultsById.values()].find(m =>
  (m.content ?? []).some(x => (x.text ?? "").includes("this operation must be run in a work tree")),
);
check(!fatalResult, "no tool result mentions the work-tree fatal");

// (3) Cwd replay with the widget's own cd rules from instance-widget.ts:
// first cd match, absolute or resolved against the current dir, and only a
// real directory counts. git -C resolves against the replayed cwd per call.
const CD_RE = /(?:^|\s|\|\||&&|;)\s*cd\s+([^\s;&|]+)/;
const resolveDir = (base, target) => {
  const abs = target.startsWith("/") ? target : join(base, target);
  return existsSync(abs) && statSync(abs).isDirectory() ? abs : base;
};
const gitCFlag = command => {
  const m = command.match(/\bgit\s+-C\s+(\S+)/);
  return m ? m[1] : null;
};
let cwd = root;
const commitLocations = [];
for (const a of bashCalls) {
  const cdMatch = a.command.match(CD_RE);
  if (cdMatch) {
    cwd = resolveDir(cwd, cdMatch[1]);
  } else if (/(?:^|\s|\|\||&&|;)\s*cd\s*$/.test(a.command)) {
    cwd = process.env.HOME || cwd;
  }
  if (commits.includes(a)) {
    const cFlag = gitCFlag(a.command);
    commitLocations.push(cFlag ? resolveDir(cwd, cFlag) : cwd);
  }
}
const locationOk = loc => loc.startsWith(root + "/") && !loc.includes("/.bare");
check(
  commitLocations.length > 0 && commitLocations.every(locationOk),
  "every git commit ran inside a worktree, not the root or .bare",
  commitLocations.join(" | ") || "no git commit calls to replay",
);

// (4) No conventional-commits guard bypass.
const beforeMessageFlag = command => {
  const mi = command.search(/(^|\s)-m(\s|$)/);
  return mi === -1 ? command : command.slice(0, mi);
};
const bypass = commits.find(a => a.isError === false &&
  commitSegments(a.command).some(s => {
    const head = beforeMessageFlag(s);
    return head.includes("--no-verify") || /(^|\s)-n(\s|$)/.test(head);
  }));
check(!bypass, "no successful --no-verify/-n commit", bypass ? bypass.command : "");

// (5) Loop ceiling.
const errorCalls = bashCalls.filter(a => a.isError === true);
check(errorCalls.length <= 1, "at most one errored bash call", `errored=${errorCalls.length}`);
const counts = new Map();
for (const a of bashCalls) counts.set(a.command, (counts.get(a.command) ?? 0) + 1);
const repeats = [...counts.entries()].filter(([, n]) => n >= 3);
check(repeats.length === 0, "no command string repeated 3+ times",
  repeats.map(([cmd, n]) => `${n}x ${cmd}`).join(" || ").slice(0, 200));
check(bashCalls.length <= 15, "bash call count within the ceiling", `bash calls=${bashCalls.length}`);

// (6) The confirmation must come after the successful commit.
const commitAt = goodCommit ? bashCalls.indexOf(goodCommit) : -1;
const confirmed = commitAt >= 0 && bashCalls.some(
  (a, i) => i > commitAt && a.isError === false && /\bgit log\b/.test(a.command),
);
check(Boolean(confirmed), "a successful git log ran after the commit",
  bashCalls.slice(commitAt + 1).map(a => a.command).join(" || ").slice(0, 200));

const worktreeLists = bashCalls.filter(a => /\bgit\b(?:\s+\S+)*\s+worktree\s+list\b/.test(a.command)).length;
console.log(`info: bash calls=${bashCalls.length} git commit calls=${commits.length} git worktree list calls=${worktreeLists}`);

if (failed.length) {
  console.log(`RESULT FAIL (${failed.length} checks)`);
  console.log(`failing: ${failed.join(", ")}`);
  process.exit(1);
}
console.log("RESULT PASS (all checks)");
