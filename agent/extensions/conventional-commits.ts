import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
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

// Appended to every guard block: a blocked attempt still leaves the model
// about to retry, and that retry must end in verification.
const VERIFY_AFTER_BLOCK =
  "After every commit attempt, run `git log -1 --oneline` and confirm your commit landed before moving on.";

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
  parts.push("", "See skill:conventional-commits for format rules.", "", VERIFY_AFTER_BLOCK);
  return parts.join("\n");
}

// In-memory by design: session restart is the backstop, so no stale-latch file.
type CommitLatch = { state: "clear" } | { state: "latched"; command: string };
let commitLatch: CommitLatch = { state: "clear" };

// Diagnosis and retry only; destructive git (reset/checkout) and push stay blocked.
const RECOVERY_ALLOWLIST = new Set(["log", "status", "diff", "add", "commit"]);

const LATCH_CONFIG = fileURLToPath(new URL("../commit-latch.json", import.meta.url));

// Read at decision time so an operator edit applies without a restart.
// Missing or unreadable keeps the mechanism on.
function latchEnabled(): boolean {
  try {
    return JSON.parse(readFileSync(LATCH_CONFIG, "utf-8")).enabled !== false;
  } catch {
    return true;
  }
}

const POLICY_CONFIG = fileURLToPath(new URL("../commit-policy.json", import.meta.url));

export function noVerifyAllowed(path = POLICY_CONFIG): boolean {
  try {
    return JSON.parse(readFileSync(path, "utf-8")).allowNoVerify === true;
  } catch {
    return false;
  }
}

// Splits on shell separators and quotes so git inside `bash -c "..."` or a chain
// yields its own tokens, while a bare word in a commit message never follows a
// `git` token.
function gitSubcommands(command: string): string[] {
  const tokens = command.split(/[\s;&|()<>'"`]+/).filter(Boolean);
  const subs: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] !== "git") continue;
    // A trailing bare `git` is an attempt too, hence the empty subcommand.
    subs.push(i + 1 < tokens.length ? tokens[i + 1] : "");
  }
  return subs;
}

// True when a shell segment starts with `git commit` (`git commit`,
// `cd x && git commit`), so a command that merely mentions the phrase in a
// pattern or string never counts as a commit.
function isCommitInvocation(command: string): boolean {
  const segments = command.split(/([&|;<>()\n]+)/);
  for (let i = 0; i < segments.length; i += 2) {
    const tokens = segments[i].split(/[\s'"`]+/).filter(Boolean);
    if (tokens[0] === "git" && tokens[1] === "commit") return true;
  }
  return false;
}

function latchBlockReason(failedCommand: string): string {
  return [
    "Blocked: your previous git commit failed and is still unverified:",
    "```",
    failedCommand,
    "```",
    "Run exactly this to check whether it landed:",
    "```",
    "git log -1 --oneline",
    "```",
    "Then retry the git action you wanted, or fix the failure and re-run the commit.",
    "If git log shows the commit landed and this block persists, run /commit-unlock.",
  ].join("\n");
}

const NO_VERIFY_FLAGS: ReadonlySet<string> = new Set(["--no-verify", "-n"]);

// git parses -mn as -m n, so an attached cluster is a message value, not a flag.
function stripMessagePayloads(command: string): string {
  const words: string[] = [];
  let word = "";
  let quote: string | undefined;
  const pushWord = () => {
    if (word) words.push(word);
    word = "";
  };
  for (const ch of command) {
    if (quote !== undefined) {
      if (ch === quote) quote = undefined;
      else word += ch;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch) || "(;|&<>".includes(ch)) {
      pushWord();
      if (!/\s/.test(ch)) words.push(ch);
      continue;
    }
    word += ch;
  }
  pushWord();

  const isSeparator = (w: string) => w.length === 1 && "(;|&<>".includes(w);
  const kept: string[] = [];
  let segment: string[] = [];
  let pathspec = false;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (isSeparator(w)) {
      kept.push(w);
      segment = [];
      pathspec = false;
      continue;
    }
    const hasCommitPair = segment.some((t, j) => t === "git" && segment[j + 1] === "commit");
    if (!pathspec && hasCommitPair && (w === "-m" || w === "--message")) {
      if (i + 1 < words.length && !isSeparator(words[i + 1])) i++;
      continue;
    }
    if (!pathspec && hasCommitPair &&
        ((w.startsWith("-m") && !w.startsWith("--")) || w.startsWith("--message=")))
      continue;
    if (w === "--") pathspec = true;
    kept.push(w);
    segment.push(w);
  }
  return kept.join(" ");
}

