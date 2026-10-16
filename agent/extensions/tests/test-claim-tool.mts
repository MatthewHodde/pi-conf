import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

// findTaskDir searches PROJECT_PATH before cwd; drop it so the fixture is used.
delete process.env.PROJECT_PATH;
const signalDir = mkdtempSync(join(tmpdir(), "claim-tool-signal-"));
process.env.SMOLVM_SIGNAL_PATH = signalDir;

import { CLAIM_TOOL, taskExists } from "../lib/claim.ts";
import backlogTitleExt, { changeFor, nextTitle } from "../backlog-title.ts";
import widgetExt from "../instance-widget.ts";
import claimToolExt from "../claim-tool.ts";

let failed = 0;
function check(name: string, cond: boolean, got?: unknown) {
  if (cond) console.log(`ok   ${name}`);
  else {
    failed++;
    console.log(`FAIL ${name}${got === undefined ? "" : ` got ${JSON.stringify(got)}`}`);
  }
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ── Fixture backlog ───────────────────────────────────────────────────────────

function makeProject(id: string, status: string) {
  const project = mkdtempSync(join(tmpdir(), "claim-tool-project-"));
  mkdirSync(join(project, "backlog/tasks"), { recursive: true });
  writeFileSync(join(project, "backlog/config.yml"), 'statuses: ["To Do", "In Progress", "Done"]\n');
  writeFileSync(taskFile(project, id), taskBody(id, "claim fixture", status));
  return project;
}
function taskFile(project: string, id: string) {
  return join(project, "backlog/tasks", `${id.toLowerCase()} - claim fixture.md`);
}
function taskBody(id: string, title: string, status: string) {
  return ["---", `id: ${id}`, `title: ${title}`, `status: "${status}"`, "---", ""].join("\n");
}
function setStatus(project: string, id: string, status: string) {
  writeFileSync(taskFile(project, id), taskBody(id, "claim fixture", status));
}
function statusOf(project: string, id: string): string | null {
  const m = /status:\s*"(.+?)"/.exec(readFileSync(taskFile(project, id), "utf-8"));
  return m ? m[1] : null;
}
const claimFile = () => join(signalDir, "task");
const readClaim = () => {
  try {
    return readFileSync(claimFile(), "utf-8").trim();
  } catch {
    return null;
  }
};

// ── AC: taskExists ────────────────────────────────────────────────────────────

const p = makeProject("PI-067", "To Do");
check("taskExists finds a task whatever its status", taskExists(join(p, "backlog/tasks"), "PI-067"));
check("taskExists is case-insensitive", taskExists(join(p, "backlog/tasks"), "pi-067"));
check("taskExists rejects an unknown id", !taskExists(join(p, "backlog/tasks"), "PI-999"));

// ── AC: changeFor / nextTitle recognize the claim tool ────────────────────────

check(
  "changeFor maps a claim to in progress",
  same(changeFor(CLAIM_TOOL, { action: "claim", id: "pi-067" }), {
    id: "PI-067",
    status: "in progress",
  })
);
check(
  "changeFor maps a release to released",
  same(changeFor(CLAIM_TOOL, { action: "release" }), { id: "", status: "released" })
);
check("changeFor rejects a claim without an id", changeFor(CLAIM_TOOL, { action: "claim" }) === null);
check(
  "changeFor still ignores an unrelated tool",
  changeFor("read", { path: "/x" }) === null
);
check(
  "nextTitle clears on a released status",
  same(nextTitle({ id: "", status: "released" }, "PI-067", "π - proj"), {
    title: "π - proj",
    activeId: null,
  })
);

// ── The tool ──────────────────────────────────────────────────────────────────

interface Recorded { command: string; args: string[] }
function makeExec(project: string, calls: Recorded[]) {
  return async (command: string, args: string[]) => {
    calls.push({ command, args });
    if (command === "backlog" && args[0] === "task" && args[1] === "edit") {
      setStatus(project, args[2], args[4]);
      return { stdout: "", stderr: "", code: 0, killed: false };
    }
    return { stdout: "", stderr: "unexpected command", code: 1, killed: false };
  };
}

const tools: any[] = [];
claimToolExt({ on() {}, registerTool: (t: any) => tools.push(t), registerCommand() {} } as never);
const claimTool = tools.find((t) => t.name === CLAIM_TOOL);
check("claim_tool is registered", !!claimTool);

const runTool = (project: string, exec: any, params: unknown) =>
  claimTool.execute("call-1", params, undefined, undefined, { cwd: project, exec });

// AC6: a claim without an id fails and runs no command.
{
  const calls: Recorded[] = [];
  const res = await runTool(p, makeExec(p, calls), { action: "claim" });
  check("claim without an id is an error", res.isError === true, res);
  check("claim without an id runs no command", calls.length === 0, calls);
}

// AC6: a claim for an unknown id fails, changes no status, and runs no command.
{
  const calls: Recorded[] = [];
  const res = await runTool(p, makeExec(p, calls), { action: "claim", id: "PI-999" });
  check("claim of an unknown id is an error", res.isError === true, res);
  check("claim of an unknown id runs no command", calls.length === 0, calls);
}

// AC2/AC3: a valid claim issues the In Progress transition itself.
{
  const calls: Recorded[] = [];
  const res = await runTool(p, makeExec(p, calls), { action: "claim", id: "pi-067" });
  check("valid claim succeeds", res.isError !== true, res);
  check(
    "valid claim runs the status transition itself",
    same(calls, [{ command: "backlog", args: ["task", "edit", "PI-067", "-s", "In Progress"] }]),
    calls
  );
  check("valid claim moves the task to In Progress", statusOf(p, "PI-067") === "In Progress");
}

// AC4: release succeeds and runs no command.
{
  const calls: Recorded[] = [];
  const res = await runTool(p, makeExec(p, calls), { action: "release" });
  check("release succeeds", res.isError !== true, res);
  check("release runs no command", calls.length === 0, calls);
}

// ── End to end: the tool's result drives the title, widget, and claim file ────

const theme = { fg: (_c: string, text: string) => `\x1b[38;5;10m${text}\x1b[0m` };
const strip = (text: string) => text.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "");

