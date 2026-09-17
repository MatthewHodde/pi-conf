---
id: PI-005
title: update skills to use deepwiki mcp for public repos
status: To Do
assignee: []
created_date: '2026-09-09 15:07'
updated_date: '2026-09-17 02:06'
labels: []
dependencies:
  - PI-003
type: feature
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After DeepWiki MCP is configured (PI-003), update skills that reference public repos to use DeepWiki tools instead of web search or web_fetch.

Skills like coding, dig, and pi-extension-security-review often need info about public repos. DeepWiki provides structured wiki access which is faster and more reliable than scraping.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Skills that query public repos use deepwiki tools when available
- [ ] #2 Fallback to web search when deepwiki doesn't have the repo
- [ ] #3 Skill documentation mentions deepwiki as preferred source for repo docs
<!-- AC:END -->
