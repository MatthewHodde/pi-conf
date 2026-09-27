/**
 * backlog-footer.ts — Backlog.md footer display
 *
 * Shows active (In Progress) task in status bar.
 * Enforcement handled by backlog MCP server.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// ── Types ──────────────────────────────────────────────────────────────────────

interface ActiveTask {
  id: string;
  title: string;
}

// ── Config ─────────────────────────────────────────────────────────────────────

const CONFIG_CANDIDATES = [
  "backlog/config.yml",
  "backlog/backlog.config.yml",
  ".backlog/config.yml",
  "backlog.config.yml",
];

const TASK_DIR_CANDIDATES = ["backlog/tasks", ".backlog/tasks"];

// ── Helpers ────────────────────────────────────────────────────────────────────

function findTaskDir(cwd: string): string | null {
  const raw = [process.env.PROJECT_PATH, cwd];
  const searchPaths = [...new Set(raw.filter((p): p is string => !!p))];

  for (const base of searchPaths) {
    for (const config of CONFIG_CANDIDATES) {
      if (existsSync(join(base, config))) {
        return join(base, "backlog/tasks");
      }
    }
    for (const taskDir of TASK_DIR_CANDIDATES) {
      if (existsSync(join(base, taskDir))) return join(base, taskDir);
    }
  }
  return null;
}

function listTaskFiles(taskDir: string): string[] {
  try {
    return readdirSync(taskDir).filter((f) => f.endsWith(".md"));
  } catch {
    return [];
  }
}

function readTaskStatus(taskDir: string, filename: string): string | null {
  try {
    const content = readFileSync(join(taskDir, filename), "utf-8");
    const match = content.match(/^status:\s*["']?(.+?)["']?\s*$/m);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

function findActiveTask(taskDir: string): ActiveTask | null {
  const files = listTaskFiles(taskDir);

  for (const file of files) {
    const status = readTaskStatus(taskDir, file);
    if (!status || status.toLowerCase() !== "in progress") continue;

    const idMatch = file.match(/^((?:pi|task)-\d+)/i);
    const id = idMatch
      ? idMatch[1].toUpperCase()
      : file.replace(/\.md$/, "").split(" - ")[0];

    try {
      const content = readFileSync(join(taskDir, file), "utf-8");
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const title = titleMatch
        ? titleMatch[1].replace(/^Task\s+\S+\s*-\s*/i, "")
        : file.replace(/\.md$/, "").split(" - ").slice(1).join(" - ").trim();
      return { id, title: title || "Untitled" };
    } catch {
      return { id, title: "Untitled" };
    }
  }
  return null;
}

// ── Extension ──────────────────────────────────────────────────────────────────

const WIDGET_KEY = "backlog";
const FOOTER_REFRESH_MS = 50;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UIContext = any;

export default function (pi: ExtensionAPI) {
  let taskDir: string | null = null;
  let activeTask: ActiveTask | null = null;
  let lastCtx: UIContext | null = null;

  function refreshActiveTask() {
    if (!taskDir) {
      activeTask = null;
      return;
    }
    activeTask = findActiveTask(taskDir);
  }

  function renderWidget() {
    if (!lastCtx) return;

    if (!activeTask) {
      lastCtx.ui.setWidget(WIDGET_KEY, [], { placement: "aboveEditor" });
      return;
    }

    const theme = lastCtx.ui.theme;
    const text = theme.fg("success", `📋 ${activeTask.id} — ${activeTask.title}`);
    lastCtx.ui.setWidget(WIDGET_KEY, [text], { placement: "aboveEditor" });
  }

  function scheduleWidgetRefresh() {
    setTimeout(() => {
      refreshActiveTask();
      renderWidget();
    }, FOOTER_REFRESH_MS);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    lastCtx = ctx;
    taskDir = findTaskDir(ctx.cwd);

    if (taskDir) {
      refreshActiveTask();
      renderWidget();
    }
  });

  // ── Refresh after MCP edits ───────────────────────────────────────────────

  pi.on("tool_call", async (event) => {
    // Refresh widget after any backlog MCP tool call
    if (event.toolName.startsWith("mcp_backlog_")) {
      scheduleWidgetRefresh();
    }
  });
}
