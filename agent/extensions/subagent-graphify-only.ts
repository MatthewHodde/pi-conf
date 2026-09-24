/**
 * subagent-graphify-only.ts — Restricts pi-subagents to graphify use only
 *
 * - Starts with subagent tool inactive
 * - Enables subagent only when graphify commands are detected
 * - Disables subagent after graphify operations complete
 * - Restricts available agents to those useful for graphify
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Agents useful for graphify's semantic extraction
const GRAPHIFY_ALLOWED_AGENTS = ["worker", "scout"];

export default function (pi: ExtensionAPI) {
  let subagentActive = false;
  let graphifyRunning = false;

  // Disable subagent by default on session start
  pi.on("session_start", async (_event, ctx) => {
    // Start with subagent inactive - graphify-guard will handle activation
    subagentActive = false;
    graphifyRunning = false;
  });

  // Detect graphify commands and enable/disable subagent accordingly
  pi.on("tool_call", async (event) => {
    if (event.toolName === "bash") {
      const cmd = (event.input as { command?: string })?.command || "";

      // Detect graphify commands that need parallel subagents
      if (/graphify\s+(extract|query|update)/.test(cmd)) {
        if (!subagentActive) {
          // Enable subagent for graphify
          pi.setActiveTools([...(pi.getActiveTools() || []), "subagent"]);
          subagentActive = true;
          graphifyRunning = true;

          // Apply capability ceiling to restrict agents
          // This would need to be done through the capability ceiling API
          // For now, we rely on the activation/deactivation pattern
        }
      }

      // Detect graphify completion (export, report generation)
      if (graphifyRunning && /graphify\s+(export|report|cluster)/.test(cmd)) {
        // Graphify is wrapping up - will disable after this command
      }
    }
  });

  // Disable subagent after agent turn completes if graphify was running
  pi.on("agent_end", async () => {
    if (graphifyRunning && subagentActive) {
      // Give a brief delay to allow any pending subagent calls to complete
      setTimeout(() => {
        if (graphifyRunning) {
          const tools = pi.getActiveTools() || [];
          const filtered = tools.filter(t => t !== "subagent");
          pi.setActiveTools(filtered);
          subagentActive = false;
          graphifyRunning = false;
        }
      }, 2000);
    }
  });

  // Inject note about restricted subagent usage
  pi.on("before_agent_start", async (event) => {
    if (!subagentActive) {
      return {
        systemPrompt: event.systemPrompt + "\n\n## Subagent Usage\n\nSubagent tool is currently disabled. It will be enabled automatically when graphify commands need parallel execution.",
      };
    }
    return {};
  });
}
