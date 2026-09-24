/**
 * graphify-guard.ts — Pi extension for Graphify integration
 *
 * - Detects if graphify CLI is installed
 * - Detects if current repo is indexed (graphify-out/)
 * - Injects graphify context into system prompt when available
 * - Provides fallback instructions when unavailable
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

interface GraphifyState {
  cliAvailable: boolean;
  repoIndexed: boolean;
  graphPath: string | null;
}

function detectGraphify(cwd: string): GraphifyState {
  // Check if graphify CLI is installed
  let cliAvailable = false;
  try {
    execSync("which graphify", { stdio: "ignore" });
    cliAvailable = true;
  } catch {
    // not installed
  }

  // Check if current repo is indexed
  // 1. cwd/graphify-out/ (project-local)
  // 2. PROJECT_PATH/graphify-out/ (env var fallback)
  const graphPath = join(cwd, "graphify-out", "graph.json");
  const projectGraph = process.env.PROJECT_PATH
    ? join(process.env.PROJECT_PATH, "graphify-out", "graph.json")
    : null;
  const resolved = existsSync(graphPath)
    ? graphPath
    : projectGraph && existsSync(projectGraph)
      ? projectGraph
      : null;

  return {
    cliAvailable,
    repoIndexed: resolved !== null,
    graphPath: resolved,
  };
}

function buildGraphifyContext(state: GraphifyState): string {
  if (!state.cliAvailable) {
    return [
      "## Graphify (Unavailable)",
      "",
      "Graphify CLI not installed. If you need codebase graph queries, ask the user to install it.",
      "Fallback: use standard file reading and grep for codebase exploration.",
      "",
    ].join("\n");
  }

  if (!state.repoIndexed) {
    return [
      "## Graphify (Installed, Not Indexed)",
      "",
      "Graphify is installed but this repo is not indexed yet.",
      "To index: run `graphify extract` in the project root.",
      "Fallback: use standard file reading and grep until indexed.",
      "",
    ].join("\n");
  }

  const lines = [
    "## Graphify (Available)",
    "",
    "Graphify is available for codebase queries.",
    "",
    "**CRITICAL: NEVER use API keys. Always use the host agent (pi) as the LLM.**",
    "- Do NOT use OpenAI, Anthropic, Gemini, or any remote API",
    "- Do NOT prompt the user for API keys",
    "- Do NOT check if API keys are set",
    "- Omit --backend flag to use the host agent automatically",
    "- Graphify works without any API key",
    "",
    "**Source order for codebase exploration:**",
    "1. Graphify graph queries (fastest, structured)",
    "2. Project files directly (read, grep)",
    "3. Documentation and comments",
    "",
    "**Available commands:**",
    "- `graphify path \"A\" \"B\"` — shortest path between two nodes",
    "- `graphify explain \"X\"` — plain-language explanation of a node",
    "- `graphify query \"question\"` — BFS traversal for answers",
    "",
  ];

  return lines.join("\n");
}

export default function (pi: ExtensionAPI) {
  let graphifyState: GraphifyState = {
    cliAvailable: false,
    repoIndexed: false,
    graphPath: null,
  };

  // Detect graphify on session start
  pi.on("session_start", async (_event, ctx) => {
    graphifyState = detectGraphify(ctx.cwd);

    if (graphifyState.cliAvailable) {
      if (graphifyState.repoIndexed) {
        ctx.ui.notify("🔗 Graphify available — codebase graph indexed", "info");
      } else {
        ctx.ui.notify("🔗 Graphify installed — repo not indexed yet", "info");
      }
    }
  });

  // Re-detect on agent_start (in case cwd changed)
  pi.on("agent_start", async () => {
    // State will be refreshed on next before_agent_start via cwd
  });

  // Inject graphify context into system prompt
  pi.on("before_agent_start", async (event) => {
    return {
      systemPrompt: event.systemPrompt + "\n\n" + buildGraphifyContext(graphifyState),
    };
  });

  // Block graphify commands that use remote APIs or prompt for keys
  pi.on("tool_call", async (event) => {
    if (event.toolName === "bash") {
      const cmd = (event.input as { command?: string }).command || "";
      // Block extract/query/update/cluster/label with any --backend flag
      if (/graphify\s+(extract|query|update|cluster|label)/.test(cmd)) {
        if (/--backend/i.test(cmd)) {
          return {
            block: true,
            reason: "Do not specify --backend for graphify. Omit it to use the host agent (pi) as the LLM.",
          };
        }
      }
      // Block any attempt to set API keys
      if (/export\s+(OPENAI|ANTHROPIC|GEMINI|GOOGLE)_API_KEY/.test(cmd)) {
        return {
          block: true,
          reason: "API keys are not allowed. Use the host agent (pi) as the LLM instead.",
        };
      }
    }
  });
}
