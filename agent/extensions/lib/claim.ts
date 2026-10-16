/**
 * claim.ts — which backlog task this instance is running.
 *
 * Not an extension: it sits in lib/ with no index.ts, so pi's directory
 * discovery skips it and both extensions import the one copy of the rule.
 */

import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface ActiveTask {
  id: string;
  title: string;
}

/** The registered tool an agent uses to claim or release a backlog task. */
export const CLAIM_TOOL = "claim_task";

const CONFIG_CANDIDATES = [
  "backlog/config.yml",
  "backlog/backlog.config.yml",
  ".backlog/config.yml",
  "backlog.config.yml",
];

const TASK_DIR_CANDIDATES = ["backlog/tasks", ".backlog/tasks"];

export function findTaskDir(cwd: string): string | null {
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

/** Whether a backlog task with this id exists, whatever its status. */
export function taskExists(taskDir: string, id: string): boolean {
  const wanted = id.toUpperCase();
  for (const file of listTaskFiles(taskDir)) {
    let content: string;
    try {
      content = readFileSync(join(taskDir, file), "utf-8");
    } catch {
      continue;
    }
    if (taskId(file, content).toUpperCase() === wanted) return true;
  }
  return false;
}

/** The claimed task while it is still running here, null once it is not. */
export function findRunningTask(taskDir: string, id: string): ActiveTask | null {
  const wanted = id.toUpperCase();
  for (const file of listTaskFiles(taskDir)) {
    let content: string;
    try {
      content = readFileSync(join(taskDir, file), "utf-8");
    } catch {
      continue;
    }
    if (taskId(file, content).toUpperCase() !== wanted) continue;

    const status = taskStatus(content);
    if (!status || status.toLowerCase() !== "in progress") return null;
    return { id: taskId(file, content), title: taskTitle(file, content) || "Untitled" };
  }
  return null;
}

/** The claim lives beside state and tmux-* in the instance's sandbox-state folder. */
export function claimFile(): string | null {
  const dir = process.env.SMOLVM_SIGNAL_PATH;
  if (!dir || !existsSync(dir)) return null;
  return join(dir, "task");
}

export function saveClaim(id: string | null): void {
  const file = claimFile();
  if (!file) return;
  try {
    if (id) writeFileSync(file, `${id}\n`, "utf-8");
    else rmSync(file, { force: true });
  } catch {
    // Losing the signal folder costs persistence, not the session.
  }
}

export function loadClaim(): string | null {
  const file = claimFile();
  if (!file) return null;
  try {
    return readFileSync(file, "utf-8").trim() || null;
  } catch {
    return null;
  }
}
