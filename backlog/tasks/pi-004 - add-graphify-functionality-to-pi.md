---
id: PI-004
title: add graphify and integrate with skills
status: Done
assignee: []
created_date: '2026-09-09 14:58'
updated_date: '2026-09-24 02:56'
labels: []
dependencies: []
type: feature
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Graphify indexes codebases into queryable knowledge graphs via MCP stdio server. Uses local deterministic AST parsing (no vector store). Supports code, docs, SQL schemas, configs, PDFs.

Do NOT install graphify in ephemeral sandbox. Tool installation is the user's responsibility on their machine.

Instead, add guards to skills/extensions that use graphify:
- Check if graphify CLI is installed before attempting to use it
- Check if repo has been indexed (graphify extract run) before querying
- Graceful fallback when tool is unavailable (skip graphify features, continue without)
- Follow pattern from backlog-guard: extension detects tool availability, blocks or enables features accordingly

Guard pattern: extension detects tool via CLI check (graphify --version or which graphify), detects repo setup via .graphify/ or similar indicator, injects context into skill behavior.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 graphify CLI installed and graphify --version returns
- [x] #2 graphify extract indexes repo successfully
- [x] #3 graphify query returns graph results
- [x] #4 graphify install --platform pi installs skill to ~/.pi/agent/skills/graphify/
- [x] #5 Skill documentation mentions graphify for codebase navigation
- [x] #6 Skills/extensions check if graphify is installed before use
- [x] #7 Skills/extensions check if repo is indexed before querying
- [x] #8 Graceful fallback when graphify unavailable
- [x] #9 No agent-initiated graphify install attempts
- [x] #10 Guard pattern matches backlog-guard approach
- [x] #11 Skill documentation mentions graphify as optional enhancement
- [x] #12 Skills use graphify CLI (query, path, explain) for codebase queries when graph is available
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Skill files (SKILL.md, references, .graphify_version) already present. Guard extension not yet created.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Graphify guard extension created. Detects CLI availability and repo index status. Injects graphify usage context into system prompt. Extract and query verified working on pi config repo (55 nodes, 67 edges). Skill files present.
<!-- SECTION:FINAL_SUMMARY:END -->
