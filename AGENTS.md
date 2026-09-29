
<!-- BACKLOG.MD GUIDELINES START -->
<!-- backlog.md-instructions-version: 1.51.0 -->
<CRITICAL_INSTRUCTION>

## Backlog.md Workflow

This project uses Backlog.md for task and project management.

**At the beginning of each conversation in this project, run `backlog instructions overview` before answering or taking action. Re-read it only if you have not read it yet in the current conversation.**

Use the overview to decide whether to search, read, create, or update Backlog tasks.

Before task lifecycle actions, read the matching detailed guide:
- `backlog instructions task-creation` before creating or splitting tasks
- `backlog instructions task-execution` before planning, changing status or assignee, adding a plan or implementation notes, or implementing task work
- `backlog instructions task-finalization` before checking acceptance criteria, writing final summaries, or moving tasks to terminal statuses

Use `backlog <command> --help` before running unfamiliar commands. Help shows options, fields, and examples.

Do not edit Backlog task, draft, document, decision, or milestone markdown files directly. Use the `backlog` CLI so metadata, relationships, and history stay consistent.

</CRITICAL_INSTRUCTION>
<!-- BACKLOG.MD GUIDELINES END -->

## Branch and Worktree Naming

Agent-created branches follow `<prefix>/<TASK-ID>-<slug>`, default prefix `pi/`:
`pi/PI-026-define-enforce-worktree-branch-naming`. The slug is 2-5 words from the backlog
task title, max 40 bytes. Work with no task uses `pi/wip-<slug>`.

Never type the name by hand. Derive it:

```shell
node ~/.pi/agent/skills/git-wt/scripts/branch-name.mjs --task PI-026
```

The name is fixed at creation and never renamed afterwards. Rules:
`backlog/docs/worktree-branch-naming/`. For pi-subagents runs, pass the id and slug as the
run's `label`.

## git-wt Compatibility

This project uses pi-subagents for mindplace queries. git-wt (.bare style) repos work fine for mindplace.

**Known limitation:** pi-subagents worktree isolation does not follow git-wt path convention when using native provider. Worktrees are created at `{parent}/worktrees/{repo}/pi-worktree-...` instead of git-wt's expected sibling layout `{project}/{branch}`.

**Workaround:** Use `worktreeProvider: "native"` inside git-wt worktrees. mindplace works without worktree isolation.

See PI-013 for full research notes.
