import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const HOST_TESTS_SKILL_PATH = fileURLToPath(
  new URL("../skills/host-tests/SKILL.md", import.meta.url),
);

export const HOST_TESTS_POINTER = `## Host machine check — read this first

When you need proof about the real host machine — the operator's actual workstation rather than a dev box, a real build, KVM, host hardware, or host network — your first tool call must read the host-tests skill at:

    ${HOST_TESTS_SKILL_PATH}

then follow it exactly. The skill owns the script format, the result record, the shared-mount \`.host-tests/\` channel, and the one-command handoff to the operator. Never invent a different check convention, never write results to a sandbox-local path, never ask the operator to paste output back.`;

export default function (pi: ExtensionAPI) {
  // Chains event.systemPrompt instead of mutating systemPromptOptions.sections:
  // this repo's deepwiki-guard force-replaces the prompt every run, shadowing
  // section mutations from later handlers; chaining is order-invariant.
  pi.on("before_agent_start", async (event) => ({
    systemPrompt: event.systemPrompt + "\n\n" + HOST_TESTS_POINTER,
  }));
}
