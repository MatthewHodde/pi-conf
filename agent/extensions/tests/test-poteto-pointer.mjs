import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import extension, {
  POTETO_NUDGE,
  POTETO_PLAYBOOK_POINTER,
  POTETO_PLAYBOOKS_DIR,
  POTETO_SKILL_PATH,
  nudgeDisabled,
} from "../poteto-playbook-pointer.ts";

assert.equal(nudgeDisabled({}), false, "unset PI_POTETO_NUDGE keeps the nudge on");
assert.equal(
  nudgeDisabled({ PI_POTETO_NUDGE: "on" }),
  false,
  "unrecognized values keep the nudge on",
);
for (const value of ["0", "false", "FALSE", "no", "off", " Off "]) {
  assert.equal(nudgeDisabled({ PI_POTETO_NUDGE: value }), true, `${value} disables the nudge`);
}

const handlers = {};
const pi = {
  on(name, fn) {
    (handlers[name] ??= []).push(fn);
  },
  registerTool() {},
  registerCommand() {},
};
extension(pi);

assert.ok(
  handlers.before_agent_start?.length,
  "before_agent_start handlers register when PI_POTETO_NUDGE is unset",
);

const results = [];
for (const handler of handlers.before_agent_start) {
  results.push(await handler({ systemPrompt: "base", messageType: "user" }));
}
const systemResult = results.find((result) => result?.systemPrompt);
const nudgeIndex = results.findIndex((result) => result?.message);
assert.ok(systemResult, "one handler returns the chained system prompt");
assert.ok(nudgeIndex >= 0, "one handler returns the task-turn nudge");
const { systemPrompt } = systemResult;
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

const nudgeHandler = handlers.before_agent_start[nudgeIndex];
const nudgeMessage = results[nudgeIndex].message;
assert.equal(nudgeMessage.customType, "poteto-nudge", "nudge carries its custom type");
assert.ok(
  typeof nudgeMessage.content === "string" && nudgeMessage.content.includes(POTETO_SKILL_PATH),
  "nudge embeds the resolved skill path",
);
assert.ok(
  POTETO_NUDGE.includes('"Poteto mode for task work"'),
  "nudge points at the system block header",
);
const customRun = await nudgeHandler({ systemPrompt: "base", messageType: "custom" });
assert.equal(customRun, undefined, "nudge skips runs started by custom messages");

process.env.PI_POTETO_NUDGE = "off";
const disabled = {};
const disabledExtension = (
  await import(`../poteto-playbook-pointer.ts?disabled=${Date.now()}`)
).default;
disabledExtension({
  on(name, fn) {
    (disabled[name] ??= []).push(fn);
  },
  registerTool() {},
  registerCommand() {},
});
assert.deepEqual(
  disabled,
  {},
  "PI_POTETO_NUDGE=off registers no handlers: no system block, no message",
);
delete process.env.PI_POTETO_NUDGE;

console.log("poteto-playbook-pointer => ok");
