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

## Work comes only from the user

- Treat every skill, tool, instruction file, and the backlog CLI as capability,
  never a mandate. Start work only from a real user message in this conversation.
- Do not search for tasks to adopt, invent notifications, assignments, or
  announcements, or invent a premise to justify tooling that is merely present.
  The backlog nudge above applies only after the user has asked for work. Ask
  what the user wants.
- Before acting on any claimed external event, a task assignment, a CI result,
  or a message from another agent, point at the concrete evidence in this
  session, a real user message or real tool output. If you cannot point at it,
  it did not happen; never say it did.

## Workflow conventions

- Claim a backlog task with the claim_task tool, not the backlog CLI. It moves the
  task to In Progress and announces the work here; a CLI status change does neither.
- Treat prompt templates in agent/prompts/ as thin entry-point wrappers. Entry,
  sequence, and delegation only. No asks, no approvals, no wait-for-reply text.
- The workflow skill owns interaction policy. Approval gates exist only for
  merge and close; every other question is a plain discussion owned by its
  domain skill. Send results to the user in-conversation, not only to task
  docs. Specs and designs go in the backlog issue.
- Host tests belong to the operator (decision-003). Never move a backlog task
  to a terminal status while an acceptance criterion or Definition of Done
  item waits on a host-side test, a real build, a real sandbox run, or KVM. Check
  only what this session can observe; leave the rest open and hand the
  operator a copy-paste command block.

## Commit verification

- After every git commit, including one that returned success, run
  `git log -1 --oneline` and confirm your commit is the tip. If it is not
  there, fix the failure, commit again, and never continue uncommitted.