function boot(project: string) {
  const handlers: Record<string, Function[]> = {};
  const titles: string[] = [];
  const widgets = new Map<string, any>();
  const pi = {
    on(name: string, fn: Function) {
      (handlers[name] ??= []).push(fn);
      return () => {};
    },
    registerTool() {},
    registerCommand() {},
  };
  backlogTitleExt(pi as never);
  widgetExt(pi as never);
  const ctx = {
    cwd: project,
    sessionManager: { getSessionName: () => undefined },
    ui: {
      theme,
      setTitle: (t: string) => titles.push(t),
      setWidget: (k: string, content: any) => widgets.set(k, content),
      notify: () => {},
    },
  };
  const emit = async (name: string, event: any) => {
    for (const fn of handlers[name] ?? []) await fn(event, ctx);
  };
  const lines = () => {
    const factory = widgets.get("instance");
    return factory === undefined ? [] : factory(null, theme).render(80).map(strip);
  };
  return { emit, titles, lines, ctx };
}

const e2e = makeProject("PI-067", "To Do");
rmSync(claimFile(), { force: true });
const app = boot(e2e);
await app.emit("session_start", { type: "session_start" });

const fireToolResult = async (input: any, isError = false) => {
  await app.emit("tool_call", { type: "tool_call", toolCallId: "c1", toolName: CLAIM_TOOL, input });
  await app.emit("tool_result", {
    type: "tool_result",
    toolCallId: "c1",
    toolName: CLAIM_TOOL,
    input,
    content: [],
    isError,
  });
};

// The tool runs the transition (mock exec flips the fixture status), then its
// tool_result flows through both surface handlers.
const e2eCalls: Recorded[] = [];
await runTool(e2e, makeExec(e2e, e2eCalls), { action: "claim", id: "PI-067" });
await fireToolResult({ action: "claim", id: "PI-067" });

check("claim sets the terminal title to the task id", same(app.titles, ["PI-067"]), app.titles);
check("claim writes the claim file", readClaim() === "PI-067", readClaim());
check(
  "claim shows the task on the widget",
  app.lines().some((l: string) => l.includes("PI-067")),
  app.lines()
);

// Release clears the surfaces but leaves the task's status alone.
await runTool(e2e, makeExec(e2e, e2eCalls), { action: "release" });
await fireToolResult({ action: "release" });

check("release clears the claim file", readClaim() === null, readClaim());
check(
  "release restores the default title",
  same(app.titles, ["PI-067", `π - ${basename(e2e)}`]),
  app.titles
);
check(
  "release removes the task from the widget",
  !app.lines().some((l: string) => l.includes("PI-067")),
  app.lines()
);
check("release leaves the task status unchanged", statusOf(e2e, "PI-067") === "In Progress");

// AC5: the interception route and the claim tool share one claim. After the
// tool claims PI-067, a bash `backlog task edit PI-067 -s "Done"` seen through
// the interception clears that same claim, proving both routes drive one state.
rmSync(claimFile(), { force: true });
const shared = boot(e2e);
await shared.emit("session_start", { type: "session_start" });
await runTool(e2e, makeExec(e2e, []), { action: "claim", id: "PI-067" });
await shared.emit("tool_call", { type: "tool_call", toolCallId: "s1", toolName: CLAIM_TOOL, input: { action: "claim", id: "PI-067" } });
await shared.emit("tool_result", { type: "tool_result", toolCallId: "s1", toolName: CLAIM_TOOL, input: { action: "claim", id: "PI-067" }, content: [], isError: false });
check("tool claim sets the shared claim", readClaim() === "PI-067", readClaim());
const doneCommand = `backlog task edit PI-067 -s "Done"`;
await shared.emit("tool_call", { type: "tool_call", toolCallId: "d1", toolName: "bash", input: { command: doneCommand } });
await shared.emit("tool_result", { type: "tool_result", toolCallId: "d1", toolName: "bash", input: { command: doneCommand }, content: [], isError: false });
check("intercepted Done clears the tool-set claim", readClaim() === null, readClaim());
check("intercepted Done resets the tool-set title", shared.titles.at(-1) === `π - ${basename(e2e)}`, shared.titles);

// A failed claim (error result) never touches the claim or the surfaces.
rmSync(claimFile(), { force: true });
const bad = boot(e2e);
await bad.emit("session_start", { type: "session_start" });
await bad.emit("tool_result", {
  type: "tool_result",
  toolCallId: "c2",
  toolName: CLAIM_TOOL,
  input: { action: "claim", id: "PI-999" },
  content: [],
  isError: true,
});
check("a failed claim leaves the claim file empty", readClaim() === null, readClaim());
check("a failed claim leaves the title alone", same(bad.titles, []), bad.titles);

console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
