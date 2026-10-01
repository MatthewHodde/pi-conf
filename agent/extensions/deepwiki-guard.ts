/**
 * deepwiki-guard.ts — Pi extension for DeepWiki MCP integration
 *
 * - Detects if DeepWiki MCP tools are available
 * - Injects research source order into system prompt
 * - Provides fallback instructions when DeepWiki is unavailable
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const DEEPWIKI_TOOLS = [
  "mcp__deepwiki__ask_wiki_question",
  "mcp__deepwiki__read_wiki_structure",
  "mcp__deepwiki__read_wiki_contents",
];

function detectDeepWiki(pi: ExtensionAPI): boolean {
  const activeTools = pi.getActiveTools();
  return DEEPWIKI_TOOLS.some((tool) => activeTools.includes(tool));
}

function buildResearchContext(available: boolean): string {
  if (available) {
    return [
      "## Research Sources (DeepWiki Available)",
      "",
      "When researching GitHub-hosted repos or tools, use this source order:",
      "1. Project itself (installed source, lockfile, changelog)",
      "2. Official docs (version-matched)",
      "3. DeepWiki MCP tools — preferred for public GitHub repos:",
      "   - `mcp__deepwiki__ask_wiki_question` — natural language query against repo wiki",
      "   - `mcp__deepwiki__read_wiki_structure` — table of contents for repo wiki",
      "   - `mcp__deepwiki__read_wiki_contents` — read specific wiki pages",
      "4. Open web (with discipline)",
      "",
      "DeepWiki is free for public repos, no API key needed. Use it before falling back to web search.",
      "",
    ].join("\n");
  }

  return [
    "## Research Sources (DeepWiki Unavailable)",
    "",
    "When researching GitHub-hosted repos or tools, use this source order:",
    "1. Project itself (installed source, lockfile, changelog)",
    "2. Official docs (version-matched)",
    "3. Open web (with discipline)",
    "",
    "DeepWiki MCP tools are not available.",
    "Fallback to web search for GitHub repo documentation.",
    "",
  ].join("\n");
}

export default function (pi: ExtensionAPI) {
  let deepWikiAvailable = false;

  // Detect DeepWiki on session start
  pi.on("session_start", async (_event, ctx) => {
    deepWikiAvailable = detectDeepWiki(pi);

    if (deepWikiAvailable) {
      ctx.ui.notify("📚 DeepWiki MCP available — GitHub repo research enabled", "info");
    }
  });

  // Re-detect after tool refresh (MCP servers connect asynchronously)
  pi.on("agent_start", async () => {
    const current = detectDeepWiki(pi);
    if (current !== deepWikiAvailable) {
      deepWikiAvailable = current;
    }
  });

  // Inject research context into system prompt
  pi.on("before_agent_start", async (event) => {
    // Re-detect here: MCP servers connect asynchronously after session_start,
    // and the built-in MCP extension waits for direct servers on this event.
    deepWikiAvailable = detectDeepWiki(pi);
    return {
      systemPrompt: event.systemPrompt + "\n\n" + buildResearchContext(deepWikiAvailable),
    };
  });
}
