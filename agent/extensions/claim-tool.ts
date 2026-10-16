/**
 * claim-tool.ts — the explicit way for an agent to claim or release a backlog task.
 *
 * Claiming is one action with two effects: it moves the task to In Progress
 * through the backlog CLI, and it announces the work on this instance. The tool
 * runs the status transition itself, so pickup never depends on a command string
 * being intercepted. The announcement rides the existing tool_result machinery:
 * backlog-title and instance-widget see the successful claim_task result through
 * changeFor/nextTitle, set the title and widget, and write the claim file, so the
 * explicit tool and the interception path converge on one claim and cannot
 * diverge. Release drops the announcement and leaves the task's status alone.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { CLAIM_TOOL, findTaskDir, taskExists } from "./lib/claim.ts";

const IN_PROGRESS = "In Progress";

interface ClaimParams {
  action?: string;
  id?: string;
}

function ok(text: string) {
  return { content: [{ type: "text" as const, text }], details: undefined };
}

function fail(text: string) {
  return { content: [{ type: "text" as const, text }], details: undefined, isError: true };
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: CLAIM_TOOL,
    label: "Claim Backlog Task",
    description:
      "Claim or release a backlog task for this instance. Claiming moves the task to In Progress and announces it here (terminal title, status line, and the host notification claim). Releasing drops the announcement without changing the task's status.",
    promptSnippet: "Claim/release a backlog task for this instance",
    parameters: {
      type: "object" as const,
      properties: {
        action: {
          type: "string",
          enum: ["claim", "release"],
          description: "claim to take a task, release to drop it",
        },
        id: {
          type: "string",
          description:
            "Backlog task id to claim (e.g. PI-067). Required for claim; ignored for release.",
        },
      },
      required: ["action"],
    },
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const { action, id } = params as ClaimParams;

      if (action === "release") return ok("Claim released.");
      if (action !== "claim") return fail(`Unknown action: ${action}`);

      // Backlog's own ids are uppercase and its CLI matches them case-sensitively,
      // so normalize once here; taskExists and the transition both use the canonical id.
      const wanted = typeof id === "string" ? id.trim().toUpperCase() : "";
      if (!wanted) return fail("claim requires a task id.");

      const taskDir = findTaskDir(ctx.cwd);
      if (!taskDir) return fail("No backlog found in this project.");
      if (!taskExists(taskDir, wanted)) return fail(`No backlog task ${wanted} found.`);

      const result = await pi.exec(
        "backlog",
        ["task", "edit", wanted, "-s", IN_PROGRESS],
        { cwd: ctx.cwd }
      );
      if (result.code !== 0) {
        return fail(
          `Could not move ${wanted} to In Progress: ${(result.stderr || result.stdout).trim()}`
        );
      }
      return ok(`Claimed ${wanted} and moved it to In Progress.`);
    },
  });
}
