#!/usr/bin/env node
/**
 * branch-name.mjs — derive an agent-created git branch name from a backlog task.
 *
 * Implements the convention specified in
 *   backlog/docs/worktree-branch-naming/doc-002 - Worktree-and-branch-naming-convention.md
 *
 *   <branchPrefix>/<TASK-ID>-<slug>
 *
 * The name is computed once, at branch creation time, from the task id and title as they
 * stand at that moment. It is never renamed afterwards.
 *
 * Usage:
 *   node branch-name.mjs --task PI-026
 *   node branch-name.mjs --task PI-026 --title "Override title"
 *   node branch-name.mjs --title "ad hoc work, no task"
 *   node branch-name.mjs --task PI-026 --prefix "wip/bt/" --json
 *
 * With --task and no --title the title is read from the backlog CLI. When the backlog CLI
 * is unavailable or the id does not resolve, pass --title explicitly.
 */
import { execFileSync } from "node:child_process";

export const DEFAULT_PREFIX = "pi/";
export const WIP_SEGMENT = "wip";
export const SLUG_MAX_WORDS = 5;
export const SLUG_MAX_BYTES = 40;
export const BRANCH_MAX_BYTES = 60;

/**
 * Words that carry no meaning out of context. Dropping them before the word cap spends the
 * budget on the subject rather than on glue.
 */
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "can", "could", "did", "do", "does",
  "for", "from", "has", "have", "how", "i", "if", "in", "into", "is", "it", "its", "just", "me",
  "my", "no", "not", "of", "on", "or", "our", "so", "than", "that", "the", "their", "them",
  "then", "there", "these", "they", "this", "to", "was", "we", "were", "what", "when", "where",
  "which", "while", "will", "with", "would", "you", "your",
]);

/** Leading type/scope noise stripped from task titles before slugging. */
const NOISE_PREFIX = /^(?:bug|feat|feature|fix|chore|docs?|dig|spike|research|refactor|perf|test|tests|enhancement)\s*[:\-–]\s*/i;
const BRACKET_PREFIX = /^(?:\[[^\]]*\]|\([^)]*\))\s*/;

/**
 * Reduce a URL to its final path segment so the useful part survives. Scheme and host are
 * noise; the last path segment is usually the subject. A bare host with no path is dropped.
 */
function reduceUrls(text) {
  return text
    .replace(/\bhttps?:\/\/[^\s)\]]+/gi, (url) => {
      const withoutScheme = url.replace(/^https?:\/\//i, "");
      const segments = withoutScheme.split("/").filter(Boolean);
      if (segments.length <= 1) return " ";
      return ` ${segments[segments.length - 1]} `;
    })
    .replace(/\bwww\.[^\s)\]]+/gi, " ");
}

/** Strip leading type, scope, and bracket noise. */
function stripNoise(title) {
  let text = title.trim();
  let previous;
  do {
    previous = text;
    text = text.replace(BRACKET_PREFIX, "").replace(NOISE_PREFIX, "").trim();
  } while (text !== previous && text.length > 0);
  return text;
}

