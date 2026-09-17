---
id: PI-004
title: add graphify functionality to pi
status: To Do
assignee: []
created_date: '2026-09-09 14:58'
updated_date: '2026-09-17 02:05'
labels: []
dependencies: []
type: feature
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Graphify indexes codebases into queryable knowledge graphs and exposes them via MCP stdio server. It uses local deterministic AST parsing (no vector store) and supports code, docs, SQL schemas, configs, and PDFs.

Install: uv tool install "graphifyy[mcp]"
Extract: graphify extract .
Start MCP: graphify . --mcp
Platform install: graphify claude install / graphify cursor install

The package name is graphifyy (two y's), command is graphify.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 graphifyy[mcp] installed via uv
- [ ] #2 graphify extract works on current repo
- [ ] #3 MCP server starts with graphify . --mcp
- [ ] #4 Platform integration configured (claude/cursor install)
<!-- AC:END -->
