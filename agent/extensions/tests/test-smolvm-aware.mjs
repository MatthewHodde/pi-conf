import assert from "node:assert/strict";
import extension from "../smolvm-aware.ts";

process.env.SMOLVM = "1";

const handlers = {};
extension({
  on(name, fn) {
    (handlers[name] ??= []).push(fn);
  },
  registerTool() {},
  registerCommand() {},
});

assert.ok(handlers.tool_call?.length, "tool_call handler registered");

const [promptHandler] = handlers.before_agent_start;
assert.ok(promptHandler, "before_agent_start handler registered");
const prompt = await promptHandler({ systemPrompt: "base" });
assert.ok(
  prompt.systemPrompt.includes(
    "Nested VM and container tests are allowed, the operator opened this session for them.",
  ),
  "sandbox prompt states nested tests are allowed",
);
assert.ok(
  !prompt.systemPrompt.includes("Do NOT attempt to run nested VMs"),
  "old nested VM ban gone from prompt",
);

const fire = (command) =>
  handlers.tool_call[0]({ toolName: "bash", input: { command } });

const push = await fire("git push origin main");
assert.equal(push?.block, true, "git push blocked in sandbox");
assert.ok(push.reason.includes("Stop and ask the user"), "push block reason is instructive");

for (const cmd of [
  "smolvm run alpine echo hi",
  "docker run --rm ubuntu echo hi",
  "qemu-system-x86_64 --version",
  "vagrant up default",
  "echo hello",
]) {
  assert.equal(await fire(cmd), undefined, `no longer blocked: ${cmd.split(" ")[0]}`);
}

console.log("smolvm-aware policy => ok");
