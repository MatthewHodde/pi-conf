/**
 * instance-widget.ts — the one line above the prompt that says what this
 * instance is working on and where.
 *
 * One widget key, one owner. pi orders widgets by setWidget call order and a
 * re-set moves a key to the end, so two extensions refreshing on different
 * triggers would swap their lines mid-session.
 *
 * The git-wt agent context lives here too, because that is where the worktree
 * facts are read: the extension tells the agent to load the git-wt skill and
 * tracks the worktree the agent cd'd into.
 *
 * The widget is a component rather than a string array, so render() receives
 * the width pi has for it and clamps each line to that, ellipsis included.
 */

import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const WIDGET_KEY = "instance";

// ── Types ──────────────────────────────────────────────────────────────────────

interface ActiveTask {
  id: string;
  title: string;
}

interface GitWtInfo {
  detected: boolean;
  root?: string;
}

// ── Active backlog task ────────────────────────────────────────────────────────

const CONFIG_CANDIDATES = [
  "backlog/config.yml",
  "backlog/backlog.config.yml",
  ".backlog/config.yml",
  "backlog.config.yml",
];

const TASK_DIR_CANDIDATES = ["backlog/tasks", ".backlog/tasks"];

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

/** Read a key from the leading --- block, so body text cannot impersonate it. */
function frontmatterValue(content: string, key: string): string | null {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  if (!block) return null;
  const line = new RegExp(`^${key}:[ \t]*(.*)$`, "m").exec(block[1]);
  if (!line) return null;
  const value = line[1].trim().replace(/^["']|["']$/g, "");
  return value || null;
}

function taskStatus(content: string): string | null {
  const fromFrontmatter = frontmatterValue(content, "status");
  if (fromFrontmatter) return fromFrontmatter;
  const match = content.match(/^status:\s*["']?(.+?)["']?\s*$/m);
  return match ? match[1].trim() : null;
}

function taskId(file: string, content: string): string {
  const fromFrontmatter = frontmatterValue(content, "id");
  if (fromFrontmatter) return fromFrontmatter.toUpperCase();
  const idMatch = file.match(/^((?:pi|task)-\d+)/i);
  return idMatch ? idMatch[1].toUpperCase() : file.replace(/\.md$/, "").split(" - ")[0];
}

function taskTitle(file: string, content: string): string {
  const fromFrontmatter = frontmatterValue(content, "title");
  if (fromFrontmatter) return fromFrontmatter;
  const heading = content.match(/^#\s+(.+)$/m);
  if (heading) return heading[1].replace(/^Task\s+\S+\s*-\s*/i, "");
  return file.replace(/\.md$/, "").split(" - ").slice(1).join(" - ").trim();
}

function findActiveTask(taskDir: string): ActiveTask | null {
  for (const file of listTaskFiles(taskDir).sort()) {
    let content: string;
    try {
      content = readFileSync(join(taskDir, file), "utf-8");
    } catch {
      continue;
    }

    const status = taskStatus(content);
    if (!status || status.toLowerCase() !== "in progress") continue;

    return { id: taskId(file, content), title: taskTitle(file, content) || "Untitled" };
  }
  return null;
}

// ── git-wt worktree ────────────────────────────────────────────────────────────

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

  // Also check parent directories (if we're inside a worktree)
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

function worktreeLine(root: string, cwd: string, theme: Theme): string {
  const relPath = getRelativePath(root, cwd);
  const branch = getGitBranch(cwd);
  const branchStr = branch ? ` (${branch})` : "";
  let coloredPath: string;
  if (cwd === root) {
    coloredPath = theme.fg("muted", relPath);
  } else if (cwd.endsWith("/main") || cwd === join(root, "main")) {
    coloredPath = theme.fg("accent", relPath);
  } else {
    coloredPath = relPath;
  }
  return `🌿 git-wt: ${coloredPath}${branchStr}`;
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
      .filter((d): d is string => d !== null && d !== root && !d.endsWith("/.bare"));
  } catch {
    return [];
  }
}

// ── Width clamping ──────────────────────────────────────────────────────────────

const ANSI = "\\x1b\\[[0-9;?]*[ -/]*[@-~]";
const ANSI_GLOBAL = new RegExp(ANSI, "g");
const ANSI_STICKY = new RegExp(ANSI, "y");

/** Code point ranges terminals draw double width. */
const WIDE_RANGES: [number, number][] = [
  [0x1100, 0x115f], [0x2e80, 0x303e], [0x3041, 0x33ff], [0x3400, 0x4dbf],
  [0x4e00, 0x9fff], [0xa000, 0xa4cf], [0xac00, 0xd7a3], [0xf900, 0xfaff],
  [0xfe30, 0xfe6f], [0xff00, 0xff60], [0xffe0, 0xffe6],
  [0x1f300, 0x1f64f], [0x1f680, 0x1f6ff], [0x1f900, 0x1f9ff], [0x1fa00, 0x1faff],
  [0x20000, 0x3fffd],
];

/** Columns a code point occupies: combining marks and variation selectors take none. */
function charWidth(cp: number): number {
  if (cp >= 0x0300 && cp <= 0x036f) return 0;
  if (cp >= 0xfe00 && cp <= 0xfe0f) return 0;
  for (const [low, high] of WIDE_RANGES) {
    if (cp >= low && cp <= high) return 2;
  }
  return 1;
}

function visibleWidth(text: string): number {
  let width = 0;
  for (const char of text.replace(ANSI_GLOBAL, "")) {
    width += charWidth(char.codePointAt(0) ?? 0);
  }
  return width;
}

/** Cut a themed line to width columns, leaving escape sequences intact. */
function clampLine(line: string, width: number, theme: Theme): string {
  if (width <= 0) return "";
  if (visibleWidth(line) <= width) return line;

  const budget = Math.max(1, width - 1); // room for the ellipsis
  let out = "";
  let used = 0;
  let index = 0;
  while (index < line.length) {
    ANSI_STICKY.lastIndex = index;
    const escape = ANSI_STICKY.exec(line);
    if (escape) {
      out += escape[0];
      index += escape[0].length;
      continue;
    }
    const cp = line.codePointAt(index) ?? 0;
    const cost = charWidth(cp);
    if (used + cost > budget) break;
    const char = String.fromCodePoint(cp);
    out += char;
    used += cost;
    index += char.length;
  }
  return out + theme.fg("dim", "…");
}

// ── Extension ──────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  const info = detectGitWt();
  let currentCwd = process.cwd();
  let taskDir: string | null = null;
  let activeTask: ActiveTask | null = null;
  let lastCtx: ExtensionContext | null = null;

  function refreshActiveTask() {
    activeTask = taskDir ? findActiveTask(taskDir) : null;
  }

  function renderWidget() {
    if (!lastCtx) return;

    const theme = lastCtx.ui.theme;
    const lines: string[] = [];
    if (activeTask) {
      lines.push(theme.fg("success", `📋 ${activeTask.id} — ${activeTask.title}`));
    }
    if (info.detected && info.root) {
      lines.push(worktreeLine(info.root, currentCwd, theme));
    }

    lastCtx.ui.setWidget(
      WIDGET_KEY,
      lines.length
        ? (_tui: unknown, renderTheme: Theme) => ({
            render: (width: number) => lines.map((line) => clampLine(line, width, renderTheme)),
            invalidate() {},
          })
        : undefined,
      { placement: "aboveEditor" },
    );
  }

  // Inject git-wt context into every agent turn
  pi.on("before_agent_start", async (event) => {
    if (!info.detected) return;
    return {
      systemPrompt: event.systemPrompt + "\n\n" + "This is a git-wt repo. Load the git-wt skill for worktree management.",
    };
  });

  pi.on("session_start", async (_event, ctx) => {
    lastCtx = ctx;
    taskDir = findTaskDir(ctx.cwd);
    refreshActiveTask();

    if (info.detected) {
      ctx.ui.notify(`🌿 git-wt repo detected at ${info.root}`, "info");
    }
    renderWidget();
  });

  // Track the worktree the agent moved into, so the line keeps up with cd
  pi.on("tool_call", async (event) => {
    let newCwd: string | null = null;

    if (event.toolName === "bash") {
      const cmd = event.input.command || "";

      const cdMatch = cmd.match(/(?:^|\s|\|\||&&|;)\s*cd\s+([^\s;&|]+)/);
      if (cdMatch) {
        const target = cdMatch[1];
        const resolved = target.startsWith("/") ? target : join(currentCwd, target);
        try {
          if (statSync(resolved).isDirectory()) newCwd = resolved;
        } catch {
          // Invalid path, ignore
        }
      }

      if (cmd.match(/(?:^|\s|\|\||&&|;)\s*cd\s*$/)) {
        newCwd = process.env.HOME || "/home/ubuntu";
      }

      if (!newCwd && info.root) {
        for (const wtDir of getWorktreeDirs(info.root)) {
          if (cmd.includes(wtDir)) {
            newCwd = wtDir;
            break;
          }
        }
      }
    }

    if (event.toolName === "write" || event.toolName === "edit") {
      const filePath = event.input.path || "";
      if (filePath && info.root) {
        for (const wtDir of getWorktreeDirs(info.root)) {
          if (filePath.startsWith(wtDir)) {
            newCwd = wtDir;
            break;
          }
        }
      }
    }

    if (newCwd && newCwd !== currentCwd) {
      currentCwd = newCwd;
      renderWidget();
    }
  });

  // The task file is on disk by the time backlog reports a result, which a
  // timer started at tool_call cannot promise.
  pi.on("tool_result", async (event) => {
    if (event.isError || !lastCtx) return;

    const backlogMcp = event.toolName.startsWith("mcp__backlog__");
    const backlogCli =
      event.toolName === "bash" && /\bbacklog\b/.test(event.input?.command || "");
    if (!backlogMcp && !backlogCli) return;

    refreshActiveTask();
    renderWidget();
  });
}
