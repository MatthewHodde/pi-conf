/**
 * backlog-guard.ts — Pi extension for Backlog.md integration
 *
 * Responsibilities:
 * - Detect Backlog.md projects and inject context into system prompt
 * - Show task count notification on session start
 * - Display active (In Progress) task in status bar footer
 * - Enforce task lifecycle: block content edits unless In Progress
 * - Allow finalization commands (agent gets user approval via ask_user first)
 * - Block agent-initiated `backlog init`
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// ── Types ──────────────────────────────────────────────────────────────────────

interface BacklogProject {
  detected: boolean;
  taskDir: string | null;
  projectName: string | null;
}

interface ActiveTask {
  id: string;
  title: string;
}

// ── Detection ──────────────────────────────────────────────────────────────────

const CONFIG_CANDIDATES = [
  "backlog/config.yml",
  "backlog/backlog.config.yml",
  ".backlog/config.yml",
  "backlog.config.yml",
];

const TASK_DIR_CANDIDATES = [
  "backlog/tasks",
  ".backlog/tasks",
];

function readProjectName(configPath: string): string | null {
  try {
    const content = readFileSync(configPath, "utf-8");
    const match = content.match(/^project_name:\s*["']?([^"'\n]+)["']?/m);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

function detectBacklog(cwd: string): BacklogProject {
  // Check PROJECT_PATH env var first (sandbox/VM compatibility)
  const envPath = process.env.PROJECT_PATH;
  if (envPath) {
    for (const config of CONFIG_CANDIDATES) {
      const configPath = join(envPath, config);
      if (existsSync(configPath)) {
        return {
          detected: true,
          taskDir: join(envPath, "backlog/tasks"),
          projectName: readProjectName(configPath),
        };
      }
    }
    for (const taskDir of TASK_DIR_CANDIDATES) {
      const fullPath = join(envPath, taskDir);
      if (existsSync(fullPath)) {
        return { detected: true, taskDir: fullPath, projectName: null };
      }
    }
  }

  // Check cwd
  for (const config of CONFIG_CANDIDATES) {
    const configPath = join(cwd, config);
    if (existsSync(configPath)) {
      return {
        detected: true,
        taskDir: join(cwd, "backlog/tasks"),
        projectName: readProjectName(configPath),
      };
    }
  }
  for (const taskDir of TASK_DIR_CANDIDATES) {
    const fullPath = join(cwd, taskDir);
    if (existsSync(fullPath)) {
      return { detected: true, taskDir: fullPath, projectName: null };
    }
  }

  return { detected: false, taskDir: null, projectName: null };
}

// ── Active task detection ──────────────────────────────────────────────────────

function findActiveTask(taskDir: string): ActiveTask | null {
  try {
    const files = readdirSync(taskDir).filter((f) => f.endsWith(".md"));
    for (const file of files) {
      const content = readFileSync(join(taskDir, file), "utf-8");
      const statusMatch = content.match(/^status:\s*["']?(.+?)["']?\s*$/m);
      if (!statusMatch || statusMatch[1].trim().toLowerCase() !== "in progress") {
        continue;
      }

      // Extract ID from filename: "pi-015 - scorched-earth-rewrite.md" → "PI-015"
      const idMatch = file.match(/^((?:pi|task)-\d+)/i);
      const id = idMatch ? idMatch[1].toUpperCase() : file.replace(/\.md$/, "").split(" - ")[0];

      // Extract title: prefer heading, fall back to filename
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const title = titleMatch
        ? titleMatch[1].replace(/^Task\s+\S+\s*-\s*/i, "")
        : file.replace(/\.md$/, "").split(" - ").slice(1).join(" - ").trim();

      return { id, title: title || "Untitled" };
    }
  } catch {
    // directory read error — ignore
  }
  return null;
}

function countTasks(taskDir: string): number {
  try {
    return readdirSync(taskDir).filter((f) => f.endsWith(".md")).length;
  } catch {
    return 0;
  }
}

// ── Command classification ─────────────────────────────────────────────────────