function commitBypassFlag(code: string): string | undefined {
  const segments = code.split(/([&|;<>()\n]+)/);
  for (let i = 0; i < segments.length; i += 2) {
    const tokens = segments[i].split(/[\s'"`]+/).filter(Boolean);
    if (tokens[0] !== "git" || tokens[1] !== "commit") continue;
    for (const t of tokens) {
      if (t === "--") break;
      if (NO_VERIFY_FLAGS.has(t)) return t;
    }
  }
  return undefined;
}

function referencesGitHooks(code: string): boolean {
  return code.includes(".git/hooks");
}

function noVerifyBlockReason(): string {
  return [
    "Blocked: this commit tries to skip the hooks with --no-verify or -n.",
    "Hooks are the check: run the commit normally, read what the hook reports, and fix that instead of bypassing it.",
    "",
    VERIFY_AFTER_BLOCK,
  ].join("\n");
}

function hookAccessBlockReason(failedCommand: string): string {
  return [
    "Blocked: .git/hooks belongs to the failed, unverified commit:",
    "```",
    failedCommand,
    "```",
    "Do not read or edit the hooks to get past this failure - fix what the commit hook reported, or run `git log -1 --oneline` to see whether the commit landed.",
    "If git log shows the commit landed and this block persists, run /commit-unlock.",
    "",
    VERIFY_AFTER_BLOCK,
  ].join("\n");
}

export default function (pi: ExtensionAPI) {
  // Enforce conventional commits on git commit commands
  pi.on("tool_call", (event, ctx) => {
    if (event.toolName !== "bash") return;

    const cmd = event.input?.command;
    if (typeof cmd !== "string") return;

    const code = stripMessagePayloads(cmd);

    if (commitLatch.state === "latched" && latchEnabled()) {
      if (referencesGitHooks(code)) {
        const reason = hookAccessBlockReason(commitLatch.command);
        ctx.ui.notify(`❌ Hooks belong to the failed commit:\n${reason}`, "error");
        return { block: true, reason };
      }
      const offender = gitSubcommands(cmd).find(sub => !RECOVERY_ALLOWLIST.has(sub));
      if (offender !== undefined) {
        const reason = latchBlockReason(commitLatch.command);
        ctx.ui.notify(`❌ Unverified commit:\n${reason}`, "error");
        return { block: true, reason };
      }
    }

    if (!cmd.includes("git commit")) return;

    const flag = commitBypassFlag(code);
    if (flag !== undefined && !noVerifyAllowed()) {
      const reason = noVerifyBlockReason();
      ctx.ui.notify(`❌ Hook bypass blocked (${flag}):\n${reason}`, "error");
      return { block: true, reason };
    }

    const scan = scanSecrets();
    if (scan.kind === "findings") {
      ctx.ui.notify(`❌ Secrets in commit set:\n${scan.findings}`, "error");
      return {
        block: true,
        reason: `Secret scanner found secrets:\n${scan.findings}\n\nFix the files or drop them from the commit, then retry.\n\n${VERIFY_AFTER_BLOCK}`,
      };
    }
    if (scan.kind === "error") {
      ctx.ui.notify(`❌ Secret scan failed: ${scan.reason}`, "error");
      return {
        block: true,
        reason: `Secret scan failed: ${scan.reason}\n\nFix or restore the scanner, then retry.\n\n${VERIFY_AFTER_BLOCK}`,
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

  pi.on("tool_result", (event) => {
    if (event.toolName !== "bash") return;
    const cmd = event.input?.command;
    if (typeof cmd !== "string" || !cmd.includes("git commit")) return;
    if (!latchEnabled()) return;
    if (event.isError) {
      // Broad on purpose: an over-eager latch is cleared by the next real
      // commit, while a missed arm loses the work outright.
      commitLatch = { state: "latched", command: cmd };
      return;
    }
    // Release only on a commit that actually ran; a grep exit 0 is not one.
    if (isCommitInvocation(cmd)) commitLatch = { state: "clear" };
  });

  pi.registerCommand("commit-unlock", {
    description: "Clear the failed-commit latch",
    handler: async (_args, ctx) => {
      commitLatch = { state: "clear" };
      ctx.ui.notify("Commit latch cleared.", "info");
    },
  });
}
