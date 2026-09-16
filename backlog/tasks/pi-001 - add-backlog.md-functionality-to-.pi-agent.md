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
- [ ] #1 Extension blocks agent-initiated project setup commands
- [ ] #2 Extension detects backlog projects via config/task directory
- [ ] #3 Extension injects backlog context into system prompt for detected projects
- [ ] #4 Skill does not include project setup instructions
- [ ] #5 backlog CLI available globally via npm
<!-- AC:END -->
