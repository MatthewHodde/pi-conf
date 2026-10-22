import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { isBacklogProject } from "./lib/claim.ts";

const GUARD_CONFIG = fileURLToPath(new URL("../backlog-edit-guard.json", import.meta.url));

// Read at decision time so an operator edit applies without a restart.
export function editGuardEnabled(path = GUARD_CONFIG): boolean {
  try {
    return JSON.parse(readFileSync(path, "utf-8")).enabled !== false;
  } catch {
    return true;
  }
}

const REASON = [
  "BLOCKED by backlog-edit-guard: direct writes to files under backlog/ are not allowed.",
  "Use the backlog CLI for every backlog change. Do not edit backlog files by hand.",
  "Example commands:",
  "```",
  "backlog task view PI-123 --plain",
  'backlog task edit PI-123 --title "new title"',
  'backlog task create "Title" -d "Why" --ac "testable criterion"',
  "```",
  "If the operator asked for a direct hand edit, report this block to the operator.",
  'The operator can set {"enabled": false} in agent/backlog-edit-guard.json.',
  "Do not edit that file yourself.",
].join("\n");

export function backlogEditBlock(rawPath: string, cwd: string): string | null {
  if (!editGuardEnabled()) return null;
  const target = resolve(cwd, rawPath);
  const bases = [...new Set([process.env.PROJECT_PATH, cwd].filter((p): p is string => !!p))];
  for (const base of bases) {
    for (let dir = base; ; dir = dirname(dir)) {
      if (isBacklogProject(dir)) {
        for (const name of ["backlog", ".backlog"]) {
          const backlogDir = join(dir, name);
          if (target === backlogDir || target.startsWith(backlogDir + sep)) return REASON;
        }
      }
      if (dir === dirname(dir)) break;
    }
  }
  return null;
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", (event, ctx) => {
    if (event.toolName !== "write" && event.toolName !== "edit") return;
    const rawPath = event.input?.path;
    if (typeof rawPath !== "string") return;
    const reason = backlogEditBlock(rawPath, ctx.cwd);
    if (!reason) return;
    ctx.ui.notify(`❌ ${reason.split("\n")[0]}`, "error");
    return { block: true, reason };
  });
}
