---
id: PI-001
title: add backlog.md functionality to .pi agent
status: To Do
assignee: []
created_date: '2026-09-09 14:56'
updated_date: '2026-09-16 23:09'
labels: []
dependencies: []
type: feature
ordinal: 1000
---

Make sure you add a guard for projects that do not use backlog.md and environments that don't have the tool installed

Make sure any skills that come with backlog prohibit the agent from initializing a project level backlog

Discuss wrapping backlog with an extension to programatically block agent backlog initiation

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Extension blocks agent-initiated project setup commands
- [x] #2 Extension detects backlog projects via config/task directory
- [x] #3 Extension injects backlog context into system prompt for detected projects
- [x] #4 Skill does not include project setup instructions
- [x] #5 backlog CLI available globally via npm
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Built three components: (1) global extension backlog-guard.ts that blocks agent-initiated backlog setup, detects backlog projects via config/task directory, and injects context into system prompt; (2) global skill backlog.md with full workflow reference (creation, execution, finalization); (3) npm i -g backlog.md for CLI availability. Verified: backlog task list shows 6 tasks, extension structure valid, skill has correct frontmatter.
<!-- SECTION:FINAL_SUMMARY:END -->
