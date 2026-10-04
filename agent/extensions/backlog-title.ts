/**
 * backlog-title.ts — the terminal title shows the active Backlog task.
 *
 * The agent moves a task to In Progress through the backlog CLI, through the
 * backlog MCP server, or through a codemode script. One pair of handlers sees
 * all three routes, because nested executeTool calls raise the same tool_call
 * and tool_result events. The title changes only on a successful tool_result,
 * so a failed backlog command leaves the title alone. Prompt text never
 * reaches these handlers, so a prompt that quotes a backlog command changes
 * nothing.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { basename } from "node:path";

const ACTIVE_STATUS = "in progress";

// pi builds its own title as APP_TITLE, then the session name, then the cwd
// basename. APP_TITLE is "π" unless the pi package sets piConfig.name.
const PI_TITLE = "π";

export interface TaskChange {
  id: string;
  status: string;
}

function normalize(status: string): string {
  return status.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeId(id: string): string {
  return id.trim().toUpperCase();
}

function tokenize(text: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push(m[1] ?? m[2] ?? m[3]);
  }
  return out;
}

function statusOf(segment: string): string | undefined {
  const m = /(?:^|\s)(?:-s|--status)(?:=|\s+)(?:"([^"]*)"|'([^']*)'|(\S+))/.exec(segment);
  return m ? (m[1] ?? m[2] ?? m[3]) : undefined;
}

/** Parse `backlog task edit <id> -s <status>` out of a bash command line. */
export function parseEditCommand(command: string): TaskChange | null {
  const segments = command.split(/&&|\|\|[;|\n]/);
  for (const segment of segments) {
    const tokens = tokenize(segment);
    if (tokens[0] !== "backlog" || tokens[1] !== "task" || tokens[2] !== "edit") continue;

    const status = statusOf(segment);
    if (!status) return null;

    const id = tokens.slice(3).find((t) => !t.startsWith("-") && t !== status);
    if (!id) return null;
    return { id: normalizeId(id), status: normalize(status) };
  }
  return null;
}

/** Parse the backlog MCP task_edit tool arguments. */
export function parseMcpEdit(
  toolName: string,
  input: Record<string, unknown>
): TaskChange | null {
  if (toolName !== "mcp__backlog__task_edit") return null;
  const { id, status } = input;
  if (typeof id !== "string" || typeof status !== "string") return null;
  return { id: normalizeId(id), status: normalize(status) };
}

/** One entry point for every route that can move a task. */
export function changeFor(toolName: string, input: unknown): TaskChange | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  if (toolName === "bash" && typeof record.command === "string") {
    return parseEditCommand(record.command);
  }
  return parseMcpEdit(toolName, record);
}

/**
 * The next title for a change, or null when the title must stay as it is.
 * Only the task that owns the current title can clear it.
 */
export function nextTitle(
  change: TaskChange,
  activeId: string | null,
  defaultTitle: string
): { title: string; activeId: string | null } | null {
  if (change.status === ACTIVE_STATUS) {
    return { title: change.id, activeId: change.id };
  }
  if (change.id === activeId) {
    return { title: defaultTitle, activeId: null };
  }
  return null;
}

/** pi's own title, so a finished task hands the pane back to pi. */
export function defaultTitle(ctx: {
  cwd: string;
  sessionManager: { getSessionName(): string | undefined };
}): string {
  const name = ctx.sessionManager.getSessionName();
  const dir = basename(ctx.cwd);
  return name ? `${PI_TITLE} - ${name} - ${dir}` : `${PI_TITLE} - ${dir}`;
}

export default function (pi: ExtensionAPI) {
  const pending = new Map<string, TaskChange>();
  let activeId: string | null = null;

  pi.on("tool_call", (event) => {
    const change = changeFor(event.toolName, event.input);
    if (change) pending.set(event.toolCallId, change);
  });

  pi.on("tool_result", (event, ctx) => {
    const change = pending.get(event.toolCallId) ?? changeFor(event.toolName, event.input);
    pending.delete(event.toolCallId);
    if (!change || event.isError) return;

    const next = nextTitle(change, activeId, defaultTitle(ctx));
    if (!next) return;
    activeId = next.activeId;
    if (typeof ctx.ui?.setTitle === "function") ctx.ui.setTitle(next.title);
  });
}
