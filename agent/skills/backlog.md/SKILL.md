---
name: backlog
description: Backlog.md task management workflow. Use when creating, planning, executing, or finalizing tracked work in projects that use Backlog.md. Covers task lifecycle, CLI reference, and the spec-driven development loop. Do not trigger for untracked quick fixes, questions, or explanations.
---

# Backlog.md Skill

Backlog.md tracks committed work as markdown tasks in `backlog/tasks/`. The CLI is `backlog`. Always use the CLI — never edit task markdown files directly.

## Quick Reference

| Action | Command |
|--------|---------|
| Search tasks | `backlog search "query" --plain` |
| List tasks | `backlog task list --status "To Do" --plain` |
| View task | `backlog task view PI-123 --plain` |
| Create task | `backlog task create "Title" -d "Description" --ac "Criteria"` |
| Edit task | `backlog task edit PI-123 -s "In Progress" -a @name` |
| Add plan | `backlog task edit PI-123 --plan "1. Step one"` |
| Add notes | `backlog task edit PI-123 --append-notes "Progress update"` |
| Add comment | `backlog task edit PI-123 --comment "Question" --comment-author @name` |
| Check AC | `backlog task edit PI-123 --check-ac 1` |
| Final summary | `backlog task edit PI-123 --final-summary "Done. Verified with tests."` |
| Set status | `backlog task edit PI-123 -s "Done"` |
| JSON output | Add `--json` instead of `--plain` for scripted reads |

## Workflow: When to Create a Task

Create a task when work requires planning, decisions, or handoff. Ask: "Do I need to think about HOW to do this?"

- **Yes**: search first, create if needed.
- **No**: do the change directly, no task.

Good candidates: bug fixes needing investigation, feature work, API changes, refactors, anything reviewable as a commitment.

Skip for: questions, explanations, quick lookups, obvious mechanical edits.

## Task Lifecycle

### 1. Creation

```bash
# Search first
backlog search "feature name" --plain

# Create with description and acceptance criteria
backlog task create "Add project search" \
  -d "Finding anything means running three separate commands. One search covers tasks, docs, and decisions." \
  --ac "Search returns matching tasks by title and description" \
  --ac "Search supports --plain output" \
  --ac "Tests cover task, document, and decision results"
```

Use subtasks for work in one subsystem:
```bash
backlog task create "Desktop application"
backlog task create -p PI-10 "Set up shell"
backlog task create -p PI-10 "Wire IPC"
```

Use dependencies for independent components:
```bash
backlog task create "Add bulk update API"
backlog task create "Add bulk update UI" --dep PI-21
```

### 2. Execution (Planning)

```bash
# Read the task first
backlog task view PI-123 --plain

# Assign and mark in progress
backlog task edit PI-123 -s "In Progress" -a @your-name

# Research, then record plan
backlog task edit PI-123 --plan "1. Research current parser\n2. Add new field\n3. Tests"
```

Work in short loops: implement, test, record progress with `--append-notes`.

### 3. Finalization

```bash
# Verify each AC with evidence, then check
backlog task edit PI-123 --check-ac 1
backlog task edit PI-123 --check-ac 2

# Check DoD items
backlog task edit PI-123 --check-dod 1

# Write final summary
backlog task edit PI-123 --final-summary "Implemented search, verified with test suite."

# Set terminal status
backlog task edit PI-123 -s "Done"
```

## Key Rules

The following rules are **enforced by extension** (hard blocks, not optional):

- **Set task to In Progress before doing any work.** Before reading code, writing plans, or making changes: `backlog task edit PI-123 -s "In Progress" -a @agent`. No exceptions.
- **Finalization requires human execution.** `--check-ac`, `--final-summary`, and `-s "Done"` are blocked for agents. Ask the user to run these commands in their terminal.
- **Work must be committed before Done.** `-s "Done"` is blocked if uncommitted changes exist. Commit first.

Additional rules:

- Use `--plain` for human-readable output, `--json` for scripts
- Never edit task markdown files directly — always use the CLI
- Search before creating to avoid duplicates
- Acceptance criteria define behavior, not implementation steps
- Record the plan before coding, update if approach changes
- Check ACs only after objective verification (tests, not grep)
- Do not create follow-up tasks without user approval

## Shell Quoting

When task text includes backticks, use single quotes:
```bash
backlog task create 'Document `backlog init` setup' \
  --ac 'Instructions mention `backlog init --defaults` literally'
```

## Help

Run `backlog <command> --help` before unfamiliar operations. Help includes input fields, output shape, and examples.
