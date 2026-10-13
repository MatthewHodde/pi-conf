/**
 * Behavior test for the instance widget: one key, two lines, correct refresh.
 *
 * Run: node agent/extensions/tests/test-instance-widget.mjs
 */

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// findTaskDir searches PROJECT_PATH before cwd, which would make the test read
// this machine's real backlog instead of the fixture.
delete process.env.PROJECT_PATH;

const theme = { fg: (_color, text) => text };
const handlers = {};
const widgets = new Map();
const notices = [];

const pi = {
  on(name, fn) {
    (handlers[name] ??= []).push(fn);
  },
  registerTool() {},
  registerCommand() {},
};

function makeCtx(cwd) {
  return {
    cwd,
    ui: {
      theme,
      setWidget(key, lines, opts) {
        widgets.set(key, { lines, opts });
      },
      notify(message, type) {
        notices.push({ message, type });
      },
    },
  };
}

const fire = (name, event, ctx) =>
  Promise.all((handlers[name] ?? []).map((handler) => handler(event, ctx)));

const lines = () => widgets.get("instance")?.lines;

const cleanups = [];

function makeProject() {
  const project = mkdtempSync(join(tmpdir(), "instance-widget-project-"));
  cleanups.push(project);
  mkdirSync(join(project, "backlog/tasks"), { recursive: true });
  writeFileSync(join(project, "backlog/config.yml"), 'statuses: ["To Do", "In Progress", "Done"]\n');
  writeFileSync(join(project, "backlog/tasks/pi-101 - demo task.md"), taskBody("In Progress"));
  return project;
}

function taskBody(status) {
  // The heading deliberately disagrees: frontmatter is the source of truth.
  return [
    "---",
    "id: PI-101",
    "title: demo task",
    `status: \"${status}\"`,
    "---",
    "",
    "# Task PI-101 - heading must lose to frontmatter",
    "",
  ].join("\n");
}

function makeWorktree() {
  const root = mkdtempSync(join(tmpdir(), "instance-widget-wt-"));
  cleanups.push(root);
  mkdirSync(join(root, ".bare"), { recursive: true });
  mkdirSync(join(root, "feature-x"), { recursive: true });
  writeFileSync(join(root, ".git"), "gitdir: ./.bare\n");
  return root;
}

// ── A git-wt repo with an active task ─────────────────────────────────────────

const project = makeProject();
const root = makeWorktree();
process.chdir(root);

const extension = (await import("../instance-widget.ts")).default;
extension(pi);

assert.ok(handlers.session_start?.length, "session_start registered");
assert.ok(handlers.tool_call?.length, "tool_call registered");
assert.ok(handlers.tool_result?.length, "tool_result registered");

await fire("session_start", {}, makeCtx(project));

assert.equal(widgets.get("instance").opts.placement, "aboveEditor", "widget sits above the editor");
assert.equal(lines().length, 2, "task line and worktree line");
assert.equal(lines()[0], "📋 PI-101 — demo task", "task line names id and title");
assert.match(lines()[1], /^🌿 git-wt: project root$/, "worktree line starts at the root");
assert.ok(
  notices.some((n) => n.message.includes("git-wt repo detected")),
  "startup announces the worktree",
);

const prompt = await (handlers.before_agent_start[0])({ systemPrompt: "base" });
assert.match(prompt.systemPrompt, /Load the git-wt skill/, "git-wt prompt injected");

await fire("tool_call", { toolName: "bash", input: { command: "cd feature-x" } }, makeCtx(project));
assert.match(lines()[1], /feature-x/, "worktree line follows cd");

// ── Refresh only when a backlog command reports a result ──────────────────────

writeFileSync(join(project, "backlog/tasks/pi-101 - demo task.md"), taskBody("Done"));
await fire("tool_result", { toolName: "bash", input: { command: "ls" }, isError: false }, makeCtx(project));
assert.equal(lines().length, 2, "unrelated result leaves the stale task line alone");

await fire(
  "tool_result",
  { toolName: "mcp__backlog__task_edit", input: { id: "PI-101" }, isError: false },
  makeCtx(project),
);
assert.equal(lines().length, 1, "finished task drops its line");

writeFileSync(join(project, "backlog/tasks/pi-101 - demo task.md"), taskBody("In Progress"));
await fire(
  "tool_result",
  { toolName: "bash", input: { command: "backlog task edit PI-101 -s 'In Progress'" }, isError: false },
  makeCtx(project),
);
assert.equal(lines()[0], "📋 PI-101 — demo task", "cli backlog result restores the task line");

await fire(
  "tool_result",
  { toolName: "mcp__backlog__task_edit", input: {}, isError: true },
  makeCtx(project),
);
assert.equal(lines()[0], "📋 PI-101 — demo task", "failed backlog call changes nothing");

// ── Neither source present: the key goes away ────────────────────────────────

const plain = mkdtempSync(join(tmpdir(), "instance-widget-plain-"));
cleanups.push(plain);
process.chdir(plain);

const fresh = (await import(`../instance-widget.ts?fresh=${Date.now()}`)).default;
const freshHandlers = {};
fresh({
  on(name, fn) {
    (freshHandlers[name] ??= []).push(fn);
  },
  registerTool() {},
  registerCommand() {},
});

const emptyProject = mkdtempSync(join(tmpdir(), "instance-widget-empty-"));
cleanups.push(emptyProject);
const emptyWidgets = new Map();
await Promise.all(
  freshHandlers.session_start.map((handler) =>
    handler({}, {
      cwd: emptyProject,
      ui: {
        theme,
        setWidget(key, widgetLines, opts) {
          emptyWidgets.set(key, { lines: widgetLines, opts });
        },
        notify() {},
      },
    }),
  ),
);
assert.equal(emptyWidgets.get("instance").lines, undefined, "no sources means no widget");

for (const dir of cleanups) rmSync(dir, { recursive: true, force: true });
console.log("instance-widget => ok");