function isBacklogInitCommand(cmd: string): boolean {
  return /(?:^|[\s;&|`]+)(?:npx\s+)?(?:\S*\/)?backlog(?:\.md)?\s+init\b/.test(cmd.trim());
}

function isBacklogTaskCommand(cmd: string): boolean {
  return /backlog(?:\.md)?\s+task/i.test(cmd);
}

function extractTaskId(cmd: string): string | null {
  const match = cmd.match(/backlog(?:\.md)?\s+task(?:s)\s+(?:edit\s+)?(pi-\d+)/i);
  return match ? match[1].toLowerCase() : null;
}

function isInProgressCommand(cmd: string): boolean {
  return /-s\s+["']?In Progress["']?/i.test(cmd);
}

function isFinalizationCommand(cmd: string): boolean {
  return /--check-ac|--check-dod|--final-summary|-s\s+["']?Done["']?/i.test(cmd);
}

function isContentEditCommand(cmd: string): boolean {
  return /--plan|--notes|--append-notes|--doc/i.test(cmd);
}

function isTaskInProgress(taskId: string, taskDir: string | null): boolean {
  if (!taskDir) return false;
  try {
    const files = readdirSync(taskDir);
    const file = files.find((f) => f.toLowerCase().startsWith(taskId.toLowerCase()));
    if (!file) return false;
    const content = readFileSync(join(taskDir, file), "utf-8");
    const match = content.match(/^status:\s*["']?(.+?)["']?\s*$/m);
    return match ? match[1].trim().toLowerCase() === "in progress" : false;
  } catch {
    return false;
  }
}

// ── System prompt context ──────────────────────────────────────────────────────

function buildSystemPromptContext(project: BacklogProject): string {
  if (!project.detected) return "";

  return [
    "## Backlog.md Project",
    "",
    `This project uses Backlog.md for task management${project.projectName ? ` (${project.projectName})` : ""}.`,
    "",
    "**Rules:**",
    "- Run `backlog instructions overview` at the start of each conversation",
    "- Use `backlog` CLI for all task operations — never edit task files directly",
    "- Search before creating tasks to avoid duplicates",
    "- Read the matching guide before creating, executing, or finalizing tasks",
    "",
  ].join("\n");
}

// ── Extension ──────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  let project: BacklogProject = { detected: false, taskDir: null, projectName: null };
  let activeTask: ActiveTask | null = null;

  function refreshActiveTask() {
    if (!project.detected || !project.taskDir) {
      activeTask = null;
      return;
    }
    activeTask = findActiveTask(project.taskDir);
  }

  function renderFooter(ctx: any) {
    const theme = ctx.ui.theme;
    const sep = theme.fg("dim", " | ");

    if (!activeTask) {
      ctx.ui.setStatus("backlog", undefined);
      return;
    }

    const text = theme.fg("success", `📋 ${activeTask.id} — ${activeTask.title}`);
    ctx.ui.setStatus("backlog", `${text}${sep}`);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    project = detectBacklog(ctx.cwd);

    if (project.detected) {
      const taskCount = project.taskDir ? countTasks(project.taskDir) : 0;
      ctx.ui.notify(
        `📋 Backlog.md detected${project.projectName ? ` (${project.projectName})` : ""} — ${taskCount} tasks`,
        "info",
      );

      refreshActiveTask();
      renderFooter(ctx);
    }
  });

  pi.on("before_agent_start", async (event) => {
    if (!project.detected) return;
    return {
      systemPrompt: event.systemPrompt + "\n\n" + buildSystemPromptContext(project),
    };
  });

  // ── Enforcement ────────────────────────────────────────────────────────────

  pi.on("tool_call", async (event) => {
    if (event.toolName !== "bash") return;

    const cmd = (event.input as { command?: string }).command || "";

    // Block agent-initiated backlog init
    if (isBacklogInitCommand(cmd)) {
      return {
        block: true,
        reason:
          "Agent-initiated `backlog init` is blocked. Backlog.md should be initialized manually by the user. Run `backlog init` yourself in your terminal.",
      };
    }

    if (!isBacklogTaskCommand(cmd)) return;

    const taskId = extractTaskId(cmd);

    // Always allow setting In Progress
    if (taskId && isInProgressCommand(cmd)) {
      // Refresh footer after status change
      setTimeout(() => {
        refreshActiveTask();
        renderFooter(event.ctx);
      }, 100);
      return;
    }

    // Finalization commands — allowed, agent gets user approval via ask_user first
    if (isFinalizationCommand(cmd)) {
      setTimeout(() => {
        refreshActiveTask();
        renderFooter(event.ctx);
      }, 100);
      return;
    }

    // Block content edits on tasks not In Progress
    if (taskId && isContentEditCommand(cmd)) {
      if (!isTaskInProgress(taskId, project.taskDir)) {
        return {
          block: true,
          reason:
            `Task ${taskId.toUpperCase()} is not In Progress. Set it first: backlog task edit ${taskId.toUpperCase()} -s "In Progress" -a @agent`,
        };
      }
    }

    // Refresh footer after any backlog task command
    if (taskId) {
      setTimeout(() => {
        refreshActiveTask();
        renderFooter(event.ctx);
      }, 100);
    }
  });
}
