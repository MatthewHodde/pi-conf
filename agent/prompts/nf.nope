---
description: Shape a new feature and add it to the backlog
argument-hint: "<feature idea>"
---

Add a new feature task to the backlog. Shape first, create second — no task exists
until the shape converges. The `shaping` skill owns the shape loop and its decision
rounds; the `backlog` skill owns search, creation rules, and the
confirm-before-create question; the `workflow` skill's interaction policy applies as
written. Entry point and sequence only.

**1. Load context**
- Read the `shaping` skill and the `backlog` skill. Both govern this prompt.

**2. Search before shaping**
- One chained call for the workflow guide and near neighbours:
  `backlog instructions task-creation && backlog search "$1" --plain && backlog task list --plain`.
- Duplicate or strict subset of an existing task: stop, report the ID, offer to edit
  that task instead. Do not create a second one.

**3. Shape the intent — the `shaping` skill, inline**
Feature idea: `$1`

Work the skill as written.

**4. Draft the task**
Assemble from the converged shape only, following the `backlog` skill's creation
rules — title, description, acceptance criteria, type, priority, dependencies, and
where specs and designs belong per that skill.

**5. Confirm** — the `backlog` skill owns the create-or-revise question.

**6. Create**
- One chained call — create, parse the new ID from its output, re-read:
  `backlog task create "<title>" -d "<description>" --ac "<criterion>" ... --type feature --priority <pri> && backlog task view <ID> --plain`
  Add `--dep`, `--milestone`, `-l` only where the shape justified them.
- Report the ID and confirm every acceptance criterion survived the CLI round-trip
  (quoting eats backticks).

**7. Report**
Markdown, tight:

    **Created**

    - **PI-0xx** — <title>
    - AC: <n> criteria, type feature, pri <x>, deps <ids or none>
    - Shape: <one line — what was excluded and on what grounds>
    - Next: run `/bl` to see it in the ready set, `/st PI-0xx` when you want to start it

Create ends here. Do not start work, do not set In Progress, do not open a worktree.
