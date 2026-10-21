/**
 * Behavior test for the instance widget: one key, the task this instance
 * claimed, worktree info, refresh rules, and a clamp to pi's widget width.
 *
 * Run: node agent/extensions/tests/test-instance-widget.mjs
 */

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// findTaskDir searches PROJECT_PATH before cwd, which would make the test read
// this machine's real backlog instead of the fixture.
delete process.env.PROJECT_PATH;
// The claim file must land in the fixture, never in the live sandbox folder.
const signalDir = mkdtempSync(join(tmpdir(), "instance-widget-signal-"));
process.env.SMOLVM_SIGNAL_PATH = signalDir;

const CSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
const strip = (text) => text.replace(CSI, "");
const theme = { fg: (_color, text) => `\x1b[38;5;10m${text}\x1b[0m` };

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
      setWidget(key, content, opts) {
        widgets.set(key, { content, opts });
      },
      notify(message, type) {
        notices.push({ message, type });
      },
    },
  };
}

const fire = (name, event, ctx) =>
  Promise.all((handlers[name] ?? []).map((handler) => handler(event, ctx)));

const content = () => widgets.get("instance")?.content;

function renderLines(width = 80) {
  const factory = content();
  if (factory === undefined) return undefined;
  return factory(null, theme).render(width);
}

const plainLines = (width = 80) => (renderLines(width) ?? []).map(strip);

const claimId = () => {
  try {
    return readFileSync(join(signalDir, "task"), "utf-8").trim();
  } catch {
    return null;
  }
};

const cleanups = [];

function taskBody(id, status, title) {
  // The heading deliberately disagrees: frontmatter is the source of truth.
  return [
    "---",
    `id: ${id}`,
    `title: ${title}`,
    `status: "${status}"`,
    "---",
    "",
    `# Task ${id} - heading must lose to frontmatter`,
    "",
  ].join("\n");
}

function makeProject() {
  const project = mkdtempSync(join(tmpdir(), "instance-widget-project-"));
  cleanups.push(project);
  mkdirSync(join(project, "backlog/tasks"), { recursive: true });
  writeFileSync(join(project, "backlog/config.yml"), 'statuses: ["To Do", "In Progress", "Done"]\n');
  writeFileSync(join(project, "backlog/tasks/pi-101 - demo task.md"), taskBody("PI-101", "In Progress", "demo task"));
  writeFileSync(join(project, "backlog/tasks/pi-202 - second task.md"), taskBody("PI-202", "In Progress", "second task"));
  return project;
}

function makeWorktree() {
  const root = mkdtempSync(join(tmpdir(), "instance-widget-wt-"));
  cleanups.push(root);
  mkdirSync(join(root, ".bare"), { recursive: true });
  mkdirSync(join(root, "feature-x"), { recursive: true });
  writeFileSync(join(root, ".git"), "gitdir: ./.bare\n");
  return root;
}

// ── Two tasks running, this instance claims one of them ───────────────────────

const project = makeProject();
const tasksDir = join(project, "backlog/tasks");
const root = makeWorktree();
process.chdir(root);

const { default: extension, GIT_WT_CONTEXT } = await import("../instance-widget.ts");
extension(pi);

assert.ok(handlers.session_start?.length, "session_start registered");
assert.ok(handlers.tool_call?.length, "tool_call registered");
assert.ok(handlers.tool_result?.length, "tool_result registered");

await fire("session_start", {}, makeCtx(project));

assert.equal(widgets.get("instance").opts.placement, "aboveEditor", "widget sits above the editor");
assert.deepEqual(plainLines(), ["🌿 git-wt: project root"], "no claim means no task line");
assert.ok(
  notices.some((n) => n.message.includes("git-wt repo detected")),
  "startup announces the worktree",
);

const prompt = await handlers.before_agent_start[0]({ systemPrompt: "base" });
assert.ok(prompt.systemPrompt.includes(GIT_WT_CONTEXT), "git-wt context injected");
assert.match(prompt.systemPrompt, /git worktree list --porcelain/, "ground-truth command named");
assert.ok(prompt.systemPrompt.includes(".bare"), "bare repo defined");
assert.match(prompt.systemPrompt, /sibling worktree/, "sibling worktree defined");
assert.ok(!prompt.systemPrompt.includes("Load the git-wt skill"), "dead skill pointer gone");

await fire(
  "tool_result",
  { toolName: "bash", input: { command: 'backlog task edit PI-202 -s "In Progress"' }, isError: false },
  makeCtx(project),
);
assert.deepEqual(
  plainLines(),
  ["📋 PI-202 — second task", "🌿 git-wt: project root"],
  "the claimed task wins over the other running task",
);
assert.equal(claimId(), "PI-202", "claim written to the signal folder");

await fire("tool_result", { toolName: "bash", input: { command: "ls" }, isError: false }, makeCtx(project));
assert.equal(plainLines()[0], "📋 PI-202 — second task", "unrelated result leaves the line alone");

