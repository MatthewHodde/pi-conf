/**
 * Test suite for backlog-guard.ts
 *
 * Run: node agent/extensions/test-backlog-guard.mjs
 *
 * Tests:
 * 1. Pure functions (unit)
 * 2. MCP server connectivity
 * 3. Filesystem helpers
 */

import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const TEST_DIR = join(import.meta.dirname, ".test-backlog");
const TASK_DIR = join(TEST_DIR, "backlog/tasks");

// ── Helpers (extracted from extension) ─────────────────────────────────────────

function isTaskExactMatch(taskId, filename) {
  const pattern = new RegExp(`^${taskId.replace(/[-]/g, "\\$&")}\\s*-`, "i");
  return pattern.test(filename.replace(/\.md$/, ""));
}

function listTaskFiles(taskDir) {
  try {
    return readdirSync(taskDir).filter((f) => f.endsWith(".md"));
  } catch {
    return [];
  }
}

function readTaskStatus(taskDir, filename) {
  try {
    const content = readFileSync(join(taskDir, filename), "utf-8");
    const match = content.match(/^status:\s*["']?(.+?)["']?\s*$/m);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

function findActiveTask(taskDir) {
  const files = listTaskFiles(taskDir);
  for (const file of files) {
    const status = readTaskStatus(taskDir, file);
    if (!status || status.toLowerCase() !== "in progress") continue;
    const idMatch = file.match(/^((?:pi|task)-\d+)/i);
    const id = idMatch ? idMatch[1].toUpperCase() : file.replace(/\.md$/, "").split(" - ")[0];
    return { id, title: file.split(" - ").slice(1).join(" - ").replace(/\.md$/, "") || "Untitled" };
  }
  return null;
}

function findTaskDir(cwd, overrideProjectPath) {
  const CONFIG_CANDIDATES = ["backlog/config.yml", "backlog/backlog.config.yml", ".backlog/config.yml", "backlog.config.yml"];
  const TASK_DIR_CANDIDATES = ["backlog/tasks", ".backlog/tasks"];
  const searchPaths = [...new Set([overrideProjectPath ?? process.env.PROJECT_PATH, cwd].filter(Boolean))];

  for (const base of searchPaths) {
    for (const config of CONFIG_CANDIDATES) {
      if (existsSync(join(base, config))) return join(base, "backlog/tasks");
    }
    for (const taskDir of TASK_DIR_CANDIDATES) {
      if (existsSync(join(base, taskDir))) return join(base, taskDir);
    }
  }
  return null;
}

const CONTENT_FIELDS = [
  "planSet", "planAppend", "planClear",
  "notesSet", "notesAppend", "notesClear",
  "implementationNotes",
  "acceptanceCriteriaSet", "acceptanceCriteriaAdd",
  "definitionOfDoneAdd",
  "finalSummary", "finalSummaryAppend",
];

// ── Test framework ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || "Assertion failed");
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(msg || `Expected ${expected}, got ${actual}`);
  }
}

// ── Setup ──────────────────────────────────────────────────────────────────────

function setup() {
  mkdirSync(TASK_DIR, { recursive: true });

  // Create test tasks
  writeFileSync(join(TASK_DIR, "pi-001 - todo-task.md"), `# Task PI-001 - todo-task
status: To Do
`);

  writeFileSync(join(TASK_DIR, "pi-002 - in-progress-task.md"), `# Task PI-002 - in-progress-task
status: In Progress
`);

  writeFileSync(join(TASK_DIR, "pi-003 - done-task.md"), `# Task PI-003 - done-task
status: Done
`);

  writeFileSync(join(TASK_DIR, "pi-015 - exact-match.md"), `# Task PI-015 - exact-match
status: To Do
`);

  writeFileSync(join(TASK_DIR, "pi-0150 - should-not-match.md"), `# Task PI-0150 - should-not-match
status: To Do
`);
}

function teardown() {
  rmSync(TEST_DIR, { recursive: true, force: true });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

console.log("\n=== isTaskExactMatch ===");

test("matches pi-015 with title", () => {
  assertEqual(isTaskExactMatch("pi-015", "pi-015 - title.md"), true);
});

test("rejects pi-0150 when looking for pi-015", () => {
  assertEqual(isTaskExactMatch("pi-015", "pi-0150 - title.md"), false);
});

test("rejects pi-10 when looking for pi-1", () => {
  assertEqual(isTaskExactMatch("pi-1", "pi-10 - title.md"), false);
});

test("matches task-1", () => {
  assertEqual(isTaskExactMatch("task-1", "task-1 - foo.md"), true);
});

test("case insensitive", () => {
  assertEqual(isTaskExactMatch("PI-015", "pi-015 - title.md"), true);
});

console.log("\n=== readTaskStatus ===");

test("reads To Do status", () => {
  setup();
  assertEqual(readTaskStatus(TASK_DIR, "pi-001 - todo-task.md"), "To Do");
  teardown();
});

test("reads In Progress status", () => {
  setup();
  assertEqual(readTaskStatus(TASK_DIR, "pi-002 - in-progress-task.md"), "In Progress");
  teardown();
});

test("returns null for missing file", () => {
  assertEqual(readTaskStatus(TASK_DIR, "nonexistent.md"), null);
});

console.log("\n=== findActiveTask ===");

test("finds In Progress task", () => {
  setup();
  const active = findActiveTask(TASK_DIR);
  assert(active !== null, "Should find active task");
  assertEqual(active.id, "PI-002");
  teardown();
});

test("returns null when no active task", () => {
  setup();
  // Remove in-progress task
  rmSync(join(TASK_DIR, "pi-002 - in-progress-task.md"));
  const active = findActiveTask(TASK_DIR);
  assertEqual(active, null);
  teardown();
});

console.log("\n=== findTaskDir ===");

test("finds task dir via config", () => {
  setup();
  const found = findTaskDir(TEST_DIR, TEST_DIR);
  assertEqual(found, TASK_DIR);
  teardown();
});

test("returns null when not found", () => {
  const found = findTaskDir("/tmp/nonexistent", "/tmp/nonexistent");
  assertEqual(found, null);
});

console.log("\n=== listTaskFiles ===");

test("lists only .md files", () => {
  setup();
  const files = listTaskFiles(TASK_DIR);
  assertEqual(files.length, 5);
  assert(files.every((f) => f.endsWith(".md")), "All files should be .md");
  teardown();
});

test("returns empty array for missing dir", () => {
  const files = listTaskFiles("/tmp/nonexistent");
  assertEqual(files.length, 0);
});

console.log("\n=== CONTENT_FIELDS detection ===");

test("detects content fields in input", () => {
  const input = { id: "pi-001", planSet: "my plan" };
  const hasContent = CONTENT_FIELDS.some((f) => {
    const val = input[f];
    return val !== undefined && val !== null && val !== "";
  });
  assertEqual(hasContent, true);
});

test("no content fields for status-only edit", () => {
  const input = { id: "pi-001", status: "In Progress" };
  const hasContent = CONTENT_FIELDS.some((f) => {
    const val = input[f];
    return val !== undefined && val !== null && val !== "";
  });
  assertEqual(hasContent, false);
});

console.log("\n=== MCP server connectivity ===");

test("backlog mcp start responds", () => {
  const result = execSync(
    `echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}' | timeout 5 backlog mcp start 2>/dev/null`,
    { encoding: "utf-8" }
  );
  assert(result.includes("backlog.md"), "Should contain server info");
  assert(result.includes('"tools"'), "Should expose tools");
});

// ── Summary ────────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
