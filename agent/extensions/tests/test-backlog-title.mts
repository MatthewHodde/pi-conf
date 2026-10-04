import extension, {
  changeFor,
  defaultTitle,
  nextTitle,
  parseEditCommand,
} from "../backlog-title.ts";

let failed = 0;
function check(name: string, cond: boolean, got?: unknown) {
  if (cond) console.log(`ok   ${name}`);
  else {
    failed++;
    console.log(`FAIL ${name}${got === undefined ? "" : ` got ${JSON.stringify(got)}`}`);
  }
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// AC7: the backlog command parser
const edits: [string, unknown][] = [
  ['backlog task edit TASK-017.01 -s "In Progress"', { id: "TASK-017.01", status: "in progress" }],
  ["cd /x && backlog task edit task-017.02 --status Done --plain", { id: "TASK-017.02", status: "done" }],
  ['backlog task edit -s "To Do" task-017.03', { id: "TASK-017.03", status: "to do" }],
  ['backlog task edit TASK-017 --status="In  Progress"', { id: "TASK-017", status: "in progress" }],
  ['backlog task edit TASK-017 --title "ship it"', null],
  ["backlog task list --status 'In Progress'", null],
  ["backlog task view TASK-017", null],
  ["echo backlog task edit TASK-017 -s Done", null],
];
for (const [command, want] of edits) {
  const got = parseEditCommand(command);
  check(`parse ${command}`, same(got, want), got);
}

check(
  "MCP task_edit parsed",
  same(changeFor("mcp__backlog__task_edit", { id: "task-017.02", status: "In Progress" }), {
    id: "TASK-017.02",
    status: "in progress",
  })
);
check("MCP task_list ignored", changeFor("mcp__backlog__task_list", { status: "Done" }) === null);
check("no input ignored", changeFor("bash", undefined) === null);

// Only the task that owns the title can clear it.
check(
  "In Progress claims the title",
  same(nextTitle({ id: "TASK-017", status: "in progress" }, null, "π - proj"), {
    title: "TASK-017",
    activeId: "TASK-017",
  })
);
check(
  "Done on the active task restores the default",
  same(nextTitle({ id: "TASK-017", status: "done" }, "TASK-017", "π - proj"), {
    title: "π - proj",
    activeId: null,
  })
);
check(
  "Done on another task keeps the title",
  nextTitle({ id: "TASK-099", status: "done" }, "TASK-017", "π - proj") === null
);
check(
  "default title carries the session name",
  defaultTitle({
    cwd: "/home/u/proj",
    sessionManager: { getSessionName: () => "plan" },
  }) === "π - plan - proj"
);
check(
  "default title falls back to the cwd",
  defaultTitle({ cwd: "/home/u/proj", sessionManager: { getSessionName: () => undefined } }) ===
    "π - proj"
);

// ── The handlers ──────────────────────────────────────────────────────────────

type Handler = (event: any, ctx: any) => unknown;

function boot() {
  const handlers: Record<string, Handler[]> = {};
  const titles: string[] = [];
  extension({
    on(name: string, fn: Handler) {
      (handlers[name] ??= []).push(fn);
      return () => {};
    },
    registerTool() {},
    registerCommand() {},
  } as never);
  const ctx = {
    cwd: "/home/u/proj",
    sessionManager: { getSessionName: () => undefined },
    ui: { setTitle: (t: string) => titles.push(t) },
  };
  const emit = async (name: string, event: any) => {
    for (const fn of handlers[name] ?? []) await fn(event, ctx);
  };
  const bashEdit = async (id: string, status: string, isError = false) => {
    const command = `backlog task edit ${id} -s "${status}"`;
    await emit("tool_call", {
      type: "tool_call",
      toolCallId: `${id}-${status}`,
      toolName: "bash",
      input: { command },
    });
    await emit("tool_result", {
      type: "tool_result",
      toolCallId: `${id}-${status}`,
      toolName: "bash",
      input: { command },
      content: [],
      isError,
    });
  };
  return { handlers, titles, emit, bashEdit, ctx };
}

// AC1: the title shows the task the agent moved to In Progress
const first = boot();
await first.bashEdit("task-017.01", "In Progress");
check("bash edit sets the task id as title", same(first.titles, ["TASK-017.01"]), first.titles);

// AC8: a failed backlog command leaves the title alone
await first.bashEdit("task-017.02", "In Progress", true);
check("failed backlog command leaves the title alone", same(first.titles, ["TASK-017.01"]), first.titles);

// AC3: Done hands the pane back to pi
await first.bashEdit("task-017.01", "Done");
check(
  "Done restores the pi default title",
  same(first.titles, ["TASK-017.01", "π - proj"]),
  first.titles
);

// AC10: one handler pair covers the MCP route and the codemode route
const mcp = boot();
await mcp.emit("tool_call", {
  type: "tool_call",
  toolCallId: "m1",
  toolName: "mcp__backlog__task_edit",
  input: { id: "TASK-017.02", status: "In Progress" },
});
await mcp.emit("tool_result", {
  type: "tool_result",
  toolCallId: "m1",
  toolName: "mcp__backlog__task_edit",
  input: { id: "TASK-017.02", status: "In Progress" },
  content: [],
  isError: false,
});
check("MCP task_edit sets the task id as title", same(mcp.titles, ["TASK-017.02"]), mcp.titles);

await mcp.emit("tool_call", {
  type: "tool_call",
  toolCallId: "nested/1",
  parentToolCallId: "nested",
  toolName: "bash",
  input: { command: "backlog task edit TASK-017.03 -s 'In Progress'" },
});
await mcp.emit("tool_result", {
  type: "tool_result",
  toolCallId: "nested/1",
  parentToolCallId: "nested",
  toolName: "bash",
  input: { command: "backlog task edit TASK-017.03 -s 'In Progress'" },
  content: [],
  isError: false,
});
check("codemode nested call sets the task id as title", same(mcp.titles, ["TASK-017.02", "TASK-017.03"]), mcp.titles);

// AC2: prompt text alone never changes the title
const prompt = boot();
const backlogPrompt = 'please run backlog task edit TASK-017.01 -s "In Progress" and stop';
for (const name of Object.keys(prompt.handlers)) {
  if (name === "tool_call" || name === "tool_result") continue;
  await prompt.emit(name, { type: name, message: backlogPrompt, text: backlogPrompt });
}
check("prompt text never changes the title", same(prompt.titles, []), prompt.titles);
await prompt.bashEdit("task-017.04", "In Progress");
check("the same extension still reacts to tool results", same(prompt.titles, ["TASK-017.04"]), prompt.titles);

// AC4: several instances in one project track their own task
const a = boot();
const b = boot();
await a.bashEdit("task-017.01", "In Progress");
await b.bashEdit("task-017.05", "In Progress");
check("each instance tracks its own task", same(a.titles, ["TASK-017.01"]) && same(b.titles, ["TASK-017.05"]), {
  a: a.titles,
  b: b.titles,
});

console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
