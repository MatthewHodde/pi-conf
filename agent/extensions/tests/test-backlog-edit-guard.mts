import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// backlogEditBlock searches PROJECT_PATH before cwd; drop it so the fixture is used.
delete process.env.PROJECT_PATH;

import extension, { backlogEditBlock } from "../backlog-edit-guard.ts";

const project = mkdtempSync(join(tmpdir(), "beg-project-"));
mkdirSync(join(project, "backlog/tasks"), { recursive: true });
writeFileSync(join(project, "backlog/config.yml"), 'statuses: ["To Do", "In Progress", "Done"]\n');
mkdirSync(join(project, "sub"), { recursive: true });

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
  cwd: project,
};
const fire = (toolName: string, input: Record<string, unknown>) =>
  handlers
    .map((fn) => fn({ type: "tool_call", toolCallId: "t1", toolName, input }, ctx))
    .find((result) => (result as { block?: boolean } | undefined)?.block);

assert.equal(handlers.length, 1, "one tool_call handler registered");

const blocked = fire("write", { path: "backlog/tasks/task-1 - fixture.md", content: "x" }) as
  | { block: boolean; reason: string }
  | undefined;
assert.ok(blocked?.block, "relative write into backlog/tasks is blocked");
assert.equal(blocked!.block, true, "blocked result carries block: true");
assert.match(blocked!.reason, /BLOCKED by backlog-edit-guard/, "reason carries the block marker");
assert.ok(blocked!.reason.includes("backlog task view PI-123"), "reason shows a backlog CLI example");
assert.ok(blocked!.reason.includes("backlog task edit PI-123"), "reason shows the backlog CLI edit command");
assert.ok(blocked!.reason.includes("agent/backlog-edit-guard.json"), "reason names the operator toggle file");
assert.deepEqual(
  notices[0],
  ["❌ BLOCKED by backlog-edit-guard: direct writes to files under backlog/ are not allowed.", "error"],
  "notify carries the first reason line as an error",
);

assert.ok(
  fire("write", { path: join(project, "backlog/config.yml"), content: "x" })?.block,
  "absolute write to <project>/backlog/config.yml is blocked",
);

ctx.cwd = join(project, "sub");
assert.ok(
  fire("write", { path: "../backlog/tasks/task-1 - fixture.md", content: "x" })?.block,
  "../ traversal from a subdirectory into the backlog is blocked",
);
ctx.cwd = project;

assert.equal(fire("write", { path: "notes.md", content: "x" }), undefined, "allows a write outside backlog");
assert.equal(backlogEditBlock("notes.md", project), null, "pure path: allows a write outside backlog");

assert.ok(
  fire("edit", { path: "backlog/config.yml", oldText: "a", newText: "b" })?.block,
  "edit tool on a backlog file is blocked",
);

assert.equal(
  fire("bash", { command: "echo x > backlog/tasks/y.md" }),
  undefined,
  "bash redirect into the backlog passes",
);

const plain = mkdtempSync(join(tmpdir(), "beg-plain-"));
mkdirSync(join(plain, "backlog"), { recursive: true });
writeFileSync(join(plain, "backlog", "notes.md"), "notes\n");
ctx.cwd = plain;
assert.equal(
  fire("write", { path: "backlog/notes.md", content: "x" }),
  undefined,
  "a plain backlog/ folder without backlog CLI config stays writable",
);
ctx.cwd = project;
rmSync(plain, { recursive: true, force: true });

const configPath = join(new URL("../../backlog-edit-guard.json", import.meta.url).pathname);
const savedConfig = existsSync(configPath) ? readFileSync(configPath, "utf-8") : null;
try {
  writeFileSync(configPath, JSON.stringify({ enabled: false }));
  assert.equal(
    fire("write", { path: "backlog/tasks/task-1 - fixture.md", content: "x" }),
    undefined,
    "enabled false config allows a backlog write",
  );
} finally {
  if (savedConfig === null) rmSync(configPath, { force: true });
  else writeFileSync(configPath, savedConfig);
}

assert.ok(
  fire("write", { path: "backlog/tasks/task-1 - fixture.md", content: "x" })?.block,
  "with no config file the guard is on",
);
assert.equal(
  backlogEditBlock("backlog/tasks/task-1 - fixture.md", project)!.split("\n")[0],
  "BLOCKED by backlog-edit-guard: direct writes to files under backlog/ are not allowed.",
  "reason starts with the exact block line",
);

mkdirSync(join(project, ".backlog"), { recursive: true });
assert.ok(fire("write", { path: ".backlog/config.yml", content: "x" })?.block, ".backlog writes are blocked");
assert.ok(fire("write", { path: "backlog", content: "x" })?.block, "the backlog dir itself is blocked");

rmSync(project, { recursive: true, force: true });
console.log("backlog-edit-guard: all paths => ok");
