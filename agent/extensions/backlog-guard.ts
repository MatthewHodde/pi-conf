/**
 * backlog-guard.ts — Pi extension for Backlog.md integration
 *
 * - Blocks agent from running `backlog init` (enforcement)
 * - Detects backlog projects and injects context into system prompt
 * - Shows backlog task summary on session start
 * - Enforces In Progress before content edits
 * - Blocks Done if work is uncommitted
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

interface BacklogState {
  detected: boolean;
  configPath: string | null;
  taskDir: string | null;
  projectName: string | null;
}

function detectBacklog(cwd: string): BacklogState {
  const candidates = [
    { config: "backlog/config.yml", tasks: "backlog/tasks" },
    { config: "backlog/backlog.config.yml", tasks: "backlog/tasks" },
    { config: ".backlog/config.yml", tasks: ".backlog/tasks" },
    { config: "backlog.config.yml", tasks: "backlog/tasks" },
  ];

  // PROJECT_PATH fallback (absolute paths)
  if (process.env.PROJECT_PATH) {
    const pConfig = join(process.env.PROJECT_PATH, "backlog/config.yml");
    const pTasks = join(process.env.PROJECT_PATH, "backlog/tasks");
    if (existsSync(pConfig) || existsSync(pTasks)) {
      let projectName: string | null = null;
      if (existsSync(pConfig)) {
        try {
          const content = readFileSync(pConfig, "utf-8");
          const match = content.match(/^project_name:\s*["']?([^"'\n]+)["']?$/m);
          if (match) projectName = match[1].trim();
        } catch { /* ignore */ }
      }
      return { detected: true, configPath: pConfig, taskDir: pTasks, projectName };
    }
  }

  for (const { config, tasks } of candidates) {
    const configPath = join(cwd, config);
    const taskDir = join(cwd, tasks);
    if (existsSync(configPath) || existsSync(taskDir)) {
      let projectName: string | null = null;
      if (existsSync(configPath)) {
        try {
          const content = readFileSync(configPath, "utf-8");
          const match = content.match(/^project_name:\s*["']?([^"'\n]+)["']?/m);
          if (match) projectName = match[1].trim();
        } catch {
          // ignore parse errors
        }
      }
      return { detected: true, configPath, taskDir, projectName };
    }
  }

  return { detected: false, configPath: null, taskDir: null, projectName: null };
}

function isBacklogInitCommand(command: string): boolean {
  const trimmed = command.trim();
  return /(?:^|[\s;&|`]+)(?:npx\s+)?(?:\S*\/)?backlog(\.md)?\s+init\b/.test(trimmed);
}

/**
 * Extract task ID from a backlog task command.
 * Matches: backlog task edit PI-123 ..., backlog task PI-123 --plan ...
 */
function extractTaskId(command: string): string | null {
  const match = command.match(/backlog(?:\.md)?\s+task(?:s)\s+(?:edit\s+)?(pi-\d+)/i);
  return match ? match[1].toLowerCase() : null;
}

/** Check if command is setting a task to In Progress */
function isInProgressCommand(command: string): boolean {
  return /-s\s+["']?In Progress["']?/i.test(command);
}

/** Check if command edits task content fields */
function isContentEditCommand(command: string): boolean {
  return /--plan|--notes|--append-notes|--doc/i.test(command);
}

/** Check if a task file has status "In Progress" */
function isTaskInProgress(taskId: string, taskDir: string | null): boolean {
  if (!taskDir) return false;
  try {
    const files = readdirSync(taskDir);
    const file = files.find(f => f.toLowerCase().startsWith(taskId.toLowerCase()));
    if (!file) return false;
    const content = readFileSync(join(taskDir, file), "utf-8");
    const match = content.match(/^status:\s*["']?(.+?)["']?\s*$/m);
    return match ? match[1].trim().toLowerCase() === "in progress" : false;
  } catch {
    return false;
  }
}

/** Check if git working tree has uncommitted changes */
function hasUncommittedChanges(cwd: string): boolean {
  try {
    const result = execSync("git status --porcelain", { cwd, encoding: "utf-8", timeout: 5000 });
    return result.trim().length > 0;
  } catch {
    // Not a git repo or git error — treat as uncommitted to be safe
    return true;
  }
}

function buildBacklogContext(state: BacklogState): string {
  if (!state.detected) return "";

  const lines = [
    "## Backlog.md Project",
    "",
    `This project uses Backlog.md for task management${state.projectName ? ` (${state.projectName})` : ""}.`,
    "",
    "**Rules:**",
    "- Run `backlog instructions overview` at the start of each conversation",
    "- Use `backlog` CLI for all task operations — never edit task files directly",
    "- Search before creating tasks to avoid duplicates",
    "- Read the matching guide before creating, executing, or finalizing tasks",
    "",
  ];

  return lines.join("\n");
}

export default function (pi: ExtensionAPI) {
  let backlogState: BacklogState = { detected: false, configPath: null, taskDir: null, projectName: null };

  // Detect backlog on session start
  pi.on("session_start", async (_event, ctx) => {
    backlogState = detectBacklog(ctx.cwd);

    if (backlogState.detected) {
      let taskCount = 0;
      if (backlogState.taskDir) {
        try {
          const { readdirSync } = await import("node:fs");
          const files = readdirSync(backlogState.taskDir);
          taskCount = files.filter((f) => f.endsWith(".md")).length;
        } catch {
          // ignore
        }
      }
      ctx.ui.notify(
        `📋 Backlog.md detected${backlogState.projectName ? ` (${backlogState.projectName})` : ""} — ${taskCount} tasks`,
        "info",
      );
    }
  });

  // Inject backlog context into system prompt
  pi.on("before_agent_start", async (event) => {
    if (!backlogState.detected) return;

    return {
      systemPrompt: event.systemPrompt + "\n\n" + buildBacklogContext(backlogState),
    };
  });

  // Enforce backlog rules on tool calls
  pi.on("tool_call", async (event) => {
    if (event.toolName !== "bash") return;
    const cmd = (event.input as { command?: string }).command || "";
    const cwd = (event.input as { cwd?: string }).cwd || process.cwd();

    // Rule: block backlog init
    if (isBacklogInitCommand(cmd)) {
      return {
        block: true,
        reason:
          "Agent-initiated `backlog init` is blocked. Backlog.md should be initialized manually by the user. Run `backlog init` yourself in your terminal.",
      };
    }

    // Only enforce remaining rules on backlog task commands
    if (!/backlog(?:\.md)?\s+task/i.test(cmd)) return;

    const taskId = extractTaskId(cmd);

    // Always allow setting In Progress
    if (taskId && isInProgressCommand(cmd)) return;

    // Rule: block content edits on tasks not yet In Progress
    if (taskId && isContentEditCommand(cmd)) {
      if (!isTaskInProgress(taskId, backlogState.taskDir)) {
        return {
          block: true,
          reason:
            `Task ${taskId.toUpperCase()} is not In Progress. Set it first: backlog task edit ${taskId.toUpperCase()} -s "In Progress" -a @agent`,
        };
      }
    }

    // Rule: block Done if uncommitted changes exist
    if (/-s\s+["']?Done["']?/i.test(cmd)) {
      if (hasUncommittedChanges(cwd)) {
        return {
          block: true,
          reason:
            "Cannot mark Done with uncommitted changes. Commit your work first, then ask the user to run the command.",
        };
      }
    }
  });
}
