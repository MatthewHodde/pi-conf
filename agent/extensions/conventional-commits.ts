import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const TYPES = "feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert";
const PATTERN = new RegExp(`^(${TYPES})(\\([a-z0-9_-]+\\))?\\!?:\\ .+$`);

const MAX_BODY_LINES = 20;

// Tool/model attribution never belongs in a commit message.
const AI_REFERENCE =
  /\b(claude|anthropic|chatgpt|gpt-?[0-9o]|copilot|gemini|codex|llama|cursor|windsurf|aider|ollama|minimax|qwen|deepseek|mistral|co-authored-by|signed-off-by\s+.*(claude|anthropic|ai)|generated (with|by) (an? )?(ai|claude|anthropic|gpt)|🤖)\b/i;

export function validate(message: string): { ok: boolean; error?: string } {
  const lines = message.split("\n");
  const subject = lines[0];

  if (!subject) return { ok: false, error: "Empty commit message" };
  if (subject.length > 50)
    return { ok: false, error: `Subject ${subject.length} chars (max 50)` };
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].length > 72)
      return { ok: false, error: `Line ${i + 1} ${lines[i].length} chars (max 72)` };
  }
  const bodyLineCount = lines
    .slice(1)
    .filter(l => l.trim()).length;
  if (bodyLineCount > MAX_BODY_LINES)
    return {
      ok: false,
      error: `Body ${bodyLineCount} non-blank lines (max ${MAX_BODY_LINES}). Trim to the why, drop the file inventory.`,
    };
  const aiHit = lines.find(l => AI_REFERENCE.test(l));
  if (aiHit)
    return {
      ok: false,
      error: `Tool/model reference not allowed in commit message: ${aiHit.trim()}`,
    };
  if (!PATTERN.test(subject))
    return {
      ok: false,
      error: `Invalid format: ${subject}\nExpected: <type>: <description>`,
    };
  if (subject.endsWith("."))
    return { ok: false, error: "Description ends with period" };

  // Breaking changes validation
  const hasExclamation = subject.includes("!");
  const hasBreakingFooter = lines.some(l => l.startsWith("BREAKING CHANGE:"));
  const breakingIndex = lines.findIndex(l => l.startsWith("BREAKING CHANGE:"));
  
  // Check if BREAKING CHANGE is in footer section (no body content after it)
  let isInFooter = true;
  if (hasBreakingFooter) {
    // After BREAKING CHANGE, only allow: empty lines, indented lines, or other footer tokens
    const FOOTER_TOKEN = /^[a-zA-Z-]+([: ])/;
    for (let i = breakingIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue; // empty line OK
      if (line.startsWith(" ") || line.startsWith("\t")) continue; // indented continuation OK
      if (FOOTER_TOKEN.test(line)) continue; // other footer token OK
      isInFooter = false;
      break;
    }
  }

  // Only validate if at least one is present
  if (hasExclamation || hasBreakingFooter) {
    if (hasExclamation && !hasBreakingFooter)
      return { ok: false, error: "Header has ! but missing BREAKING CHANGE: footer" };
    if (hasBreakingFooter && !hasExclamation)
      return { ok: false, error: "BREAKING CHANGE: footer requires ! in header" };
    if (hasBreakingFooter && !isInFooter)
      return { ok: false, error: "BREAKING CHANGE: must be in footer section (last part of message)" };
  }

  return { ok: true };
}

export default function (pi: ExtensionAPI) {
  // Enforce conventional commits on git commit commands
  pi.on("tool_call", (event, ctx) => {
    if (event.toolName !== "bash") return;

    const cmd = event.args?.command;
    if (typeof cmd !== "string" || !cmd.includes("git commit")) return;

    // Extract -m message (handles single/double quotes, multiline)
    const match = cmd.match(/git commit[^"']*-(?:m\s+)(["'])([\s\S]*?)\1/);
    if (!match) return; // No -m flag, let it pass

    const result = validate(match[2]);
    if (!result.ok) {
      ctx.ui.notify(`❌ Invalid commit:\n${result.error}`, "error");
      return {
        blocked: true,
        reason: `${result.error}\n\nSee skill:conventional-commits for format rules.`,
      };
    }
  });
}
