/**
 * backlog-terminal-guard.ts — block backlog terminal status moves while an
 * operator-only check waits (PI-070.07, decision-003).
 *
 * Stateless tool_call guard at the bash boundary: parse the command, read the
 * task file, return { block: true, reason } or nothing. No latch, no state.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { findTaskDir } from "./lib/claim.ts";

const GUARD_CONFIG = fileURLToPath(new URL("../backlog-terminal-guard.json", import.meta.url));

// Read at decision time so an operator edit applies without a restart.
// Missing or unreadable keeps the guard on.
export function guardEnabled(path = GUARD_CONFIG): boolean {
  try {
    return JSON.parse(readFileSync(path, "utf-8")).enabled !== false;
  } catch {
    return true;
  }
}

const TERMINAL_STATUSES = new Set(["done", "completed", "closed"]);

// decision-003 operator-only checks. The set avoids bare 'host' so
// localhost-style wording never trips the block (false block = opposite failure).
const OPERATOR_ONLY =
  /\b(real host|host-side|host test|on the host|kvm|real build|real sandbox run|only the operator)\b/i;

const SECTIONS = ["Acceptance Criteria", "Definition of Done"];

// Quote-aware scan (the conventional-commits stripMessagePayloads
// precedent): "..." and '...' group their contents into one token, so a
// backlog command quoted inside a commit message never reads as a real
// command, while a quoted status value like `--status "done"` still lands
// as its own token. `;`, `|` and `&` break shell segments.
function tokenizeSegments(command: string): string[][] {
  const segments: string[][] = [];
  let tokens: string[] = [];
  let word = "";
  let quote: string | undefined;
  const pushWord = () => {
    if (word) tokens.push(word);
    word = "";
  };
  const pushSegment = () => {
    pushWord();
    if (tokens.length) segments.push(tokens);
    tokens = [];
  };
  for (const ch of command) {
    if (quote !== undefined) {
      if (ch === quote) quote = undefined;
      else word += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === ";" || ch === "|" || ch === "&") pushSegment();
    else if (/[\s()<>`]/.test(ch)) pushWord();
    else word += ch;
  }
  pushSegment();
  return segments;
}

// Token-boundary parse like gitSubcommands: `backlog task edit X -s done`
// counts, a bare 'done' word in a message or a `--status` mention does not.
export function parseTerminalTransition(command: string): { id: string } | null {
  for (const tokens of tokenizeSegments(command)) {
    for (let i = 0; i + 2 < tokens.length; i++) {
      if (tokens[i] !== "backlog" || tokens[i + 1] !== "task") continue;
      let j = i + 2;
      if (tokens[j] === "edit") j++;
      const id = tokens[j];
      if (!id || id.startsWith("-")) continue;
      for (let k = j + 1; k < tokens.length; k++) {
        let value: string | null = null;
        if (tokens[k] === "-s" || tokens[k] === "--status") value = tokens[k + 1] ?? null;
        else if (tokens[k].startsWith("--status=")) value = tokens[k].slice("--status=".length);
        if (value !== null && TERMINAL_STATUSES.has(value.replace(/^["']|["']$/g, "").toLowerCase()))
          return { id };
      }
    }
  }
  return null;
}

// Frontmatter id first, filename prefix second — same rule claim.ts uses.
function taskIdOf(file: string, content: string): string {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  const fm = block ? /^id:[ \t]*(.*)$/m.exec(block[1]) : null;
  if (fm) return fm[1].trim().replace(/^["']|["']$/g, "").toUpperCase();
  const m = file.match(/^((?:pi|task)-\d+)/i);
  if (m) return m[1].toUpperCase();
  return file.replace(/\.md$/, "").split(" - ")[0].toUpperCase();
}

function findTaskContent(taskDir: string, id: string): string | null {
  const wanted = id.toUpperCase();
  let files: string[];
  try {
    files = readdirSync(taskDir).filter((f) => f.endsWith(".md"));
  } catch {
    return null;
  }
  for (const file of files) {
    let content: string;
    try {
      content = readFileSync(join(taskDir, file), "utf-8");
    } catch {
      continue;
    }
    if (taskIdOf(file, content) === wanted) return content;
  }
  return null;
}

function waitingCriterion(content: string): string | null {
  const lines = content.split("\n");
  let inSection = false;
  for (const line of lines) {
    const heading = /^#{2,3}\s+(.+?)\s*$/.exec(line);
    if (heading) {
      inSection = SECTIONS.some((s) => heading[1].toLowerCase().includes(s.toLowerCase()));
      continue;
    }
    if (!inSection) continue;
    const unchecked = /^\s*-\s\[ \]\s*(.*)$/.exec(line);
    if (unchecked && OPERATOR_ONLY.test(unchecked[1])) return unchecked[1].trim();
  }
  return null;
}

export function backlogTerminalBlock(command: string, cwd: string): string | null {
  if (!guardEnabled()) return null;
  const transition = parseTerminalTransition(command);
  if (!transition) return null;
  const taskDir = findTaskDir(cwd);
  if (!taskDir) return null;
  const content = findTaskContent(taskDir, transition.id);
  if (content === null) return null;
  const criterion = waitingCriterion(content);
  if (!criterion) return null;
  return [
    `BLOCKED by backlog-terminal-guard: ${transition.id} cannot move to a terminal status while an operator-only check waits.`,
    "Waiting criterion, quote it to the operator verbatim:",
    "```",
    criterion,
    "```",
    `Leave ${transition.id} at a non-terminal status. Reply to the operator with the criterion above as a copy-paste command block; only the operator can run that check (decision-003). Do not re-run this transition until the operator confirms the check passed.`,
  ].join("\n");
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", (event, ctx) => {
    if (event.toolName !== "bash") return;
    const cmd = event.input?.command;
    if (typeof cmd !== "string") return;
    const reason = backlogTerminalBlock(cmd, ctx.cwd);
    if (!reason) return;
    ctx.ui.notify(`❌ ${reason.split("\n")[0]}`, "error");
    return { block: true, reason };
  });
}
