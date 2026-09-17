---
id: PI-003
title: add deepwiki mcp functionality to pi
status: To Do
assignee: []
created_date: '2026-09-09 14:58'
updated_date: '2026-09-17 02:05'
labels: []
dependencies: []
type: feature
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
DeepWiki MCP is a remote MCP server hosted at https://mcp.deepwiki.com/mcp that provides tools for querying public GitHub repository wikis and documentation.

Tools provided:
- ask_question: Query a repo's wiki with natural language
- read_wiki_structure: Get the table of contents / structure of a repo's wiki
- read_wiki_contents: Read specific wiki pages

This enables pi to answer questions about public repos without cloning them or using web search.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 MCP server https://mcp.deepwiki.com/mcp configured in pi
- [ ] #2 deepwiki tools (ask_question, read_wiki_structure, read_wiki_contents) available in session
- [ ] #3 Can query public repo wikis without cloning
<!-- AC:END -->
