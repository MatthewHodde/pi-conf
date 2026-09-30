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

- Gauge the gap from what the user said. Enter at the level that is actually missing —
  no blank-slate questions, no fact the environment can answer.
- At most one real decision per round, carrying a recommendation, its grounds, and what
  would overturn it. Always keep a "none of these, reopen" exit.
- Candidate the user brings is a candidate, not a decision. Judge it alongside the rest.
- Inversion lens is never skipped: "what would count as failure?" Those answers become
  the acceptance criteria.
- Confirmed decisions land in the working notes as they are made, not reconstructed later.
- An absent user waives the pause, not the shaping: proceed on the recommendation and
  write the grounds where the user can reopen them.
- Stop the moment no affordable action would change the deliverable.

**4. Draft the task**
Assemble, from the converged shape only:

- **Title** — one line, the change not the goal.
- **Description** — the problem and the grounds. No reasoning process, no rejected
  candidates, no placeholders.
- **Acceptance criteria** — behavior, not implementation steps. Testable. At least two
  axes: the new behavior holds, and old behavior does not regress.
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
