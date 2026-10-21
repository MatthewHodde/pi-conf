import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// findTaskDir searches PROJECT_PATH before cwd; drop it so the fixture is used.
delete process.env.PROJECT_PATH;

import extension, { backlogTerminalBlock, parseTerminalTransition, guardEnabled } from "../backlog-terminal-guard.ts";

// ── Fixture backlog project on disk ──────────────────────────────────────────

const project = mkdtempSync(join(tmpdir(), "btg-project-"));
mkdirSync(join(project, "backlog/tasks"), { recursive: true });
writeFileSync(join(project, "backlog/config.yml"), 'statuses: ["To Do", "In Progress", "Done"]\n');

const HOST_AC = "Verified by running make check on the real host workstation";
const PLAIN_AC = "notes.md no longer says placeholder";
const taskPath = () => join(project, "backlog/tasks", "task-1 - fixture.md");

function writeTask(acLine: string, checked = false) {
  writeFileSync(
    taskPath(),
    [
      "---",
      "id: TASK-1",
      "title: fixture",
      'status: "In Progress"',
      "---",
      "",
      "# TASK-1 - fixture",
      "",
      "## Acceptance Criteria",
      "<!-- AC:BEGIN -->",
      `- [${checked ? "x" : " "}] #1 ${acLine}`,
      "<!-- AC:END -->",
      "",
      "## Definition of Done",
      "<!-- DOD:BEGIN -->",
      "- [ ] #1 All acceptance criteria verified",
      "<!-- DOD:END -->",
      "",
    ].join("\n"),
  );
}

// ── Fire the handler exactly as pi does ──────────────────────────────────────

const handlers: ((event: unknown, ctx: unknown) => unknown)[] = [];
extension({
  on(name: string, fn: (event: unknown, ctx: unknown) => unknown) {
    if (name === "tool_call") handlers.push(fn);
  },
  registerTool() {},
  registerCommand() {},
} as never);
const ctx = {
  ui: { notify() {} },
  cwd: project,
};
const fire = (command: string) =>
  handlers
    .map(fn => fn({ type: "tool_call", toolCallId: "t1", toolName: "bash", input: { command } }, ctx))
    .find(result => (result as { block?: boolean } | undefined)?.block);

assert.equal(handlers.length, 1, "one tool_call handler registered");

// ── Path 1: blocked — unchecked host-only AC ─────────────────────────────────

writeTask(HOST_AC);
const blocked = fire('backlog task edit TASK-1 -s "Done"') as
  | { block: boolean; reason: string }
  | undefined;
assert.ok(blocked?.block, "path 1: unchecked host-only AC blocks the terminal move");
assert.match(blocked!.reason, /BLOCKED by backlog-terminal-guard/, "reason carries the block marker");
assert.ok(blocked!.reason.includes("TASK-1"), "reason names the task id");
assert.ok(blocked!.reason.includes(HOST_AC), "reason quotes the waiting criterion verbatim");
assert.match(blocked!.reason, /non-terminal/, "reason orders the task left non-terminal");
assert.match(blocked!.reason, /copy-paste command block/, "reason orders the decision-003 handoff");
assert.ok(blocked!.reason.includes("```"), "reason fences the criterion for copy-paste");

// DoD items guard the same way.
writeFileSync(
  taskPath(),
  ["---", "id: TASK-1", "title: fixture", 'status: "In Progress"', "---", "",
   "## Acceptance Criteria", "- [x] #1 " + HOST_AC, "",
   "## Definition of Done", "- [ ] #1 Runs the KVM boot check", ""].join("\n"),
);
const dodBlocked = fire("backlog task edit TASK-1 --status done") as { block: boolean; reason: string } | undefined;
assert.ok(dodBlocked?.block, "unchecked DoD keyword blocks too");
assert.ok(dodBlocked!.reason.includes("Runs the KVM boot check"), "DoD criterion quoted verbatim");

