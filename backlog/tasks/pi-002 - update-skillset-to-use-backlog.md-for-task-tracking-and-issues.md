---
id: PI-002
title: update skillset to use backlog.md for task tracking and issues
status: To Do
assignee: []
created_date: '2026-09-09 14:57'
updated_date: '2026-09-17 02:05'
labels: []
dependencies:
  - PI-001
type: feature
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Current skills don't reference Backlog.md for task management. Need to update skill definitions to use backlog CLI for tracking work, and create any missing skill files.

Backlog.md tracks committed work as markdown tasks in backlog/tasks/. The CLI is backlog. Skills should reference this for task creation, execution, and finalization workflows.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 All skill SKILL.md files reference backlog CLI for task operations where applicable
- [ ] #2 backlog.md skill exists and covers task lifecycle
- [ ] #3 Skill descriptions mention Backlog.md when task tracking is relevant
- [ ] #4 No skill edits task markdown files directly
<!-- AC:END -->
