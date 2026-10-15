<!-- BACKLOG.MD GUIDELINES START -->
<!-- backlog.md-instructions-version: 1.51.0 -->
<CRITICAL_INSTRUCTION>

## Backlog.md Workflow

Projects that manage work with Backlog.md (a `backlog/` directory containing `tasks/`)
use Backlog.md for task and project management. The following rules apply in those
projects; in any other project, ignore this section.

**At the beginning of each conversation in a Backlog.md project, run `backlog instructions overview` before answering or taking action. Re-read it only if you have not read it yet in the current conversation.**

Use the overview to decide whether to search, read, create, or update Backlog tasks.

Before task lifecycle actions, read the matching detailed guide:
- `backlog instructions task-creation` before creating or splitting tasks
- `backlog instructions task-execution` before planning, changing status or assignee, adding a plan or implementation notes, or implementing task work
- `backlog instructions task-finalization` before checking acceptance criteria, writing final summaries, or moving tasks to terminal statuses

Use `backlog <command> --help` before running unfamiliar commands.

Do not edit Backlog task, draft, document, decision, or milestone markdown files directly. Use the `backlog` CLI so metadata, relationships, and history stay consistent.

</CRITICAL_INSTRUCTION>
<!-- BACKLOG.MD GUIDELINES END -->

## Workflow conventions

Prompt templates (`agent/prompts/`) are thin entry-point wrappers — entry, sequence,
and delegation only. They never carry interaction rules: no asks, no approvals, no
wait-for-reply text. The `workflow` skill is the single home of interaction policy:
approval gates exist only for merge and close, everything else is a plain-discussion
question owned by its domain skill, never the `ask_user` tool, and results go forward
to the user in-conversation (task docs persist, never replace). Specs and designs
belong in the backlog issue itself.

Host tests belong to the operator. Never move a backlog task to a terminal status
while any acceptance criterion or Definition of Done item still waits on a
host-side test, meaning a real build, a real sandbox run, or KVM. Check only what
the current session can actually observe, leave the rest open, and hand the
operator a copy-paste command block for the host run. Recorded as decision-003.

