---
description: Shape a new feature and add it to the backlog
argument-hint: "<feature idea>"
---

Add a new feature task to the backlog. Shape first, create second — no task exists until
the shape converges. Stop and wait at each gate. Never self-approve.

**1. Load context**
- Read the `shaping` skill and the `backlog` skill. Both govern this prompt.
- `backlog instructions task-creation` before creating anything.
- `backlog overview` for the current counts.

**2. Search before shaping**
- `backlog search "$1" --plain` and `backlog task list --plain` for near neighbours.
- Duplicate or strict subset of an existing task: stop, report the ID, offer to edit that
  task instead. Do not create a second one.

**3. Shape the intent — the `shaping` skill, inline**
Feature idea: `$1`

Read the skill and work it as written: gauge the gap and enter at the level that is
actually missing; one real decision per round with recommendation, grounds, and
overturning evidence; inversion lens never skipped — failure answers become the
acceptance criteria; confirmed decisions recorded as they land; stop the moment no
affordable action would change the deliverable.

**4. Draft the task**
Assemble from the converged shape only, following the `backlog` skill's creation rules:

- **Title** — one line, the change not the goal.
- **Description** — the problem and the grounds.
- **Acceptance criteria** — behavior, not implementation steps; the shaping skill's
  inversion rule already fixes the two axes.
- **Type** `feature`, **priority**, **dependencies** on real IDs only.
- If the shape produced a requirement spec or solution design, it goes in `--doc` —
  that field is the deliverable, not a dump of the conversation.

**5. Confirm once — ask first, do not assume**
Show the whole draft: title, description, acceptance criteria, priority, deps, doc.
One question via `ask_user`: create it, revise it, or reopen the shape. Wait for the
answer. Do not create on speculation. Reopened shape returns to step 3, not to a rewrite
of the draft.

**6. Create**
- Only after explicit approval:
  `backlog task create "<title>" -d "<description>" --ac "<criterion>" ... --type feature --priority <pri>`
  Add `--dep`, `--milestone`, `-l` only where the shape justified them. There is no
  `--doc` on create; attach the spec right after with
  `backlog task edit <ID> --doc "<content>"`.
- Re-read the created task: `backlog task view <ID> --plain`. Report the ID and confirm
  every acceptance criterion survived the CLI round-trip (quoting eats backticks).

**7. Report**
Markdown, tight:

    **Created**

    - **PI-0xx** — <title>
    - AC: <n> criteria, type feature, pri <x>, deps <ids or none>
    - Shape: <one line — what was excluded and on what grounds>
    - Next: run `/bl` to see it in the ready set, `/st PI-0xx` when you want to start it

Create ends here. Do not start work, do not set In Progress, do not open a worktree.
