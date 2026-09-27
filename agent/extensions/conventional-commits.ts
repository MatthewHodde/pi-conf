import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const TYPES = "feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert";
const PATTERN = new RegExp(`^(${TYPES})(\\([a-z0-9_-]+\\))?\\!?:\\ .+$`);

function validate(message: string): { ok: boolean; error?: string } {
  const lines = message.split("\n");
  const subject = lines[0];

  if (!subject) return { ok: false, error: "Empty commit message" };
  if (subject.length > 50)
    return { ok: false, error: `Subject ${subject.length} chars (max 50)` };
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].length > 72)
      return { ok: false, error: `Line ${i + 1} ${lines[i].length} chars (max 72)` };
  }
  if (!PATTERN.test(subject))
    return {
      ok: false,
      error: `Invalid format: ${subject}\nExpected: <type>: <description>`,
    };
  if (subject.endsWith("."))
    return { ok: false, error: "Description ends with period" };

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
