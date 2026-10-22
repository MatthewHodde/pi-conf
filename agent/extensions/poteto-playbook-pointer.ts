import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const POTETO_SKILL_URL = new URL(
  "../npm/node_modules/@whamp/pi-pstack/skills/poteto-mode/SKILL.md",
  import.meta.url,
);

export const POTETO_SKILL_PATH = fileURLToPath(POTETO_SKILL_URL);

export const POTETO_PLAYBOOKS_DIR = fileURLToPath(new URL("playbooks/", POTETO_SKILL_URL));

const NUDGE_OFF_VALUES = new Set(["0", "false", "no", "off"]);

export function nudgeDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.PI_POTETO_NUDGE;
  if (raw === undefined) return false;
  return NUDGE_OFF_VALUES.has(raw.trim().toLowerCase());
}

const PLAYBOOK_TRIGGERS: readonly (readonly [string, string])[] = [
  ["Read-only question about how or why something works", "investigation.md"],
  ["Reported defect to reproduce, root-cause, and fix", "bug-fix.md"],
  ["Measured slowness to trace and improve against a baseline", "perf-issue.md"],
  ["Sustained push on one metric against a target", "hillclimb.md"],
  ["Live runtime symptom (leak, idle-CPU spin, glitch)", "runtime-forensics.md"],
  ["Captured artifact to diagnose (cpuprofile, trace, heap snapshot)", "trace-forensics.md"],
  ["New or changed behavior from a named data shape", "feature.md"],
  ["Behavior-preserving change to structure or shape", "refactoring.md"],
  ["Throwaway sketch to settle a design or empirical fork", "prototype.md"],
  ["Pixel-exact UI equivalence between two implementations", "visual-parity.md"],
  ["Writing or editing a SKILL.md", "authoring-a-skill.md"],
  ["Test how a skill or prompt change affects behavior", "eval.md"],
  ["Bring requested PRs to merge-ready (conflicts, threads, CI)", "babysit.md"],
  ["Verify green PRs, then land only authorized ones", "shipping.md"],
  ["Long task to drive to completion without stopping", "autonomous-run.md"],
  ["Standing project for one coordinator over many days", "orchestrate.md"],
  ["Queue of independent PRs run to merged with full autonomy", "autopilot-full.md"],
  ["Build and verify PRs while the operator keeps landing", "autopilot-stack.md"],
  ["Resume another agent's in-flight work", "session-pickup.md"],
  ["Suspend in-flight work so it can resume later", "pause-safely.md"],
  ["Work that spans phases or independent PRs", "multi-phase-plan.md"],
  ["Reclaim disk from merged worktrees and stale simulators", "worktree-cleanup.md"],
  ["The last step of every other playbook", "opening-a-pr.md"],
];

const PLAYBOOK_TABLE = PLAYBOOK_TRIGGERS.map(
  ([trigger, file]) => `- ${trigger} -> ${POTETO_PLAYBOOKS_DIR}${file}`,
).join("\n");

export const POTETO_PLAYBOOK_POINTER = `## Poteto mode for task work

When the task changes code, tests, docs, a plan, a review, or an investigation, poteto mode runs the session.
Your first tool call must read the skill, before any other call:

    ${POTETO_SKILL_PATH}

Your second tool call must read the playbook that matches the task. Match with this table:
${PLAYBOOK_TABLE}

Then work the task. Copy the playbook steps into the todolist before your first edit.

Do not start task work from memory. No matching row means no playbook.

First call: the skill. Second call: the matched playbook. Then the task.`;

export const POTETO_NUDGE = `Rule for this task, before you do anything else:
First tool call: read ${POTETO_SKILL_PATH}.
Second tool call: read the playbook that matches this task. The match table sits in your system prompt under "Poteto mode for task work".
Then do the task. Copy the playbook steps into the todolist before your first edit.`;

export default function (pi: ExtensionAPI) {
  // PI_POTETO_NUDGE=off skips both handlers: the system block and the task-turn
  // message. Env vars are read-only for the process lifetime, so a factory guard
  // costs nothing per turn when off.
  if (nudgeDisabled()) return;

  // Chain-append, same as host-tests-pointer.ts: the deepwiki-guard force-chain
  // re-derives the prompt every run, so chaining is the order-invariant path.
  pi.on("before_agent_start", async (event) => ({
    systemPrompt: event.systemPrompt + "\n\n" + POTETO_PLAYBOOK_POINTER,
  }));

  // The system block alone opened 0 playbooks in 4 graded weak-model runs.
  // The same rule in the task turn opened one in 3 of 3. Deliver both.
  pi.on("before_agent_start", async (event) => {
    if (event.messageType !== "user") return;
    return {
      message: {
        customType: "poteto-nudge",
        content: POTETO_NUDGE,
        display: true,
      },
    };
  });
}