/** Lowercase kebab: non-alphanumeric runs become single dashes, edges trimmed. */
function kebab(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Truncate to a byte budget without splitting a multi-byte code point. */
function truncateBytes(value, maxBytes) {
  const bytes = Buffer.from(value, "utf-8");
  if (bytes.length <= maxBytes) return value;
  let end = maxBytes;
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end -= 1;
  return Buffer.from(bytes.subarray(0, end)).toString("utf-8");
}

/**
 * Derive the slug: 2–5 words (a cap, never a quota), max 40 bytes, no leading or trailing
 * separator. Returns "task" when the title yields nothing.
 */
export function deriveSlug(title) {
  const cleaned = kebab(stripNoise(reduceUrls(String(title ?? ""))));
  const all = cleaned.split("-").filter(Boolean);
  if (all.length === 0) return "task";
  const meaningful = all.filter((word) => !STOP_WORDS.has(word));
  // Never let stop-word removal consume the whole title ("the bug" stays "the-bug").
  const words = (meaningful.length > 0 ? meaningful : all).slice(0, SLUG_MAX_WORDS);

  let slug = words.join("-");
  if (Buffer.byteLength(slug, "utf-8") > SLUG_MAX_BYTES) {
    const kept = [];
    for (const word of words) {
      const candidate = [...kept, word].join("-");
      if (Buffer.byteLength(candidate, "utf-8") > SLUG_MAX_BYTES) break;
      kept.push(word);
    }
    // No single word fit: cut the first word on a byte boundary.
    slug = kept.length > 0 ? kept.join("-") : truncateBytes(words[0], SLUG_MAX_BYTES);
  }
  return slug.replace(/^-+|-+$/g, "") || "task";
}

/** Validate and normalise a branch namespace, always returned with a trailing slash. */
export function normalizePrefix(prefix) {
  const raw = prefix === undefined ? DEFAULT_PREFIX : String(prefix).trim();
  if (!raw) throw new Error("branch prefix cannot be empty");
  if (raw.includes("//")) throw new Error(`branch prefix is not a valid git namespace: ${prefix}`);
  const withoutTrailing = raw.replace(/\/+$/, "");
  const components = withoutTrailing.split("/");
  if (
    raw.includes("\\") ||
    /[\s~^:?*\[\\\u0000-\u0020\u007f]/.test(raw) ||
    withoutTrailing.startsWith("/") ||
    components.some((c) => c === "" || c === "." || c === ".." || c.startsWith(".") || c.endsWith(".lock"))
  ) {
    throw new Error(`branch prefix is not a valid git namespace: ${prefix}`);
  }
  return `${withoutTrailing}/`;
}

/** Strip characters git forbids in a ref, preserving case. */
function sanitizeTaskId(taskId) {
  const cleaned = String(taskId)
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "");
  if (!cleaned) throw new Error("task id contains no usable characters");
  return cleaned;
}

/**
 * Derive the full branch name. The id is never truncated; the slug absorbs the length cap.
 */
export function deriveBranchName({ taskId, title, prefix } = {}) {
  const namespace = normalizePrefix(prefix);
  const slug = deriveSlug(title);
  const id = taskId ? sanitizeTaskId(taskId) : null;
  const name = id ? `${namespace}${id}-${slug}` : `${namespace}${WIP_SEGMENT}-${slug}`;

  if (Buffer.byteLength(name, "utf-8") <= BRANCH_MAX_BYTES) return name;

  // Shorten the slug until the branch fits; the id is inviolable.
  const fixedBytes = Buffer.byteLength(id ? `${namespace}${id}-` : `${namespace}${WIP_SEGMENT}-`, "utf-8");
  const budget = Math.max(1, BRANCH_MAX_BYTES - fixedBytes);
  if (fixedBytes + 1 > BRANCH_MAX_BYTES) {
    throw new Error(`branch prefix and task id leave no room for a slug: ${name}`);
  }
  const shortened = truncateBytes(slug, budget).replace(/-+$/g, "") || "task";
  const final = id ? `${namespace}${id}-${shortened}` : `${namespace}${WIP_SEGMENT}-${shortened}`;
  if (Buffer.byteLength(final, "utf-8") > BRANCH_MAX_BYTES) {
    throw new Error(`branch name exceeds ${BRANCH_MAX_BYTES} bytes: ${final}`);
  }
  return final;
}

/** Read a task title from the backlog CLI so the slug is never retyped by the caller. */
export function readTaskTitle(taskId) {
  let stdout;
  try {
    stdout = execFileSync("backlog", ["task", "view", taskId, "--json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const detail = error.stderr
      ? String(error.stderr).trim().split("\n")[0].replace(/\.\s*$/, "")
      : error.message;
    throw new Error(`cannot read task ${taskId} from backlog: ${detail}. Pass --title to derive a name without the backlog CLI.`);
  }
  let payload;
  try {
    payload = JSON.parse(stdout);
  } catch {
    throw new Error(`backlog returned unparseable JSON for task ${taskId}. Pass --title to derive a name without the backlog CLI.`);
  }
  const title = payload?.task?.title;
  if (!title) throw new Error(`task ${taskId} has no title to derive a slug from. Pass --title explicitly.`);
  return title;
}

function parseArgs(argv) {
  const args = { task: undefined, title: undefined, prefix: undefined, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") args.json = true;
    else if (arg === "--task" || arg === "-t") args.task = argv[++i];
    else if (arg === "--title") args.title = argv[++i];
    else if (arg === "--prefix" || arg === "-p") args.prefix = argv[++i];
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 2;
  }
  if (args.help) {
    process.stdout.write(
      "usage: branch-name.mjs [--task ID] [--title TITLE] [--prefix NS] [--json]\n" +
        "  --task    backlog task id; its title is read via the backlog CLI unless --title is given\n" +
        "  --title   title to slug; without --task the branch becomes <prefix>wip-<slug>\n",
    );
    return 0;
  }

  try {
    if (!args.task && !args.title) {
      process.stderr.write("provide --task, or --title for work with no task\n");
      return 2;
    }
    const title = args.title ?? readTaskTitle(args.task);
    const branch = deriveBranchName({ taskId: args.task, title, prefix: args.prefix });
    if (args.json) {
      process.stdout.write(`${JSON.stringify({ branch, title, taskId: args.task ?? null, slug: deriveSlug(title) })}\n`);
    } else {
      process.stdout.write(`${branch}\n`);
    }
    return 0;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)));
}
