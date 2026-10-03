/**
 * Contract test for the installed agent-ste package (npm:agent-ste).
 *
 * Run: node agent/extensions/tests/test-agent-ste.mjs
 *
 * Loads the installed extension.mjs against a stub pi API and fires the
 * tool_call / message_end / agent_settled events pi 1.0 emits
 * (event shape: { type:"tool_call", toolName, toolCallId, input }).
 *
 * Config cases run in child processes because the extension reads config once
 * at load time from process.cwd() and $STE_CONFIG.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const EXT_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "npm",
  "node_modules",
  "agent-ste",
  "extension.mjs",
);

const BAD_PROSE =
  "It is important to note that this module leverages a robust caching strategy in order to facilitate seamless performance improvements.";
const CLEAN_PROSE =
  "The cache holds the result. A service reads it fast.";
const BAD_COMMIT =
  'git commit -m "chore: leverage the robust pipeline in order to update our tooling"';
const GOOD_COMMIT = 'git commit -m "feat: add agent-ste package"';
// Exactly one hard fault (dictionary), so a config change is observable.
const DICT_ONLY = "This module leverages a cache.";
// Only soft faults (verb/passive), so it warns and never blocks.
const SOFT_ONLY = "The file was written by the tool. It is saved now.";

const SELF = fileURLToPath(import.meta.url);

function makeHost() {
  const state = { handlers: new Map(), tools: new Map(), commands: new Map(), messages: [], status: [], notices: [] };
  const pi = {
    on(name, fn) {
      if (!state.handlers.has(name)) state.handlers.set(name, []);
      state.handlers.get(name).push(fn);
    },
    registerTool(tool) {
      state.tools.set(tool.name, tool);
    },
    registerCommand(name, command) {
      state.commands.set(name, command);
    },
    sendMessage(message, options) {
      state.messages.push({ message, options });
    },
  };
  const ctx = {
    ui: {
      setStatus: (key, value) => state.status.push([key, value]),
      notify: (text, level) => state.notices.push([level, text]),
    },
  };
  return { pi, state, ctx };
}

/** Mirrors pi: every handler runs, first block result wins. */
function fireToolCall(state, ctx, event) {
  let result;
  for (const fn of state.handlers.get("tool_call") ?? []) {
    const out = fn({ type: "tool_call", toolCallId: "t1", ...event }, ctx);
    if (out?.block) result = out;
  }
  return result;
}

async function loadExtension(cwd, env = {}) {
  const { pi, state, ctx } = makeHost();
  const previous = { cwd: process.cwd() };
  const mod = await import(pathToFileURL(EXT_PATH).href + `?load=${Date.now()}`);
  // loadConfig runs at extension construction, not import, so cwd only matters here.
  process.chdir(cwd);
  try {
    mod.default(pi);
  } finally {
    process.chdir(previous.cwd);
  }
  return { state, ctx };
}

function write(toolPath, content) {
  return { toolName: "write", input: { path: toolPath, content } };
}
function edit(toolPath, newText) {
  return { toolName: "edit", input: { path: toolPath, edits: [{ newText }] } };
}
function bash(command) {
  return { toolName: "bash", input: { command } };
}