await fire(
  "tool_result",
  { toolName: "mcp__backlog__task_edit", input: { id: "pi-101", status: "In Progress" }, isError: false },
  makeCtx(project),
);
assert.equal(plainLines()[0], "📋 PI-101 — demo task", "an mcp claim takes over");
assert.equal(claimId(), "PI-101", "the signal folder follows the mcp claim");

await fire(
  "tool_result",
  { toolName: "mcp__backlog__task_edit", input: { id: "PI-101", status: "Done" }, isError: false },
  makeCtx(project),
);
assert.deepEqual(plainLines(), ["🌿 git-wt: project root"], "task finished elsewhere means no task line");
assert.equal(claimId(), null, "cleared claim removes the file");

await fire(
  "tool_result",
  { toolName: "mcp__backlog__task_edit", input: {}, isError: true },
  makeCtx(project),
);
assert.deepEqual(plainLines(), ["🌿 git-wt: project root"], "a failed backlog call changes nothing");

await fire(
  "tool_result",
  { toolName: "bash", input: { command: 'backlog task edit --status="In Progress" PI-202' }, isError: false },
  makeCtx(project),
);
assert.equal(claimId(), "PI-202", "an id after a glued status flag claims the real task");

await fire(
  "tool_result",
  { toolName: "bash", input: { command: 'backlog task edit PI-202 --final-summary "keeps a glued --status flag"' }, isError: false },
  makeCtx(project),
);
assert.equal(claimId(), "PI-202", "prose mentioning --status leaves the claim alone");
assert.match(plainLines()[0], /PI-202/, "the line survives a summary that mentions --status");

await fire("tool_call", { toolName: "bash", input: { command: "cd feature-x" } }, makeCtx(project));
assert.match(plainLines().at(-1), /feature-x/, "worktree line follows cd");

// ── Clamping to the width the widget is given ─────────────────────────────────

writeFileSync(join(tasksDir, "pi-202 - second task.md"), taskBody("PI-202", "In Progress", "a task title that runs well past any reasonable terminal width"));
await fire(
  "tool_result",
  { toolName: "mcp__backlog__task_edit", input: { id: "PI-202", status: "In Progress" }, isError: false },
  makeCtx(project),
);

const wide = renderLines(200);
assert.equal(wide.length, 2, "wide widget shows task and worktree");
assert.ok(wide.every((line) => !line.includes("…")), "a line that fits is not cut");

const narrow = renderLines(16);
assert.equal(narrow.length, 2, "narrow widget still shows both lines");
assert.ok(narrow.every((line) => [...strip(line)].length <= 16), "every line fits 16 columns");
assert.ok(narrow.every((line) => strip(line).endsWith("…")), "the cut is marked with an ellipsis");
assert.ok(narrow.every((line) => line.endsWith("\x1b[0m")), "the cut closes the colour reset");

// ── A restarted pane picks its own task back up ───────────────────────────────

assert.equal(claimId(), "PI-202", "claim file holds the running task");

const freshHandlers = {};
const freshWidgets = new Map();
const fresh = (await import(`../instance-widget.ts?fresh=${Date.now()}`)).default;
fresh({
  on(name, fn) {
    (freshHandlers[name] ??= []).push(fn);
  },
  registerTool() {},
  registerCommand() {},
});
await Promise.all(
  freshHandlers.session_start.map((handler) =>
    handler({}, {
      cwd: project,
      ui: {
        theme,
        setWidget(key, widgetContent, opts) {
          freshWidgets.set(key, { content: widgetContent, opts });
        },
        notify() {},
      },
    }),
  ),
);
const restored = freshWidgets.get("instance").content(null, theme).render(80).map(strip);
assert.deepEqual(
  restored,
  [
    "📋 PI-202 — a task title that runs well past any reasonable terminal width",
    "🌿 git-wt: project root",
  ],
  "restarted pane shows its own task",
);

// ── No backlog and no worktree: the key goes away ────────────────────────────

const plain = mkdtempSync(join(tmpdir(), "instance-widget-plain-"));
cleanups.push(plain);
process.chdir(plain);

const idleHandlers = {};
const idleWidgets = new Map();
const idle = (await import(`../instance-widget.ts?idle=${Date.now()}`)).default;
idle({
  on(name, fn) {
    (idleHandlers[name] ??= []).push(fn);
  },
  registerTool() {},
  registerCommand() {},
});
const idlePrompt = await idleHandlers.before_agent_start[0]({ systemPrompt: "base" });
assert.equal(idlePrompt, undefined, "no guidance outside a git-wt repo");
const emptyProject = mkdtempSync(join(tmpdir(), "instance-widget-empty-"));
cleanups.push(emptyProject);
await Promise.all(
  idleHandlers.session_start.map((handler) =>
    handler({}, {
      cwd: emptyProject,
      ui: {
        theme,
        setWidget(key, widgetContent, opts) {
          idleWidgets.set(key, { content: widgetContent, opts });
        },
        notify() {},
      },
    }),
  ),
);
assert.equal(idleWidgets.get("instance").content, undefined, "no sources means no widget");

for (const dir of cleanups) rmSync(dir, { recursive: true, force: true });
rmSync(signalDir, { recursive: true, force: true });
console.log("instance-widget => ok");
