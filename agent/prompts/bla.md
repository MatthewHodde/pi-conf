---
description: Full ready-set review, nothing hidden
argument-hint: "[filter]"
---

Show the complete backlog picture, every ready task, no cap. Same review standard as
`/bl` without the top-5 truncation. The `backlog` skill governs the CLI calls and
carries the ready-set review standard this report judges against.

**1. Gather**
- `backlog task list --ready --status "To Do" --status "In Progress" --plain`
- `backlog task list --ready --status Draft --plain` for the draft pool.
- `backlog overview` for the counts.
- An argument was typed (`$1`): it is a filter. Add `--search "$1"` to each
  `backlog task list` call and keep only matching tasks. The filter narrows what
  gets reported; it never edits anything.

**2. Shortlist**
Judge every task in the ready set against the `backlog` skill's ready-set review
standard. List every ready task in READY NOW, however many there are. Nothing hidden,
nothing cut. Length is not a reason to omit a task; if the output is long it is long.

**3. Report**

Markdown tables, one per section. Escape any `|` in a cell. Keep the fixed column order so
rows line up across every table.

    ## Ready now

    | ID | Pri | Type | Title | Why ready | Size |
    |---|---|---|---|---|---|
    | PI-026 | High | feat | Define and enforce worktree branch naming | criteria specific, no open deps | 1 branch, git-wt scripts |
    | PI-023 | Med | enh | Convert setStatus to widgets | ac 5/5, mechanical | 1 branch, all extensions |

    ## Drafts worth promoting

    | ID | Pri | Type | Title | Note |
    |---|---|---|---|---|
    | PI-041 | Low | chore | ... | blocked on PI-026 |

    ## Blocked

    | ID | Pri | Title | Waiting on |
    |---|---|---|---|
    | PI-038 | Med | ... | PI-030 (To Do) |

    ## Not ready

    | ID | Pri | Title | Why not |
    |---|---|---|---|
    | PI-033 | High | ... | spans 3 subsystems, split first |

Empty sections get one line of prose saying there are none, not an empty table.
Use `—` for a field you do not know rather than guessing.

Do not modify any task, change any status, or create anything. This is a read-only report
and it ends with the report.

Finish with a single recommendation, written as bullets, not prose and not a table:

    **Start here**

    - **PI-012** — fix inline ask_user multiline text pasting
    - Why: concrete breakage, reproducible before and after, no open dependencies
    - Start with: reproducing the failure, then red-green per the coding skill
    - Run `/st PI-012` when you agree

    Prefer the highest priority ready task with the clearest acceptance criteria over
    anything merely urgent. Breaks you can reproduce beat investigations you have to scope.

One task only. Do not offer a runner-up.

If the user wants to start one, they run `/st <id>`. Do not start work here.
