import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";

import extension, { heredocWriteBlock } from "../heredoc-write-guard.ts";

const handlers: ((event: unknown, ctx: unknown) => unknown)[] = [];
extension({
  on(name: string, fn: (event: unknown, ctx: unknown) => unknown) {
    if (name === "tool_call") handlers.push(fn);
  },
  registerTool() {},
  registerCommand() {},
} as never);
const notices: [string, string][] = [];
const ctx = {
  ui: {
    notify(msg: string, level: string) {
      notices.push([msg, level]);
    },
  },
  cwd: process.cwd(),
};
const fire = (toolName: string, input: Record<string, unknown>) =>
  handlers
    .map((fn) => fn({ type: "tool_call", toolCallId: "t1", toolName, input }, ctx))
    .find((result) => (result as { block?: boolean } | undefined)?.block);

assert.equal(handlers.length, 1, "one tool_call handler registered");

const blocked = fire("bash", { command: "cat <<EOF > notes.md\nhello\nEOF" }) as
  | { block: boolean; reason: string }
  | undefined;
assert.ok(blocked?.block, "cat heredoc with redirect is blocked");
assert.equal(blocked!.block, true, "blocked result carries block: true");
assert.match(blocked!.reason, /BLOCKED by heredoc-write-guard/, "reason carries the block marker");
assert.ok(blocked!.reason.includes("write tool"), "reason names the write tool");
assert.ok(blocked!.reason.includes("edit tool"), "reason names the edit tool");
assert.ok(blocked!.reason.includes("agent/heredoc-guard.json"), "reason names the operator toggle file");
assert.deepEqual(
  notices[0],
  ["❌ BLOCKED by heredoc-write-guard: do not write files from a bash heredoc.", "error"],
  "notify carries the first reason line as an error",
);

const cases: [string, string][] = [
  ["cat > notes.md <<'EOF'\nhi\nEOF", "redirect before the heredoc marker"],
  ["cat << EOF >> app.log\nline\nEOF", "append redirect"],
  ["cat <<EOF | tee -a app.log\nline\nEOF", "tee with an append flag"],
  ["sudo tee /etc/hosts <<EOF\n0.0.0.0 x\nEOF", "sudo tee with a file"],
  ["grep -c 'x' <<EOF | tee report.txt\nx\nEOF", "tee behind a pipe"],
  ["cat <<-INDENTED > out.md\n\tbody\n\tINDENTED", "dash heredoc with a redirect"],
  ["cat <<EOF | sed 's/a/b/' > out.md\na\nEOF", "a redirect behind a pipe"],
];
for (const [command, label] of cases) {
  assert.ok(heredocWriteBlock(command), `${label} is blocked`);
}

const allowed: [string, string][] = [
  ["python3 - <<EOF\nprint(1)\nEOF", "heredoc feeding stdin to a command"],
  ["cat <<EOF | grep foo\nhello\nEOF", "heredoc piped to a filter"],
  ["cat <<EOF > /dev/null\nnoise\nEOF", "redirect to /dev/null"],
  ["cat notes.md", "a plain read"],
  ["echo hi > notes.md", "a redirect without a heredoc"],
  ["cat <<EOF\na > b is math\nEOF", "a redirect-looking line inside the body"],
  ["echo 'use <<EOF to start a heredoc'", "the word EOF in a quoted string"],
  ["cat <<-INDENTED\n\tbody\n\tINDENTED", "dash heredoc with a tab-indented delimiter"],
];
for (const [command, label] of allowed) {
  assert.equal(heredocWriteBlock(command), null, `${label} stays allowed`);
}

assert.equal(fire("bash", { command: "cat <<EOF > notes.md\nx\nEOF" })?.block, true, "bash with heredoc write is blocked");
assert.equal(
  fire("write", { path: "notes.md", content: "x" }),
  undefined,
  "the write tool stays unguarded",
);
assert.equal(
  fire("edit", { path: "notes.md", oldText: "a", newText: "b" }),
  undefined,
  "the edit tool stays unguarded",
);

const configPath = new URL("../../heredoc-guard.json", import.meta.url).pathname;
const savedConfig = existsSync(configPath) ? readFileSync(configPath, "utf-8") : null;
try {
  writeFileSync(configPath, JSON.stringify({ enabled: false }));
  assert.equal(
    fire("bash", { command: "cat <<EOF > notes.md\nx\nEOF" }),
    undefined,
    "enabled false config allows a heredoc write",
  );
} finally {
  if (savedConfig === null) rmSync(configPath, { force: true });
  else writeFileSync(configPath, savedConfig);
}

assert.ok(
  fire("bash", { command: "cat <<EOF > notes.md\nx\nEOF" })?.block,
  "with no config file the guard is on",
);
assert.equal(
  heredocWriteBlock("cat <<EOF > notes.md\nx\nEOF")!.split("\n")[0],
  "BLOCKED by heredoc-write-guard: do not write files from a bash heredoc.",
  "reason starts with the exact block line",
);

console.log("heredoc-write-guard: all cases => ok");