async function coreTests() {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  const { state, ctx } = await loadExtension(repoRoot);
  let passed = 0;
  const ok = (label) => {
    passed += 1;
    console.log(`ok - ${label}`);
  };

  assert.deepEqual([...state.tools.keys()].sort(), ["say", "ste_lint"], "registers ste_lint and say");
  assert.ok(state.commands.has("ste"), "registers /ste command");
  ok("extension loads and registers tools and command");

  const start = state.handlers.get("before_agent_start")[0]({});
  assert.ok(start.systemPrompt.includes("Simplified Technical English"), "STE rules reach the system prompt");
  ok("before_agent_start appends the STE rules");

  const blockedWrite = fireToolCall(state, ctx, write("/tmp/x.md", BAD_PROSE));
  assert.ok(blockedWrite?.block, "hard fault blocks a write");
  assert.match(blockedWrite.reason, /dictionary\/not-approved-word/, "block reason names the rule");
  ok("hard fault blocks write with a named rule");

  assert.equal(fireToolCall(state, ctx, write("/tmp/x.md", CLEAN_PROSE)), undefined, "clean write passes");
  ok("clean write passes");

  const blockedEdit = fireToolCall(state, ctx, edit("/tmp/x.md", BAD_PROSE));
  assert.ok(blockedEdit?.block, "hard fault blocks an edit");
  ok("hard fault blocks edit newText");

  const blockedCommit = fireToolCall(state, ctx, bash(BAD_COMMIT));
  assert.ok(blockedCommit?.block, "hard fault blocks a commit message");
  assert.match(blockedCommit.reason, /dictionary\/not-approved-word/, "commit block names the rule");
  ok("hard fault blocks git commit -m message");

  assert.equal(fireToolCall(state, ctx, bash(GOOD_COMMIT)), undefined, "clean commit passes");
  ok("clean git commit passes");

  assert.equal(fireToolCall(state, ctx, bash("echo hello")), undefined, "non-commit bash untouched");
  ok("non-commit bash command untouched");

  const passive = fireToolCall(state, ctx, write("/tmp/y.md", SOFT_ONLY));
  assert.equal(passive, undefined, "soft rule warns without blocking");
  assert.ok(
    state.status.some(([, value]) => /STE 0 hard \/ [1-9]/.test(String(value))),
    "status bar reports the soft fault",
  );
  ok("soft rule warns and never blocks");

  const lintTool = state.tools.get("ste_lint");
  const lintResult = await lintTool.execute("1", { text: BAD_PROSE });
  assert.match(lintResult.content[0].text, /hard/, "ste_lint reports violations");
  ok("ste_lint tool returns violations");

  const cleanLint = await lintTool.execute("2", { text: CLEAN_PROSE });
  assert.equal(cleanLint.content[0].text, "No violation.", "ste_lint passes clean prose");
  ok("ste_lint passes clean prose");

  const sayResult = await state.tools.get("say").execute("3", { text: CLEAN_PROSE });
  assert.equal(sayResult.content[0].text, CLEAN_PROSE, "say returns text unchanged in normal mode");
  ok("say tool echoes text unchanged outside strict mode");

  const messageEnd = state.handlers.get("message_end")[0];
  messageEnd(
    { message: { role: "assistant", content: [{ type: "text", text: BAD_PROSE }] } },
    ctx,
  );
  state.handlers.get("agent_settled")[0]();
  assert.equal(state.messages.length, 1, "reply note delivered");
  assert.equal(state.messages[0].message.customType, "ste-violation", "note typed as ste-violation");
  assert.equal(state.messages[0].options.deliverAs, "nextTurn", "settled reply note lands next turn");
  ok("hard reply fault sends a ste-violation note");

  console.log(`\n${passed} core assertions passed`);
}

async function configCase(caseName) {
  const dir = mkdtempSync(join(tmpdir(), `ste-${caseName}-`));
  mkdirSync(join(dir, "nested"), { recursive: true });
  if (caseName === "project-wins") {
    writeFileSync(join(dir, ".ste.json"), JSON.stringify({ rules: { "dictionary/not-approved-word": "soft" } }));
  }
  if (caseName === "bad-config") {
    writeFileSync(join(dir, ".ste.json"), JSON.stringify({ rules: { "dictionary/typo-rule": "hard" } }));
  }
  const { state, ctx } = await loadExtension(join(dir, "nested"));
  const result = fireToolCall(state, ctx, write("/tmp/x.md", DICT_ONLY));
  if (caseName === "bad-config") {
    const sessionStart = state.handlers.get("session_start");
    assert.ok(sessionStart, "session_start handler registered");
    sessionStart[0]({}, ctx);
    assert.ok(state.notices.some(([, text]) => /no rule/.test(text)), "broken config warns by name");
    assert.ok(result?.block, "broken config keeps built-in defaults");
    process.stdout.write("warned+blocked\n");
    return;
  }
  process.stdout.write(result?.block ? "blocked\n" : "passed\n");
}

async function steConfigCase() {
  const config = join(tmpdir(), `ste-env-${process.pid}.json`);
  writeFileSync(config, JSON.stringify({ rules: { "dictionary/not-approved-word": "off" } }));
  process.env.STE_CONFIG = config;
  const dir = mkdtempSync(join(tmpdir(), "ste-env-run-"));
  const { state, ctx } = await loadExtension(dir);
  const result = fireToolCall(state, ctx, write("/tmp/x.md", DICT_ONLY));
  process.stdout.write(result?.block ? "blocked\n" : "passed\n");
}

function runChild(caseName, options = {}) {
  const stdout = execFileSync(process.execPath, [SELF, "--child", caseName], {
    encoding: "utf8",
    env: options.env ?? process.env,
  }).trim();
  return stdout.split("\n").at(-1);
}

async function configTests() {
  assert.equal(runChild("default"), "blocked", "default severities block hard faults");
  console.log("ok - default severities block hard faults");
  assert.equal(runChild("project-wins"), "passed", "project .ste.json downgrades a rule");
  console.log("ok - project .ste.json wins over defaults");
  assert.equal(runChild("bad-config"), "warned+blocked", "broken .ste.json warns by name and keeps defaults");
  console.log("ok - broken config warns by name and keeps defaults");
  assert.equal(runChild("ste-config"), "passed", "STE_CONFIG file applies");
  console.log("ok - STE_CONFIG override applies");
}

const args = process.argv.slice(2);
if (args[0] === "--child") {
  if (args[1] === "ste-config") await steConfigCase();
  else await configCase(args[1]);
} else {
  await coreTests();
  await configTests();
  console.log("\nall agent-ste contract tests passed");
}
