/**
 * git-wt-aware.ts — Pi extension that detects git-wt bare worktree layout,
 * signals the agent to load the git-wt skill, and shows agent working directory widget.
 *
 * Drop into ~/.pi/agent/extensions/ for global use, or .pi/extensions/ for project-local.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

interface GitWtInfo {
  detected: boolean;
  root?: string;
}

function detectGitWt(startDir?: string): GitWtInfo {
  const cwd = startDir || process.cwd();

  // Check if .git is a file (not directory) — pointer to bare repo
  try {
    const gitStat = statSync(join(cwd, ".git"));
    if (!gitStat.isFile()) {
      return { detected: false };
    }

    // Read the gitdir pointer
    const content = readFileSync(join(cwd, ".git"), "utf-8").trim();

    // git-wt uses "gitdir: ./.bare" or similar .bare path
    if (content.includes("gitdir:") && content.includes(".bare")) {
      return { detected: true, root: cwd };
    }
  } catch {
    // .git doesn't exist or can't be read
  }

  // Also check parent directories (in case we're inside a worktree)
  let dir = cwd;
  while (dir !== "/") {
    try {
      const gitStat = statSync(join(dir, ".git"));
      if (gitStat.isFile()) {
        const content = readFileSync(join(dir, ".git"), "utf-8").trim();
        if (content.includes("gitdir:") && content.includes(".bare")) {
          return { detected: true, root: dir };
        }
      }
    } catch {
      // Skip
    }
    dir = join(dir, "..");
  }

  return { detected: false };
}

function getGitBranch(dir: string): string | null {
  try {
    const result = execSync("git rev-parse --abbrev-ref HEAD", {
      cwd: dir,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 2000,
    });
    return result.toString().trim();
  } catch {
    return null;
  }
}

function getRelativePath(root: string, cwd: string): string {
  if (cwd === root) return "project root";
  if (cwd.startsWith(root + "/")) {
    return cwd.slice(root.length + 1);
  }
  return cwd;
}

function buildWidgetLines(
  root: string,
  cwd: string,
  branch: string | null,
  theme: any,
): string[] {
  const relPath = getRelativePath(root, cwd);
  const branchStr = branch ? ` (${branch})` : "";
  const prefix = "🌿 git-wt: ";
  let coloredPath: string;
  if (cwd === root) {
    coloredPath = theme.fg("muted", relPath);
  } else if (cwd.endsWith("/main") || cwd === join(root, "main")) {
    coloredPath = theme.fg("accent", relPath);
  } else {
    coloredPath = relPath;
  }
  return [`${prefix}${coloredPath}${branchStr}`];
}

function getWorktreeDirs(root: string): string[] {
  try {
    const result = execSync("git worktree list --porcelain", {
      cwd: root,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 1000,
    });
    const output = result.toString();
    return output
      .split("\n\n")
      .map((block) => {
        const match = block.match(/^worktree (.+)$/m);
        return match ? match[1] : null;
      })
      .filter(
        (d): d is string =>
          d !== null && d !== root && !d.endsWith("/.bare"),
      );
  } catch {
    return [];
  }
}

export default function (pi: ExtensionAPI) {
  const info = detectGitWt();

  if (!info.detected) return;

  let currentCwd = process.cwd();
  let lastCtx: any = null;

  function updateWidget() {
    if (!lastCtx) return;
    const branch = getGitBranch(currentCwd);
    const lines = buildWidgetLines(info.root!, currentCwd, branch, lastCtx.ui.theme);
    lastCtx.ui.setWidget("git-wt", lines, { placement: "aboveEditor" });
  }

  // Inject git-wt context into every agent turn
  pi.on("before_agent_start", async (event) => {
    return {
      systemPrompt: event.systemPrompt + "\n\n" + "This is a git-wt repo. Load the git-wt skill for worktree management.",
    };
  });

  // Setup widget on session start
  pi.on("session_start", async (_event, ctx) => {
    lastCtx = ctx;
    ctx.ui.notify(`🌿 git-wt repo detected at ${info.root}`, "info");
    updateWidget();
  });

  // Track file operations and cd commands to update widget
  pi.on("tool_call", async (event) => {
    let newCwd: string | null = null;

    // Handle bash commands (cd detection + path references)
    if (event.toolName === "bash") {
      const cmd = event.input.command || "";

      // Match cd commands (simple cases)
      const cdMatch = cmd.match(/(?:^|\s|\|\||&&|;)\s*cd\s+([^\s;&|]+)/);
      if (cdMatch) {
        const target = cdMatch[1];
        const resolved = target.startsWith("/") ? target : join(currentCwd, target);
        try {
          const stat = statSync(resolved);
          if (stat.isDirectory()) {
            newCwd = resolved;
          }
        } catch {
          // Invalid path, ignore
        }
      }

      // Also handle cd without arguments (goes home)
      if (cmd.match(/(?:^|\s|\|\||&&|;)\s*cd\s*$/)) {
        newCwd = process.env.HOME || "/home/matthew";
      }

      // Check if command references a worktree path
      if (!newCwd && info.root) {
        const wtDirs = getWorktreeDirs(info.root);
        for (const wtDir of wtDirs) {
          if (cmd.includes(wtDir)) {
            newCwd = wtDir;
            break;
          }
        }
      }
    }

    // Handle file writes (write/edit tools)
    if (event.toolName === "write" || event.toolName === "edit") {
      const filePath = event.input.path || "";
      if (filePath && info.root) {
        const wtDirs = getWorktreeDirs(info.root);
        for (const wtDir of wtDirs) {
          if (filePath.startsWith(wtDir)) {
            newCwd = wtDir;
            break;
          }
        }
      }
    }

    if (newCwd && newCwd !== currentCwd) {
      currentCwd = newCwd;
      updateWidget();
    }
  });
}