// Terminal spellings: completed/closed, attached --status=, chained command.
assert.ok(fire("backlog task edit TASK-1 -s Completed")?.block, "-s Completed blocks");
assert.ok(fire("backlog task edit TASK-1 --status=CLOSED")?.block, "--status=CLOSED blocks");
assert.ok(fire("cd . && backlog task edit TASK-1 -s done")?.block, "chained transition blocks");

// ── Path 2: allowed — AC checked ─────────────────────────────────────────────

writeTask(HOST_AC, true);
assert.equal(fire('backlog task edit TASK-1 -s "Done"'), undefined, "path 2: checked AC passes");

// ── Path 3: allowed — unchecked but no keyword ───────────────────────────────

writeTask(PLAIN_AC);
assert.equal(fire("backlog task edit TASK-1 -s done"), undefined, "path 3: no keyword passes");

// ── Path 4: allowed — non-terminal status ────────────────────────────────────

writeTask(HOST_AC);
assert.equal(
  fire('backlog task edit TASK-1 -s "In Progress"'),
  undefined,
  "path 4: non-terminal status passes",
);
assert.equal(fire("backlog task edit TASK-1 --status \"To Do\""), undefined, "path 4: To Do passes");

// ── Path 5: allowed — non-backlog command ────────────────────────────────────

assert.equal(fire('task edit TASK-1 -s done'), undefined, "path 5: bare task edit passes");
assert.equal(fire('git commit -m "backlog task edit TASK-1 -s done"'), undefined, "path 5: git mention passes");
assert.equal(fire("backlog task list"), undefined, "path 5: backlog list passes");

// ── Path 6: allowed — unresolvable task file ─────────────────────────────────

assert.equal(fire("backlog task edit TASK-99 -s done"), undefined, "path 6: unknown id passes");
rmSync(join(project, "backlog"), { recursive: true });
assert.equal(fire("backlog task edit TASK-1 -s done"), undefined, "path 6: no backlog dir passes");
mkdirSync(join(project, "backlog/tasks"), { recursive: true });

// ── Path 7: allowed — toggle off ─────────────────────────────────────────────

writeTask(HOST_AC);
const configPath = join(new URL("../../backlog-terminal-guard.json", import.meta.url).pathname);
assert.equal(guardEnabled(join(tmpdir(), "btg-missing.json")), true, "missing config keeps the guard on");
assert.equal(guardEnabled(join(tmpdir(), "btg-bad.json")), true, "malformed config keeps the guard on");
assert.ok(fire('backlog task edit TASK-1 -s "Done"')?.block, "path 7 armed: blocks before toggle");
writeFileSync(configPath, JSON.stringify({ enabled: false }));
assert.equal(fire('backlog task edit TASK-1 -s "Done"'), undefined, "path 7: toggle off passes");
rmSync(configPath, { force: true });
assert.ok(fire('backlog task edit TASK-1 -s "Done"')?.block, "path 7: toggle removal restores the block");

// ── Token-boundary pins ──────────────────────────────────────────────────────

assert.deepEqual(
  parseTerminalTransition('backlog task edit TASK-1 --plain --status "Done"'),
  { id: "TASK-1" },
  "parse returns the id",
);
assert.equal(
  parseTerminalTransition('git commit -m "backlog task edit TASK-1 -s done"'),
  null,
  "backlog text quoted in a commit message is not a transition",
);
assert.ok(
  fire('backlog task edit TASK-1 --plain --status "done"')?.block,
  "quoted status value still parses and blocks",
);
assert.equal(parseTerminalTransition("echo backlog task list"), null, "list invocation is not a transition");
assert.equal(parseTerminalTransition("backlog task edit TASK-1 -s In"), null, "-s In is not terminal");
assert.equal(backlogTerminalBlock("backlog task edit TASK-1 -s done", project), blocked!.reason,
  "backlogTerminalBlock is the pure path the handler uses");

rmSync(project, { recursive: true, force: true });
console.log("backlog-terminal-guard: all paths => ok");
