import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import extension, { HOST_TESTS_POINTER, HOST_TESTS_SKILL_PATH } from "../host-tests-pointer.ts";

const handlers = {};
extension({
  on(name, fn) {
    (handlers[name] ??= []).push(fn);
  },
  registerTool() {},
  registerCommand() {},
});

assert.ok(
  handlers.before_agent_start?.length,
  "before_agent_start handler registered unconditionally (factory has no env guard)",
);

const [promptHandler] = handlers.before_agent_start;
const { systemPrompt } = await promptHandler({ systemPrompt: "base" });
assert.ok(
  systemPrompt.startsWith("base\n\n"),
  "chained prompt keeps the base prompt intact at the front",
);
assert.ok(
  systemPrompt.endsWith(HOST_TESTS_POINTER),
  "chained prompt ends exactly with HOST_TESTS_POINTER",
);

assert.ok(
  HOST_TESTS_POINTER.includes(HOST_TESTS_SKILL_PATH),
  "HOST_TESTS_POINTER embeds the resolved skill path",
);
assert.ok(
  HOST_TESTS_SKILL_PATH.endsWith("agent/skills/host-tests/SKILL.md"),
  "resolved skill path ends with agent/skills/host-tests/SKILL.md",
);

assert.ok(
  existsSync(HOST_TESTS_SKILL_PATH),
  "resolved skill path points at a real file on disk",
);

console.log("host-tests-pointer => ok");
