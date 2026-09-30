---
description: Start a backlog task on a fresh worktree, coding skill
argument-hint: "<backlog-id>"
---

Two hard approval gates. Stop and wait at each. Never self-approve either one.

Start backlog task `$1` end to end.

**1. Load context**
- `backlog task view $1` — if it does not exist, stop and say so.
- `backlog instructions task-execution` before changing status, plan, or notes.

**2. Worktree**
- Derive the branch name, never type it by hand:
  `node ~/.pi/agent/skills/git-wt/scripts/branch-name.mjs --task $1`
- Detect layout with `git rev-parse --git-common-dir`. In a `.bare` repo create it with:
  `git --git-dir=.bare worktree add -b "$BRANCH" "$BRANCH" main`
  (do not use `git wt add`; it fetches unconditionally). Otherwise plain
  `git worktree add -b "$BRANCH" "$(git rev-parse --show-toplevel)/../$BRANCH" main`.
  The path is a sibling of the repo root, never inside it.
- If a worktree already exists for this branch, reuse it only after verifying it is the
  right tree: `git worktree list --porcelain` must show that exact branch path, its
  `HEAD` must be on the branch, and it must be on the correct base. Any mismatch means
  stop and report it. Never guess, never write into a worktree you have not confirmed.
- Do all further work inside the worktree. In this repo use
  `worktreeProvider: "native"` for pi-subagents runs; native isolation breaks the
  git-wt sibling layout.

**3. Execute**
- Load the `coding` skill and follow it: new behavior and known-cause fixes go
  red-green-refactor, and watch the failing test fail before implementing.
- Set status to In Progress, record the plan with `--plan`.
- Commit as you go using the `conventional-commits` format. No `--no-verify`.

**4. Gate 1 — evidence before merge**
Run the full test suite. If anything fails, fix it. Do not ask for merge approval with
a red suite. Then present the evidence and stop:

- Branch and worktree path.
- Every commit on the branch, with subject line.
- Full test command and its actual output tail — the real result, not a summary.
- Each acceptance criterion from the task, with the file:line or commit that satisfies it.
- Anything you know is incomplete, skipped, or unverified.

Ask for approval to merge. Wait. Do not merge, push, or mark the task Done until the user
says yes in this session.

**5. Merge**
- The agent merges. Run the merge from the base worktree, not the task worktree: locate it
  with `git worktree list --porcelain` and use `git -C <base-worktree-path> merge
  <branch>`. Commit it there.
- Merge commit only, no squash, no rebase, no force.
- On ANY error — conflict, hook rejection, test failure, or an unexpected state in the
  base worktree: stop immediately. Report the exact command, exit code, and full error
  output. Do not retry, do not abort, do not resolve, do not use `--no-verify`, do not
  clean up. Leave the repository exactly as the failure left it so the failure can be
  debugged together. Debugging is joint work from that point.
- If the merge succeeded, report the merge commit sha and stop there. Gate 2 comes after
  post-merge verification, not now.
- Push is still the host's job unless the user explicitly says otherwise in this session.

**6. Verify in the base worktree**
- Do not switch branches inside the task worktree. In a git-wt layout the base branch is
  already checked out in the main worktree, so `git checkout main` there fails with
  "already checked out at ...". Work around it, do not improvise.
- Find the base worktree path: `git worktree list --porcelain`. The entry on the base
  branch is the one to use.
- Confirm that worktree is on the base branch and is clean. If it has uncommitted
  changes, stop and report — someone else is working there.
- This repo is local first. Do not pull, fetch, or push. Work only with what is on
  disk. If the base worktree is behind, say so and let the user decide.
- Run the full test suite from that path.
- Report the actual output. A green suite in the task worktree does not count as
  post-merge verification.

**7. Gate 2 — approval before close**
Present: merge commit sha, post-merge test output, and a final pass over the acceptance
criteria. Then ask for approval to close.

- Only after explicit approval: `backlog instructions task-finalization`, check the
  acceptance criteria, write the final summary, and move the task to Done.
- If post-merge tests fail, do not ask. Report the failure, fix it on the branch, and
  return to Gate 1 with fresh evidence.
