---
id: PI-006
title: update skills to use graphify
status: Done
assignee: []
created_date: '2026-09-09 15:08'
updated_date: '2026-09-17 07:37'
labels: []
dependencies:
  - PI-004
type: feature
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After Graphify is configured (PI-004), update skills to leverage the codebase knowledge graph for code navigation and understanding.

Graphify provides AST-parsed code graphs with call hierarchies, dependencies, and structure. Skills like coding, dig, and shaping can use this for faster, more accurate codebase analysis without re-walking the filesystem.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Skills use graphify MCP tools for codebase queries when graph is available
- [ ] #2 graphify extract runs on project repos before skill queries
- [ ] #3 Skill documentation mentions graphify for codebase navigation
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Merged into PI-004 — graphify install + skill integration combined into single task.
<!-- SECTION:FINAL_SUMMARY:END -->
