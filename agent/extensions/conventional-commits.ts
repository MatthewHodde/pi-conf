import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCANNER = fileURLToPath(new URL("../bin/scan-secrets", import.meta.url));

type ScanResult =
  | { kind: "clean" }
  | { kind: "findings"; findings: string }
  | { kind: "error"; reason: string };

function scanSecrets(): ScanResult {
  try {
    execSync(`"${SCANNER}"`, {
      cwd: process.cwd(),
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120_000,
    });
    return { kind: "clean" };
  } catch (err) {
    const e = err as {
      status?: number | null;
      stdout?: string | Buffer;
      stderr?: string | Buffer;
    };
    if (e.status === 1)
      return { kind: "findings", findings: String(e.stdout ?? "").trim() };
    const reason =
      e.status == null
        ? "scanner missing or timed out"
        : `scanner error (exit ${e.status})`;
    const tail = String(e.stderr ?? "").trim().slice(0, 200);
    return { kind: "error", reason: tail ? `${reason}: ${tail}` : reason };
  }
}

const TYPES = "feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert";
const PATTERN = new RegExp(`^(${TYPES})(\\([a-z0-9_-]+\\))?\\!?:\\ .+$`);

const MAX_BODY_LINES = 20;

// Tool/model attribution never belongs in a commit message.
const AI_REFERENCE =
  /\b(claude|anthropic|chatgpt|gpt-?[0-9o]|copilot|gemini|codex|llama|cursor|windsurf|aider|ollama|minimax|qwen|deepseek|mistral|co-authored-by|signed-off-by\s+.*(claude|anthropic|ai)|generated (with|by) (an? )?(ai|claude|anthropic|gpt)|🤖)\b/i;

export type ValidationResult = {
  ok: boolean;
  error?: string;
  correctedSubject?: string;
};

const SUBJECT_MAX = 50;

// Keyword sets per the skill's type table, checked most-specific first.
const TYPE_KEYWORDS: [string, RegExp][] = [
  ["revert", /\brevert(s|ed|ing)?\b/],
  ["fix", /\b(fix|fixes|fixed|fixing|bugfix|bug|bugs|patch|patches|resolve[sd]?|correct(s|ed)?|crash(es|ed)?|stop)\b/],
  ["test", /\b(test|tests|testing|spec|specs|coverage|assert(ion|s)?)\b/],
  ["docs", /\b(doc|docs|document(ation|s)?|readme|changelog)\b/],
  ["perf", /\b(perf|performance|faster|speed|latency|slow|optimi[sz]e[sd]?)\b/],
  ["refactor", /\b(refactor(s|ed|ing)?|extract(s|ed)?|inline(s|d)?|dedupe[sd]?|simplify|cleanup|rename[sd]?)\b/],
  ["style", /\b(style|format(ting)?|lint(s|ing)?|whitespace|indent(s|ed)?)\b/],
  ["ci", /\b(ci|workflow|pipelines?)\b/],
  ["build", /\b(build|deps|dependenc(y|ies)|bump|package-lock)\b/],
  ["feat", /\b(add|adds|new|introduc(e|es|ed)|implement(s|ed|ation)?|support(s|ed)?|enable(s|d)?)\b/],
];

const SCOPE_HEAD = new RegExp(`^(${TYPES})\\(([^)]*)\\)(!?)\\s*[:\\-–—]?\\s*(.*)$`, "i");
const TYPE_HEAD = new RegExp(`^(${TYPES})(!?)\\s*[:\\-–—]\\s*(.*)$`, "i");
const TYPE_BARE = new RegExp(`^(${TYPES})\\s+(.*)$`, "i");
const LABEL_HEAD = /^([A-Za-z][A-Za-z ._-]*?)\s*[:\-–—]\s+(.*)$/;

function deriveType(text: string): string {
  const lower = text.toLowerCase();
  for (const [type, pattern] of TYPE_KEYWORDS) if (pattern.test(lower)) return type;
  return "chore";
}

const IMPERATIVE: Record<string, string> = {
  fixes: "fix", fixed: "fix", fixing: "fix",
  adds: "add", added: "add", adding: "add",
};

function normalizeDescription(description: string): string {
  let text = description.replace(/\s+/g, " ").trim().replace(/\.+$/, "").trim();
  if (!text) return "";
  const first = text.split(" ")[0].toLowerCase();
  if (IMPERATIVE[first]) text = IMPERATIVE[first] + text.slice(first.length);
  return text[0].toLowerCase() + text.slice(1);
}

function truncateAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return (space > 0 ? cut.slice(0, space) : cut).replace(/[.\s]+$/, "");
}

