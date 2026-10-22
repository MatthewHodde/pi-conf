import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import extension, {
  POTETO_PLAYBOOK_POINTER,
  POTETO_PLAYBOOKS_DIR,
  POTETO_SKILL_PATH,
} from "../poteto-playbook-pointer.ts";

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
  systemPrompt.endsWith(POTETO_PLAYBOOK_POINTER),
  "chained prompt ends exactly with POTETO_PLAYBOOK_POINTER",
);

assert.ok(
  POTETO_PLAYBOOK_POINTER.includes(POTETO_SKILL_PATH),
  "pointer embeds the resolved skill path",
);
assert.ok(
  POTETO_SKILL_PATH.endsWith(
    "agent/npm/node_modules/@whamp/pi-pstack/skills/poteto-mode/SKILL.md",
  ),
  "resolved skill path points inside the pstack package",
);
assert.ok(existsSync(POTETO_SKILL_PATH), "skill path points at a real file on disk");
assert.ok(existsSync(POTETO_PLAYBOOKS_DIR), "playbooks directory exists on disk");

const onDisk = readdirSync(POTETO_PLAYBOOKS_DIR)
  .filter((name) => name.endsWith(".md"))
  .sort();
const listed = onDisk.filter((name) =>
  POTETO_PLAYBOOK_POINTER.includes(`${POTETO_PLAYBOOKS_DIR}${name}`),
);
assert.deepEqual(
  listed,
  onDisk,
  `pointer misses playbook files: ${onDisk.filter((name) => !listed.includes(name)).join(", ")}`,
);
assert.ok(onDisk.length >= 23, `expected at least 23 playbooks, found ${onDisk.length}`);

for (const name of onDisk) {
  assert.ok(
    existsSync(`${POTETO_PLAYBOOKS_DIR}${name}`),
    `playbook path missing on disk: ${name}`,
  );
}

console.log("poteto-playbook-pointer => ok");
