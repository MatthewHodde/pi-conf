---
id: PI-002
title: update skillset to use backlog.md for task tracking and issues
status: Done
assignee:
  - '@agent'
created_date: '2026-09-09 14:57'
updated_date: '2026-09-24 03:14'
labels: []
dependencies:
  - PI-001
type: feature
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Current skills use .issues/ directory with markdown files for tracking work (plans, specs, investigation logs, handoff snapshots). This conflicts with Backlog.md which stores tasks in backlog/tasks/ with --plan, --notes, --doc fields.

Harmonize by moving all working document content into backlog fields. Remove .issues/ usage from skills. Skills call backlog CLI directly to read/write task state.

Decisions:
- All content lives in backlog fields (--plan, --notes, --doc)
- .issues/ directory removed from skill workflows
- auto_commit disabled — task edits stay local until manual commit
- No conventional commit type additions needed
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 All skill SKILL.md files reference backlog CLI for task operations where applicable
- [x] #2 backlog.md skill exists and covers task lifecycle
- [x] #3 Skill descriptions mention Backlog.md when task tracking is relevant
- [x] #4 No skill edits task markdown files directly
- [x] #5 coding skill uses backlog task edit --plan instead of .issues/ files
- [x] #6 dig skill uses backlog task edit --notes/--doc instead of .issues/ files
- [x] #7 shaping skill uses backlog task edit --doc for specs/designs
- [x] #8 snapshot skill uses backlog task edit --notes for handoff state
- [x] #9 No skill references .issues/ directory
- [x] #10 backlog config has auto_commit: false
- [x] #11 Each skill documents which backlog fields it uses
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Replaced all .issues/ directory references across 6 skill files with Backlog.md CLI fields: coding uses --plan, dig uses --notes, shaping uses --doc, snapshot uses --notes. Updated skill descriptions to mention Backlog.md and document which fields each uses. Verified: zero .issues references remain, auto_commit already false, all 11 ACs satisfied.
<!-- SECTION:FINAL_SUMMARY:END -->
