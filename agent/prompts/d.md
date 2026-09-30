---
description: Is the current work done?
argument-hint: "[goal]"
---

You done? Answer in three parts, terse. Read-only — no edits, no commits, no status
changes. `$1` is an optional goal; without it, infer from evidence only.

**1. Establish what was being worked on**
Evidence, in order — `$1` overrides only when it's genuinely absent:
- `$1` given: that's the goal. Judge against it, using the checks below as corroboration.
- Session memory: what this conversation actually did — edits made, commands run,
goals stated. Answers *authorship* (did I do this work or am I reading someone
else's?). Memory claims nothing about current state.
- Current Backlog task, if any: `backlog task list --status "In Progress" --plain`,
  then `backlog task view <ID> --plain` for its acceptance criteria.
- Branch name: `git branch --show-current` decodes via
  `node ~/.pi/agent/skills/git-wt/scripts/branch-name.mjs` when it carries a task ID.
- Working tree: `git status --short`, `git diff --stat`, commits ahead of base:
  `git log --oneline <base>..HEAD`.
- Whatever this session's last concrete goal was.

Confidence rule: the goal must come from one identifiable source above. If sources
contradict each other, or the only evidence is a vague diff with no stated goal, you do
not know — say so and stop. Do not guess a goal into existence to have something to
answer about.

Attribution rule: session memory decides *who did the work*, records decide *where it
stands*. Memory is decisive for attribution — a memory claim of completed work counts
only when corroborated by one read-only check (file contents, task output,
`git log`/`status`). If memory and records disagree, report which one says what and mark
the criterion unverified. Corroboration of memory can't be pulled from the task's own
plan/notes: reading them is not having written them.

No-work rule: if memory shows no work this session on the identified task, that is the
answer — the report says "task exists, no work this session" and stops there. Do not
fill Done/Left with state produced by other agents or earlier sessions: untracked files,
branch diffs, backlog checkbox counts, and DoD readings are observed state, not own
progress, and stay out of the report. Never present observed state as own progress.

**2. Judge against acceptance criteria**
Done means the stated outcome exists and is verifiable — tests, output, file contents.
Not done means promised work is missing, failing, or uncommitted. When a criterion can't
be verified from here, mark it unverified, never satisfied.

**3. Report**

    **Done?** <yes | no | partially | unknown>

    <One sentence: what was being worked on.>

    - Done: <terse list, or none>
    - Left: <terse list, or none>

With no work this session, both lines read `none` / `n/a — nothing begun here`.

`unknown` replaces everything when the goal couldn't be pinned down: one line saying
what evidence was checked and why it wasn't enough. No half-guess dressed as a verdict.

No tables, no recommendations, no next steps. It ends with the report.
