/**
 * heredoc-write-guard.ts — block bash heredoc file writes (PI-083).
 *
 * Stateless tool_call guard at the bash boundary. It scans each command
 * line and tracks open heredoc bodies. It blocks a heredoc header line
 * that also writes a file. The write comes from a redirect or from tee.
 * It returns { block: true, reason } or nothing. No latch, no state.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const GUARD_CONFIG = fileURLToPath(new URL("../heredoc-guard.json", import.meta.url));

// Read at decision time so an operator edit applies without a restart.
export function heredocGuardEnabled(path = GUARD_CONFIG): boolean {
  try {
    return JSON.parse(readFileSync(path, "utf-8")).enabled !== false;
  } catch {
    return true;
  }
}

const REASON = [
  "BLOCKED by heredoc-write-guard: do not write files from a bash heredoc.",
  "Use the pi write tool for a new file. Use the pi edit tool for a change to an existing file.",
  "write tool input: {\"path\": \"notes.md\", \"content\": \"...\"}",
  "edit tool input: {\"path\": \"notes.md\", \"oldText\": \"...\", \"newText\": \"...\"}",
  "A heredoc that only feeds stdin to a command stays allowed.",
  "If the operator asked for a direct heredoc write, report this block to the operator.",
  'The operator can set {"enabled": false} in agent/heredoc-guard.json.',
  "Do not edit that file yourself.",
].join("\n");

const HEREDOC = /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/g;

// A redirect to a real path. It skips fd duplication, /dev/null, and the
// digits of `2> file` so a stderr redirect never reads as a file write.
const REDIRECT = /(?:^|[\s;|&])>{1,2}\s*(?!&|\/dev\/null\b)([^\s;&|]+)/;

// tee with at least one non-flag argument names a file to write.
const TEE = /(?:^|[\s;|&])tee\s+(?:-{1,2}[^\s]*\s+)*([^\s;&|]+)/;

function headerWritesFile(line: string): boolean {
  const redirect = REDIRECT.exec(line);
  if (redirect && redirect[1] !== "-" && !redirect[1].startsWith("&")) return true;
  const tee = TEE.exec(line);
  if (tee && !tee[1].startsWith("-")) return true;
  return false;
}

export function heredocWriteBlock(command: string): string | null {
  if (!heredocGuardEnabled()) return null;
  const lines = command.split("\n");
  const open: { delimiter: string; stripTabs: boolean }[] = [];
  for (const line of lines) {
    if (open.length > 0) {
      const top = open[0];
      const candidate = top.stripTabs ? line.replace(/^\t+/, "").trimEnd() : line;
      if (candidate === top.delimiter) open.shift();
      continue;
    }
    HEREDOC.lastIndex = 0;
    const delimiters = [...line.matchAll(HEREDOC)];
    if (delimiters.length === 0) continue;
    if (headerWritesFile(line)) return REASON;
    for (const match of delimiters) {
      open.push({ delimiter: match[2], stripTabs: match[0].startsWith("<<-") });
    }
  }
  return null;
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", (event, ctx) => {
    if (event.toolName !== "bash") return;
    const command = event.input?.command;
    if (typeof command !== "string") return;
    const reason = heredocWriteBlock(command);
    if (!reason) return;
    ctx.ui.notify(`❌ ${reason.split("\n")[0]}`, "error");
    return { block: true, reason };
  });
}
