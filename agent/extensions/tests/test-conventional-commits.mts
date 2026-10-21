import assert from "node:assert/strict";
import extension, { validate, correctSubject } from "../conventional-commits.ts";
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

console.log("event contract => ok");
