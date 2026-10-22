import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const POTETO_SKILL_URL = new URL(
  "../npm/node_modules/@whamp/pi-pstack/skills/poteto-mode/SKILL.md",
  import.meta.url,
);

export const POTETO_SKILL_PATH = fileURLToPath(POTETO_SKILL_URL);

export const POTETO_PLAYBOOKS_DIR = fileURLToPath(new URL("playbooks/", POTETO_SKILL_URL));

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

export const POTETO_PLAYBOOK_POINTER = `## Poteto playbooks for task work

Task-shaped work in this setup follows poteto mode. That covers code, review, plans, fixes, investigations, and shipping.
Do these four steps in order, before any other work:

1. Read ${POTETO_SKILL_PATH} and follow it for this session.
2. Match the task to one row below.
3. Read that playbook file now.
4. Copy its steps verbatim into the todolist. A skipped step stays with \`skip: <reason>\`.

No matching row means no playbook file. The skill in step 1 owns all other routing.
Never pick a playbook by default. Never start task work from memory.

Match with this table:
${PLAYBOOK_TABLE}`;

export default function (pi: ExtensionAPI) {
  // Chain-append, same as host-tests-pointer.ts: the deepwiki-guard force-chain
  // re-derives the prompt every run, so chaining is the order-invariant path.
  pi.on("before_agent_start", async (event) => ({
    systemPrompt: event.systemPrompt + "\n\n" + POTETO_PLAYBOOK_POINTER,
  }));
}
