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
const notices: [string | undefined, string][] = [];
extension({
  on(name: string, fn: (event: unknown, ctx: unknown) => unknown) {
    if (name === "tool_call") handlers.push(fn);
  },
  registerTool() {},
  registerCommand() {},
} as never);
const ctx = {
  ui: { notify: (message: string, level?: string) => notices.push([level, message]) },
};
const fire = (command: string) =>
  handlers
    .map(fn => fn({ type: "tool_call", toolCallId: "t1", toolName: "bash", input: { command } }, ctx))
    .find(result => (result as { block?: boolean } | undefined)?.block);

assert.equal(handlers.length, 1, "tool_call handler registered");
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
console.log("event contract => ok");
