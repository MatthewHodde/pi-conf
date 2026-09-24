---
id: PI-003
title: add deepwiki mcp and integrate with skills
status: Done
assignee: []
created_date: '2026-09-09 14:58'
updated_date: '2026-09-24 02:25'
labels: []
dependencies: []
type: feature
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
DeepWiki MCP is a remote MCP server at https://mcp.deepwiki.com/mcp that queries public GitHub repo wikis and documentation.

Tools provided:
- ask_question: Natural language query against a repo's wiki
- read_wiki_structure: Table of contents for a repo's wiki
- read_wiki_contents: Read specific wiki pages

Install: configure MCP server in pi, verify tools available.
Integration: update existing skills to use deepwiki as part of research when working with GitHub-hosted repos/tools. Fallback to web search when deepwiki doesn't have the repo.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 MCP server https://mcp.deepwiki.com/mcp configured in pi
- [x] #2 deepwiki tools (ask_question, read_wiki_structure, read_wiki_contents) available in session
- [x] #3 Can query public repo wikis without cloning
- [x] #4 MCP server https://mcp.deepwiki.com/mcp configured in pi
- [x] #5 deepwiki tools available in session (ask_question, read_wiki_structure, read_wiki_contents)
- [x] #6 Skills that research public repos use deepwiki when available
- [x] #7 Fallback to web search when deepwiki lacks coverage
- [x] #8 Skill documentation mentions deepwiki as preferred source for GitHub repo docs
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Progress - 2026-09-17

### Security Review Complete
- Reviewed pi-mcp-extension v1.5.0 source code
- Verdict: Safe to install (Low Risk)
- Dependencies: @modelcontextprotocol/sdk ^1.29.0 (17 transitive, 3 past CVEs all fixed), zod ^3.25.0 (0 deps, 1 past CVE fixed)
- Only medium finding: process.env passed to stdio child processes (standard MCP behavior)

### Installed
- pi install npm:pi-mcp-extension — success, 0 vulnerabilities
- Extension in ~/.pi/agent/npm/node_modules/pi-mcp-extension
- Package registered in settings.json packages list

### Configured
- Created ~/.pi/agent/mcp.json
- DeepWiki endpoint: https://mcp.deepwiki.com/mcp (streamable-http)
- Lifecycle: eager (connects at session start)
- Tools will register as mcp_deepwiki_*

### Still TODO
- Verify tools load on next pi session restart
- Update skills to use deepwiki tools for GitHub repo research
- Add fallback to web search when deepwiki unavailable

### Skill Integration - 2026-09-17

Updated coding SKILL.md:
- Added DeepWiki MCP tools to source order in verification section
- DeepWiki sits between official docs and open web in priority
- Tools: mcp_deepwiki_ask_question, mcp_deepwiki_read_wiki_structure, mcp_deepwiki_read_wiki_contents
- Fallback to web search when deepwiki lacks coverage

Other skills reviewed:
- dig: doesn't research external repos, no deepwiki needed
- pi-extension-security-review: clones repos to /tmp, could use deepwiki for pre-cloning structure review (minor use case)
- snapshot: no external repo research

Remaining:
- Verify tools load on pi session restart (user needs to restart pi)

### Extension Built - 2026-09-17

Created deepwiki-guard.ts extension:
- Location: ~/.pi/agent/extensions/deepwiki-guard.ts
- Auto-discovered from extensions directory
- On session_start: checks if mcp_deepwiki_* tools are registered via getActiveTools()
- If available: injects research source order with DeepWiki tools into system prompt
- If unavailable: injects fallback instructions (use web search)
- Re-checks on agent_start (MCP servers connect async)
- Shows notification when deepwiki is available

Pattern matches backlog-guard.ts:
- Runtime detection (not static config)
- Dynamic system prompt injection
- Graceful fallback when unavailable

Coding skill also updated with deepwiki in verification section (kept — doesn't conflict with extension).

Remaining:
- Verify tools load on pi session restart
- Test mcp_deepwiki_ask_question against a public repo
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
DeepWiki MCP fully integrated. pi-mcp-extension installed, mcp.json configured, deepwiki-guard.ts extension detects availability and injects research source order into system prompt. Coding skill updated. Fallback to web search when unavailable. Verified: queried microsoft/typescript successfully.
<!-- SECTION:FINAL_SUMMARY:END -->
