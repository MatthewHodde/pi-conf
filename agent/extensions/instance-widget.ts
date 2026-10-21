/**
 * instance-widget.ts — the one line above the prompt that says what this
 * instance is working on and where.
 *
 * The task line shows the task this instance claimed: the backlog status change
 * to In Progress that this pane carried out. No claim, no line. The claim is
 * kept in the instance's sandbox-state folder so a restarted pane picks it back
 * up and the host notification scripts can read the same file.
 *
 * One widget key, one owner. pi orders widgets by setWidget call order and a
 * re-set moves a key to the end, so two extensions refreshing on different
 * triggers would swap their lines mid-session.
 *
 * The git-wt agent context lives here too, because that is where the worktree
 * facts are read: the extension gives the agent the mechanical git-wt layout
 * facts and tracks the worktree the agent cd'd into.
 *
 * The widget is a component rather than a string array, so render() receives
 * the width pi has for it and clamps each line to that, ellipsis included.
 */

import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { changeFor, nextTitle } from "./backlog-title.ts";
import {
  findRunningTask,
  findTaskDir,
  loadClaim,
  saveClaim,
  type ActiveTask,
} from "./lib/claim.ts";

const WIDGET_KEY = "instance";

export const GIT_WT_CONTEXT = `## git-wt worktree layout

Ground truth for "where am I and what worktrees exist": \`git worktree list --porcelain\` — works from any directory. The entry whose next line is \`bare\` is the bare repo; every other entry is a sibling worktree.

- The directory containing \`.bare/\` is the project root and is NOT a work tree: \`git status\`, \`git add\`, \`git commit\`, \`git rev-parse --show-toplevel\` fail there with "this operation must be run in a work tree". \`.bare/\` itself is the bare git repository (the object database).
- A sibling worktree is a directory like \`<root>/<branch>/\`: one checked-out branch, its \`.git\` file pointing into \`.bare/worktrees/<branch>/\`. Git writes (\`git status\`, \`git add\`, \`git commit\`) work only inside a sibling worktree.
- \`git log\`, \`git branch --show-current\`, and \`git worktree list --porcelain\` work in every directory.
- To commit: run \`git worktree list --porcelain\`, \`cd\` into your branch's sibling worktree, then \`git add -A && git commit -m "<message>"\`, then verify with \`git log -1 --oneline\` in that same directory. Never run \`git add\`/\`git commit\` in the root or in \`.bare/\`.`;

// ── Types ──────────────────────────────────────────────────────────────────────

interface GitWtInfo {
  detected: boolean;
  root?: string;
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

const ROOT_GIT_BLOCKS = new Set(["status", "add", "commit"]);

// status/add/commit at the bare root always fail with the work-tree fatal
// (matrix-verified), so this block can never stop a command that would have
// worked; the block is git's own error made actionable at the point of failure.
function bareRootGitBlock(cmd: string, root: string, currentCwd: string): string | null {
  const bare = join(root, ".bare");
  let cwd = currentCwd;
  for (const segment of cmd.split(/\s*(?:&&|\|\||;|\|)\s*/)) {
    // Same cd rule as the tracker below: first cd match, absolute or resolved
    // against the current cwd, and only an existing directory counts.
    const cdMatch = segment.match(/(?:^|\s)cd\s+([^\s;&|]+)/);
    if (cdMatch) {
      const resolved = cdMatch[1].startsWith("/") ? cdMatch[1] : join(cwd, cdMatch[1]);
      try {
        if (statSync(resolved).isDirectory()) cwd = resolved;
      } catch {
        // Invalid path, ignore — the tracker would not move either
      }
    }

    const tokens = segment.split(/\s+/).filter(Boolean);
    if (tokens[0] !== "git") continue;
    let location = cwd;
    let i = 1;
    while (i < tokens.length) {
      if (tokens[i] === "-c") {
        i += 2;
        continue;
      }
      if (tokens[i] === "-C" && tokens[i + 1] !== undefined) {
        const target = tokens[i + 1];
        location = target.startsWith("/") ? target : join(cwd, target);
        i += 2;
        continue;
      }
      break;
    }
    const sub = tokens[i];
    if (sub === undefined || !ROOT_GIT_BLOCKS.has(sub)) continue;
    if (location === root || location === bare || location.startsWith(bare + "/")) {
      return [
        `Blocked: git ${sub} cannot run at the project root; the root is not a work tree and .bare is the bare repo.`,
        "Run: git worktree list --porcelain",
        "Then cd into your branch worktree and retry; confirm with: git log -1 --oneline",
      ].join("\n");
    }
  }
  return null;
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
  let claimedId: string | null = null;
  let runningTask: ActiveTask | null = null;
  let lastCtx: ExtensionContext | null = null;

  function refreshRunningTask() {
    runningTask = taskDir && claimedId ? findRunningTask(taskDir, claimedId) : null;
  }

  function renderWidget() {
    if (!lastCtx) return;

    const theme = lastCtx.ui.theme;
    const lines: string[] = [];
    if (runningTask) {
      lines.push(theme.fg("success", `📋 ${runningTask.id} — ${runningTask.title}`));
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
      systemPrompt: event.systemPrompt + "\n\n" + GIT_WT_CONTEXT,
    };
  });

  pi.on("session_start", async (_event, ctx) => {
    lastCtx = ctx;
    taskDir = findTaskDir(ctx.cwd);
    claimedId = loadClaim();
    refreshRunningTask();
    if (claimedId && taskDir && !runningTask) {
      // The task stopped running here while the pane was away, so the claim goes too.
      claimedId = null;
      saveClaim(null);
    }

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

      if (info.root) {
        const blocked = bareRootGitBlock(cmd, info.root, currentCwd);
        if (blocked) return { block: true, reason: blocked };
      }

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

  // backlog-title parses the same status change for the terminal title, so the
  // title and this line name one task without sharing mutable state. A timer on
  // tool_call could not promise the task file is written yet, so both wait for
  // the result.
  pi.on("tool_result", async (event) => {
    if (event.isError || !lastCtx) return;

    const change = changeFor(event.toolName, event.input);
    if (!change) return;
    const next = nextTitle(change, claimedId, "");
    if (!next) return;

    claimedId = next.activeId;
    saveClaim(claimedId);
    refreshRunningTask();
    renderWidget();
  });
}
