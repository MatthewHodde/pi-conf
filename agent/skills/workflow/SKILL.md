---
name: workflow
description: The general coding-agent workflow — stages, the two approval gates (merge and close), report-forward, and failure stops. This is what we are doing; domain skills are how. Prompts are entry-point wrappers over this and the domain skills and never restate its interaction rules. Use when running backlog work end to end, or when a prompt or skill needs the workflow's interaction policy.
---

# workflow: what we are doing

This skill is the runbook: stages, the two gates, reporting, failure stops.
Domain skills (`backlog`, `git-wt`, `coding`, `dig`, `plan-review`,
`adversarial-review`, `conventional-commits`) own how their stage is performed,
including their own discussion questions. Nothing here may be overridden by a
prompt.

## Stages

entry → plan → execute → verify → merge → close → cleanup

## Two tiers of interaction

- **Full ceremony — merge and close only.** Present the evidence in the reply, ask for
  approval in plain discussion, wait for the answer. Never self-approve either one.
- **Discussion — everything else.** A plain-text question in the flow, never the
  `ask_user` tool. Ask only for genuine ambiguity or missing facts; never for
  permission to take a reversible step. Otherwise proceed and report.

## Report forward

Results go to the user in-conversation. Task docs (`--notes`, `--final-summary`)
persist them; they never replace showing them. Gate evidence is part of the
discussion, not deferred to task docs. When a domain skill has a question, it is
asked in the reply, not routed through a tool.

## Failure stops — unconditional

Never gated on approval, never a question. Stop and report; no asking, no retrying,
no improvising:

- Red suite: do not ask for merge approval with a red suite. Fix first.
- Merge or hook error — conflict, rejection, hook test failure, unexpected base
  state — the merge command itself failing: stop immediately, report the exact
  command, exit code, and full error output. Do
  not retry, abort, resolve, or use `--no-verify`. Leave the repository exactly as
  the failure left it; debugging is joint work from there.
- Base behind or diverged vs its remote: report, the user decides. This repo is
  local first — do not fetch, pull, or push.
- Uncommitted changes in the base worktree: stop and report — someone else is
  working there.
- Uncommitted changes in a worktree at cleanup: stop and report instead of forcing
  removal.

## Gate 1 — evidence before merge

Determine the full test command once and reuse the exact same command for
post-merge verification: read the project manifest and AGENTS.md, and state the
command you are running. Run it. If anything fails, fix it. Then present the
evidence and stop:

- Branch and worktree path.
- Every commit on the branch, with subject line.
- The test command and its actual output tail — the real result, not a summary.
- The adversarial-review findings and their resolution.
- Each acceptance criterion from the task, with the file:line or commit that satisfies it.
- Each Definition of Done item with its checked state; `backlog task view <ID> --plain`
  renders the checklist, and task-level items override project defaults.
- Anything you know is incomplete, skipped, or unverified. Strict on "satisfied",
  honest on "unverifiable".

Ask for approval to merge — plain discussion, in the reply. Wait. Do not merge,
push, or mark the task Done until the user says yes in this session.

### Merge runbook

- The agent merges. Run the merge from the base worktree, not the task worktree:
  locate it with `git worktree list --porcelain` and use
  `git -C <base-worktree-path> merge <branch>`. Commit it there.
- Merge commit only, no squash, no rebase, no force.
- On ANY error, apply the merge-error failure stop above. Do not retry, abort,
  resolve, or clean up.
- If the merge succeeded, report the merge commit sha and stop there. Gate 2 comes
  after post-merge verification, not now.
- Run the remaining steps from the base worktree path, not from inside the task worktree.
- Push is the host's job unless the user explicitly says otherwise in this session.

### Post-merge verification (base worktree)

- Do not switch branches inside the task worktree. In a git-wt layout the base
  branch is already checked out in the main worktree, so `git checkout main` there
  fails with "already checked out at ...". Work around it, do not improvise.
- Find the base worktree path: `git worktree list --porcelain`. The entry on the
  base branch is the one to use.
- Confirm that worktree is on the base branch and is clean — otherwise apply the
  base-worktree failure stop above.
- Run the same test command from Gate 1, from that path. Report the actual output.
  A green suite in the task worktree does not count as post-merge verification.

## Gate 2 — approval before close

Present: merge commit sha, post-merge test output, and a final pass over the
acceptance criteria. Then ask for approval to close — plain discussion. If
post-merge tests fail, do not ask: report the failure, drop the merge (reset
the base worktree to the pre-merge sha), fix the cause on the branch in the
task worktree, then return to Gate 1 with fresh evidence.

Only after explicit approval: the finalization mechanics in the `backlog` skill —
task-finalization guide, one `backlog task edit <ID>` carrying every `--check-ac`
and `--check-dod` flag, the `--final-summary`, and `-s "Done"`.

## Cleanup — after the task is Done

The `git-wt` skill owns removal mechanics and its preview-and-confirm question.
Never delete the remote branch — this repo is local first, push is the host's job.
Apply the uncommitted-changes failure stop above before removing anything. Report
what was removed and note on the task that the branch is gone.
