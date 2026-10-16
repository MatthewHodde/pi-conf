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
import { CLAIM_TOOL, findRunningTask, findTaskDir, loadClaim } from "./lib/claim.ts";

const ACTIVE_STATUS = "in progress";
// The claim_task tool's release action: an instance dropping its own claim.
const RELEASED_STATUS = "released";

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

interface Token {
  text: string;
  quoted: boolean;
}

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  const re = /(?:"[^"]*"|'[^']*'|\S)+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const token = m[0];
    const quote = token[0];
    const quoted =
      token.length > 1 && (quote === '"' || quote === "'") && token.endsWith(quote);
    out.push({ text: quoted ? token.slice(1, -1) : token, quoted });
  }
  return out;
}

function statusOf(tokens: Token[]): string | undefined {
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    // A quoted word is prose even when it is spelled like the flag.
    if (token.quoted) continue;
    let value: string | undefined;
    if (token.text === "-s" || token.text === "--status") {
      value = tokens[i + 1]?.text;
    } else if (token.text.startsWith("-s=") || token.text.startsWith("--status=")) {
      value = token.text.slice(token.text.indexOf("=") + 1);
    }
    if (value === undefined) continue;
    if (
      value.length > 1 &&
      (value.startsWith('"') || value.startsWith("'")) &&
      value.endsWith(value[0])
    ) {
      value = value.slice(1, -1);
    }
    return value;
  }
  return undefined;
}

/** Parse `backlog task edit <id> -s <status>` out of a bash command line. */
export function parseEditCommand(command: string): TaskChange | null {
  const segments = command.split(/&&|\|\|[;|\n]/);
  for (const segment of segments) {
    const tokens = tokenize(segment);
    const words = tokens.map((t) => t.text);
    // "tasks" is a real alias of the "task" command group.
    const taskGroup = words[1] === "task" || words[1] === "tasks";
    if (words[0] !== "backlog" || !taskGroup || words[2] !== "edit") continue;

    const status = statusOf(tokens);
    if (!status) continue;

    const id = words.slice(3).find((t) => !t.startsWith("-") && t !== status);
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

/** One entry point for every route that can move a task or change a claim. */
export function changeFor(toolName: string, input: unknown): TaskChange | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  if (toolName === "bash" && typeof record.command === "string") {
    return parseEditCommand(record.command);
  }
  // The explicit claim tool: structured params, not a parsed command string.
  if (toolName === CLAIM_TOOL && typeof record.action === "string") {
    if (record.action === "release") return { id: "", status: RELEASED_STATUS };
    if (record.action === "claim" && typeof record.id === "string" && record.id.trim()) {
      return { id: normalizeId(record.id), status: ACTIVE_STATUS };
    }
    return null;
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
  // A release drops this instance's claim whoever holds it.
  if (change.status === RELEASED_STATUS) {
    return { title: defaultTitle, activeId: null };
  }
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
  let restoreTimer: ReturnType<typeof setTimeout> | null = null;

  // A restarted pane gets its ticket back from the claim file, but only while
  // that task is still running here. The widget drops a claim that is not.
  const applyClaimedTitle = (ctx: { ui?: { setTitle?(title: string): void } }) => {
    if (!activeId) return;
    if (typeof ctx.ui?.setTitle === "function") ctx.ui.setTitle(activeId);
  };

  pi.on("session_start", async (_event, ctx) => {
    const claimed = loadClaim();
    if (!claimed) return;
    const taskDir = findTaskDir(ctx.cwd);
    const task = taskDir ? findRunningTask(taskDir, claimed) : null;
    if (!task) return;
    activeId = task.id;
    applyClaimedTitle(ctx);
    // pi rewrites the title while startup finishes, right after session_start.
    // Put the ticket back once that has settled.
    if (restoreTimer) clearTimeout(restoreTimer);
    restoreTimer = setTimeout(() => {
      restoreTimer = null;
      applyClaimedTitle(ctx);
    }, 750);
  });

  // pi writes its own title while session info settles, after session_start.
  pi.on("session_info_changed", async (_event, ctx) => {
    applyClaimedTitle(ctx);
  });

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
