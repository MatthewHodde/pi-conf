/**
 * backlog-guard.ts — Pi extension for Backlog.md integration
 *
 * - Blocks agent from running `backlog init` (enforcement)
 * - Detects backlog projects and injects context into system prompt
 * - Shows backlog task summary on session start
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

interface BacklogState {
  detected: boolean;
  configPath: string | null;
  taskDir: string | null;
  projectName: string | null;
}

function detectBacklog(cwd: string): BacklogState {
  // Check for backlog config in common locations
  const candidates = [
    { config: "backlog/config.yml", tasks: "backlog/tasks" },
    { config: "backlog/backlog.config.yml", tasks: "backlog/tasks" },
    { config: ".backlog/config.yml", tasks: ".backlog/tasks" },
    { config: "backlog.config.yml", tasks: "backlog/tasks" },
  ];

  for (const { config, tasks } of candidates) {
    const configPath = join(cwd, config);
    const taskDir = join(cwd, tasks);
    if (existsSync(configPath) || existsSync(taskDir)) {
      // Try to extract project name from config
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
  // Match commands that run backlog init, not arguments containing those words
  // Handles: backlog init, backlog.md init, npx backlog.md init, path/to/backlog init
  return /(?:^|[\s;&|`]+)(?:npx\s+)?(?:\S*\/)?backlog(\.md)?\s+init\b/.test(trimmed);
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
      // Count tasks for notification
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

  // Block backlog init from agents
  pi.on("tool_call", async (event) => {
    if (event.toolName === "bash") {
      const cmd = (event.input as { command?: string }).command || "";
      if (isBacklogInitCommand(cmd)) {
        return {
          block: true,
          reason:
            "Agent-initiated `backlog init` is blocked. Backlog.md should be initialized manually by the user. Run `backlog init` yourself in your terminal.",
        };
      }
    }
  });
}
