---
description: Start a backlog task on a fresh worktree, coding skill
argument-hint: "<backlog-id>"
---

Start backlog task `$1` end to end. The `workflow` skill is the runbook — stages,
the two gates, report-forward, failure stops. The `backlog`, `coding`, `git-wt`,
`conventional-commits`, `plan-review` and `adversarial-review` skills own how each
stage is performed, including every question asked along the way. This prompt is an
entry point: sequence and delegation only, no interaction of its own.

**1. Load context**
- One chained call: `backlog task view $1 --plain && backlog instructions task-execution`.
  Always `--plain` — the default is an interactive UI and will not render in a non-TTY
  session. If the task does not exist, stop and say so.
- Per the `backlog` skill: status to In Progress, then record the design-level plan
  with `backlog task edit $1 --plan "<steps>"` — before any worktree or code exists,
  sized to the stakes.

**2. Plan review** — the `plan-review` skill owns this step, including its offer question.

**3. Worktree** — the `git-wt` skill derives the branch name and creates the tree;
  the `workflow` skill's failure stops apply (base current, tree confirmed before
  writing). Record branch and worktree path on the task with `--notes`. All coding
  work happens inside the worktree.

**4. Execute** — the `coding` skill owns the loop; `adversarial-review` runs over the
  whole branch diff before Gate 1, findings reported on separate axes;
  `conventional-commits` for commits, no `--no-verify`.

**5. Gate 1 — evidence before merge** — the `workflow` skill.

**6–7. Merge and post-merge verification** — the `workflow` skill's merge runbook and
  failure stops.

**8. Gate 2 — close** — the `workflow` skill; finalization mechanics are the
  `backlog` skill's.

**9. Cleanup** — the `git-wt` skill owns removal and its preview-and-confirm question;
  only after the task is Done.
