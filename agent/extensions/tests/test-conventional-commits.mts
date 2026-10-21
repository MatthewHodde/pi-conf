import assert from "node:assert/strict";
import { writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import extension, { validate, correctSubject, noVerifyAllowed } from "../conventional-commits.ts";
const cases: [string,string,boolean][] = [
  ["clean subject only", "fix: stop push in sandbox", true],
  ["good why body", "feat: add csv export\n\nLarge exports were unreadable uncompressed.", true],
  ["coauthor claude", "chore: update deps\n\nCo-Authored-By: Claude <noreply@anthropic.com>", false],
  ["gpt mention", "refactor: swap lib\n\nZero API cost. Reviewed with GPT-5.", false],
  ["anthropic word", "docs: note\n\nPer Anthropic guidance we dropped it.", false],
  ["21 body lines", "feat: x\n\n" + Array.from({length:21},(_,i)=>"line "+i).join("\n"), false],
  ["20 body lines", "feat: x\n\n" + Array.from({length:20},(_,i)=>"line "+i).join("\n"), true],
  ["ai word in subject ok", "feat: add ai-assisted triage", true],
  ["plain inventory", "chore: bump\n\n- a.ts changed\n- b.ts changed", true],
  // Historical 33a025a predates the 50-char subject limit; kept as a length-rule fixture.
  ["subject over 50 chars", "feat(smolvm): block git push in sandbox, only host can push\n\nAgent inside smolvm sandbox should not push to git remotes.\nAdds tool-level blocker with tight regex and prompt instruction.", false],
];
for (const [name, message, expected] of cases) {
  const result = validate(message);
  assert.equal(
    result.ok,
    expected,
    `${name}: expected ok=${expected}, got ok=${result.ok}${result.error ? ` (${result.error})` : ""}`,
  );
}

// Every correction must itself pass validate(), so one retry always clears.
const corrections: [string, string | null][] = [
  ["bad message", "chore: bad message"],
  ["add csv export", "feat: add csv export"],
  ["Feat: add export", "feat: add export"],
  ["feat add export", "feat: add export"],
  ["Bugfix: stop the loop", "fix: stop the loop"],
  ["Fixed the push blocker", "fix: fix the push blocker"],
  ["feat: add export.", "feat: add export"],
  ["feat(smolvm): block git push in sandbox, only host can push", "feat(smolvm): block git push in sandbox, only"],
  ["fix: stop push in sandbox", null],
  ["feat!: remove legacy", null],
  ["", null],
];
for (const [subject, expected] of corrections) {
  const actual = correctSubject(subject);
  assert.equal(actual, expected, `correctSubject(${JSON.stringify(subject)})`);
  if (actual) assert.ok(validate(actual).ok, `corrected line must validate: ${actual}`);
}

// pi 1.0 event contract: the event carries `input`, and a block returns `{ block, reason }`.
// See ToolCallEvent / ToolCallEventResult in pi-coding-agent/dist/core/extensions/types.d.ts.
const handlers: ((event: unknown, ctx: unknown) => unknown)[] = [];
const resultHandlers: ((event: unknown, ctx: unknown) => unknown)[] = [];
const commandHandlers = new Map<string, (args: string, ctx: unknown) => unknown>();
const notices: [string | undefined, string][] = [];
extension({
  on(name: string, fn: (event: unknown, ctx: unknown) => unknown) {
    if (name === "tool_call") handlers.push(fn);
    if (name === "tool_result") resultHandlers.push(fn);
  },
  registerTool() {},
  registerCommand(name: string, options: { handler: (args: string, ctx: unknown) => unknown }) {
    commandHandlers.set(name, options.handler);
  },
} as never);
const ctx = {
  ui: { notify: (message: string, level?: string) => notices.push([level, message]) },
};
const fire = (command: string) =>
  handlers
    .map(fn => fn({ type: "tool_call", toolCallId: "t1", toolName: "bash", input: { command } }, ctx))
    .find(result => (result as { block?: boolean } | undefined)?.block);
const fireResult = (command: string, isError: boolean) => {
  for (const fn of resultHandlers)
    fn(
      { type: "tool_result", toolCallId: "t1", toolName: "bash", input: { command }, content: [], isError },
      ctx,
    );
};
const fireCommand = async (name: string) => {
  const handler = commandHandlers.get(name);
  assert.ok(handler, `${name} command registered`);
  await handler("", ctx);
};

assert.equal(handlers.length, 1, "tool_call handler registered");
assert.equal(resultHandlers.length, 1, "tool_result handler registered");
assert.ok(fire("git commit -m \"bad message\""), "non-conventional subject blocks");
assert.ok(notices.some(([, m]) => m.includes("Invalid commit")), "invalid subject notifies");
assert.ok(fire("git commit -m \"chore: update deps\\n\\nCo-Authored-By: Claude <noreply@anthropic.com>\"")?.block, "AI attribution blocks via input.command");
assert.equal(fire("echo hello"), undefined, "non-commit bash passes");

const blocked = fire('git commit -m "add csv export"') as
  | { block: boolean; reason: string }
  | undefined;
assert.ok(blocked?.block, "unconventional subject blocks");
assert.match(blocked!.reason, /Subject must look like/, "reason states the exact violation");
assert.ok(blocked!.reason.includes("```"), "reason fences the corrected line");
assert.ok(
  blocked!.reason.includes("feat: add csv export"),
  "reason carries a corrected subject derived from what the model wrote",
);
assert.match(
  blocked!.reason,
  /git log -1 --oneline/,
  "guard block ends with the verification imperative",
);

// Only guard blocks have fired, and a block never reaches tool_result, so no latch.
assert.equal(fire("git reset --hard"), undefined, "guard block alone does not latch");

// A valid subject means the guard would have passed this commit: the failure is a
// non-guard one (nothing staged, hook, wrong dir), and it must latch anyway.
const failedCommit = 'git commit -m "chore: wip"';
fireResult(failedCommit, true);
const latched = fire("git reset --hard") as { block: boolean; reason: string } | undefined;
assert.ok(latched?.block, "non-zero git commit latches: destructive git blocks");
assert.ok(latched!.reason.includes(failedCommit), "latch block names the failed command");
assert.match(latched!.reason, /git log -1 --oneline/, "latch block demands verification");
assert.match(latched!.reason, /commit-unlock/, "latch block names the escape hatch");
assert.equal(fire("git status"), undefined, "allowlisted git status passes while latched");
assert.equal(
  fire("git log -1 --oneline"),
  undefined,
  "the block's own verify command passes while latched",
);
assert.equal(fire("ls notes.txt"), undefined, "non-git command passes while latched");
assert.ok(
  fire('bash -c "git clean -fd"')?.block,
  "git inside bash -c classifies while latched",
);
assert.ok(
  fire("echo hi && git checkout -- .")?.block,
  "git in a chain classifies while latched",
);
assert.ok(fire("git")?.block, "bare trailing git counts as non-recovery");
assert.equal(
  fire('git commit -m "docs: explain reset now"'),
  undefined,
  "bare reset word inside a message is not a subcommand",
);

fireResult("git status", false);
assert.ok(fire("git reset --hard")?.block, "non-commit git results leave the latch set");

const retry = fire('git commit -m "add csv export"') as
  | { block: boolean; reason: string }
  | undefined;
assert.ok(retry?.block, "latched commit retry still reaches message validation");
assert.match(
  retry!.reason,
  /Subject must look like/,
  "retry is blocked by the message guard, not the latch",
);
assert.match(retry!.reason, /git log -1 --oneline/, "retry block carries the imperative too");
assert.ok(fire("git reset --hard")?.block, "blocked retry leaves the latch set");

fireResult('git commit -m "chore: landed"', false);
assert.equal(fire("git reset --hard"), undefined, "landed commit clears the latch");

fireResult('git commit -m "chore: boom"', true);
assert.ok(fire("git reset --hard")?.block, "latch re-arms on another failed commit");
await fireCommand("commit-unlock");
assert.equal(fire("git reset --hard"), undefined, "/commit-unlock clears the latch");
assert.ok(
  notices.some(([, m]) => m.includes("Commit latch cleared")),
  "/commit-unlock notifies",
);

// Arming stays broad (non-zero exit), but clearing must be a real commit
// invocation: an exit-0 command that merely mentions the phrase would
// otherwise release a live latch, and a grep is not decision F's release event.
fireResult('git commit -m "chore: boom"', true);
assert.ok(fire("git reset --hard")?.block, "latch armed for the mention test");
fireResult('grep "git commit" agent/README.md', false);
assert.ok(
  fire("git reset --hard")?.block,
  "exit-0 command mentioning git commit does not clear the latch",
);
fireResult('grep "git commit" agent/README.md', true);
assert.ok(
  fire("git reset --hard")?.block,
  "failed non-commit command leaves the latch set",
);
fireResult('git commit -m "chore: landed after mention"', false);
assert.equal(
  fire("git reset --hard"),
  undefined,
  "a real invocation still clears after the mention tests",
);

const NO_VERIFY_REASON = [
  "Blocked: this commit tries to skip the hooks with --no-verify or -n.",
  "Hooks are the check: run the commit normally, read what the hook reports, and fix that instead of bypassing it.",
  "",
  "After every commit attempt, run `git log -1 --oneline` and confirm your commit landed before moving on.",
].join("\n");
const HOOK_REASON = [
  "Blocked: .git/hooks belongs to the failed, unverified commit:",
  "```",
  'git commit -m "chore: wip"',
  "```",
  "Do not read or edit the hooks to get past this failure - fix what the commit hook reported, or run `git log -1 --oneline` to see whether the commit landed.",
  "If git log shows the commit landed and this block persists, run /commit-unlock.",
  "",
  "After every commit attempt, run `git log -1 --oneline` and confirm your commit landed before moving on.",
].join("\n");

const bypass = fire('git commit --no-verify -m "chore: wip"');
assert.equal(bypass?.block, true, "rule A: --no-verify commit blocks");
assert.equal(bypass!.reason, NO_VERIFY_REASON, "rule A: literal fix-the-hook reason");
assert.equal(
  fire('git commit -n -m "chore: wip"')!.reason,
  NO_VERIFY_REASON,
  "rule A: -n commit flag blocks with the same literal reason",
);
assert.equal(
  fire('git commit --no-verify -m "bad message"')!.reason,
  NO_VERIFY_REASON,
  "rule A outranks message validation (reason is not the subject error)",
);
assert.equal(
  fire('git commit -m "docs: document --no-verify and .git/hooks"'),
  undefined,
  "rule A/B: -m payload naming both needles is data and passes",
);
assert.equal(
  fire('git commit -m "docs: cover -n too"'),
  undefined,
  "rule A: bare -n inside the payload passes",
);

assert.equal(
  noVerifyAllowed(join(tmpdir(), "pi-07006-missing.json")),
  false,
  "missing policy file keeps the bypass block on",
);
const policyFile = join(tmpdir(), "pi-07006-policy.json");
writeFileSync(policyFile, "{ not json");
assert.equal(noVerifyAllowed(policyFile), false, "malformed policy fails closed");
writeFileSync(policyFile, JSON.stringify({ allowNoVerify: true }));
assert.equal(noVerifyAllowed(policyFile), true, "operator switch permits --no-verify");
rmSync(policyFile);
assert.equal(
  noVerifyAllowed(policyFile),
  false,
  "switch removal restores the block without restart",
);
assert.ok(
  fire('git commit --no-verify -m "chore: wip"')?.block,
  "no policy file in the repo keeps the default bypass block on",
);

fireResult('git commit -m "chore: wip"', true);
assert.ok(fire("git reset --hard")?.block, "latch armed for the rule B section");

const hookAccess = fire("cat .git/hooks/pre-commit");
assert.equal(hookAccess?.block, true, "rule B: hook reference blocks while latched");
assert.equal(hookAccess!.reason, HOOK_REASON, "rule B: literal hooks-belong reason");
assert.equal(
  fire("git status && cat .git/hooks/pre-commit")!.reason,
  HOOK_REASON,
  "rule B: allowlisted head does not legitimize hook access (pinned chain edge)",
);
assert.equal(
  fire('git commit -m "docs: explain .git/hooks"'),
  undefined,
  "rule B: hook words in an allowlisted commit message payload are data while latched",
);
assert.ok(
  fire("chmod +x .git/hooks/*")?.block,
  "rule B: hook glob blocks while latched",
);
assert.equal(
  fire('git commit --no-verify -m "chore: wip" && cat .git/hooks/pre-commit')!.reason,
  HOOK_REASON,
  "precedence: while latched rule B outranks rule A",
);
assert.equal(
  fire('git commit --no-verify -m "chore: wip"')!.reason,
  NO_VERIFY_REASON,
  "precedence: allowlisted retry passes the latch, rule A blocks it",
);
assert.equal(fire("git log -1 --oneline"), undefined, "recovery git log passes while latched");
assert.equal(fire("git status"), undefined, "recovery git status passes while latched");
assert.equal(
  fire('git commit -m "chore: wip"'),
  undefined,
  "compliant retry passes both new rules while latched",
);
assert.equal(fire("ls notes.txt"), undefined, "non-git recovery passes while latched");

fireResult('git commit -m "chore: landed"', false);
assert.equal(
  fire("cat .git/hooks/pre-commit"),
  undefined,
  "rule B is latch-scoped: hook access passes once clear",
);

console.log("event contract => ok");