// Returns a subject line that passes validate(), fixing every subject rule at
// once so a blocked model converges on the next attempt. Null when the subject
// is already valid or when no subject-only edit can fix it (missing BREAKING
// CHANGE footer, tool reference in the subject, empty description).
export function correctSubject(subject: string): string | null {
  if (!subject || subjectError(subject) === undefined) return null;

  const text = subject.trim();
  let type: string | undefined;
  let scope: string | undefined;
  let bang = "";
  let description = text;

  const scopeHead = text.match(SCOPE_HEAD);
  const typeHead = text.match(TYPE_HEAD);
  const bareHead = text.match(TYPE_BARE);
  const labelHead = text.match(LABEL_HEAD);
  if (scopeHead) {
    type = scopeHead[1].toLowerCase();
    scope = scopeHead[2].toLowerCase().replace(/[^a-z0-9_-]/g, "");
    bang = scopeHead[3];
    description = scopeHead[4];
  } else if (typeHead) {
    type = typeHead[1].toLowerCase();
    bang = typeHead[2];
    description = typeHead[3];
  } else if (bareHead) {
    type = bareHead[1].toLowerCase();
    description = bareHead[2];
  } else if (labelHead) {
    description = labelHead[2];
  }

  description = normalizeDescription(description);
  if (!description) return null;
  type = type ?? deriveType(text);

  const prefix = `${type}${scope ? `(${scope})` : ""}${bang}: `;
  const room = SUBJECT_MAX - prefix.length;
  if (room < 1) return null;
  const line = `${prefix}${truncateAtWord(description, room)}`;
  if (line.length > SUBJECT_MAX) return null;
  return checkMessage(line) === undefined ? line : null;
}

function subjectError(subject: string): string | undefined {
  const issues: string[] = [];
  if (subject.length > SUBJECT_MAX)
    issues.push(`Subject is ${subject.length} chars (max ${SUBJECT_MAX})`);
  if (!PATTERN.test(subject))
    issues.push("Subject must look like <type>: <description>");
  else if (subject.endsWith("."))
    issues.push("Subject ends with a period");
  if (!issues.length) return undefined;
  const [first, ...rest] = issues;
  const tail = rest.map(i => {
    const clause = i.replace(/^Subject /, "");
    return clause[0].toLowerCase() + clause.slice(1);
  });
  return [first, ...tail].join(" and ") + ".";
}

function bodyError(lines: string[]): string | undefined {
  const aiHit = lines.find(l => AI_REFERENCE.test(l));
  if (aiHit)
    return `Tool/model reference not allowed: "${aiHit.trim().replace(/\.$/, "")}".`;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].length > 72)
      return `Line ${i + 1} is ${lines[i].length} chars (max 72).`;
  }
  const bodyLineCount = lines.slice(1).filter(l => l.trim()).length;
  if (bodyLineCount > MAX_BODY_LINES)
    return `Body has ${bodyLineCount} non-blank lines (max ${MAX_BODY_LINES}).`;
  return undefined;
}

function breakingError(lines: string[], subject: string): string | undefined {
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

  if (hasExclamation && !hasBreakingFooter)
    return "Header has ! but no BREAKING CHANGE: footer.";
  if (hasBreakingFooter && !hasExclamation)
    return "BREAKING CHANGE: footer requires ! in the header.";
  if (hasBreakingFooter && !isInFooter)
    return "BREAKING CHANGE: footer must be the last section of the message.";
  return undefined;
}

// Pure rule check with no correction, so correctSubject can re-check its own
// output without recursing back into the correcting path.
function checkMessage(message: string): string | undefined {
  const lines = message.split("\n");
  const subject = lines[0];
  if (!subject) return "Commit message is empty.";
  return subjectError(subject) ?? bodyError(lines) ?? breakingError(lines, subject);
}

export function validate(message: string): ValidationResult {
  const lines = message.split("\n");
  const subject = lines[0];

  if (!subject) return { ok: false, error: "Commit message is empty." };

  // Subject rules first: the weak-model loop happens on subjects, and one
  // corrected line clears every subject violation at once.
  const error = subjectError(subject);
  if (error) {
    const corrected = correctSubject(subject);
    return corrected ? { ok: false, error, correctedSubject: corrected } : { ok: false, error };
  }
  const other = bodyError(lines) ?? breakingError(lines, subject);
  return other ? { ok: false, error: other } : { ok: true };
}

function blockReason(result: ValidationResult): string {
  const parts = [result.error ?? "Invalid commit message."];
  if (result.correctedSubject) {
    parts.push(
      "",
      "Copy this corrected subject line exactly into your next git commit -m. Your body stays as written:",
      "```",
      result.correctedSubject,
      "```",
    );
  }
  parts.push("", "See skill:conventional-commits for format rules.");
  return parts.join("\n");
}

export default function (pi: ExtensionAPI) {
  // Enforce conventional commits on git commit commands
  pi.on("tool_call", (event, ctx) => {
    if (event.toolName !== "bash") return;

    const cmd = event.input?.command;
    if (typeof cmd !== "string" || !cmd.includes("git commit")) return;

    const scan = scanSecrets();
    if (scan.kind === "findings") {
      ctx.ui.notify(`❌ Secrets in commit set:\n${scan.findings}`, "error");
      return {
        block: true,
        reason: `Secret scanner found secrets:\n${scan.findings}\n\nFix the files or drop them from the commit, then retry.`,
      };
    }
    if (scan.kind === "error") {
      ctx.ui.notify(`❌ Secret scan failed: ${scan.reason}`, "error");
      return {
        block: true,
        reason: `Secret scan failed: ${scan.reason}\n\nFix or restore the scanner, then retry.`,
      };
    }

    // Extract -m message (handles single/double quotes, multiline)
    const match = cmd.match(/git commit[^"']*-(?:m\s+)(["'])([\s\S]*?)\1/);
    if (!match) return; // No -m flag, let it pass

    const result = validate(match[2]);
    if (!result.ok) {
      ctx.ui.notify(`❌ Invalid commit:\n${result.error}`, "error");
      return { block: true, reason: blockReason(result) };
    }
  });
}
