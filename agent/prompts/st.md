---
description: Start a backlog task on a fresh worktree, coding skill
argument-hint: "<backlog-id>"
---

Two hard approval gates. Stop and wait at each. Never self-approve either one.

Start backlog task `$1` end to end.

**1. Load context**
- `backlog task view $1 --plain` — always `--plain`; the default is an interactive UI and
  will not render in a non-TTY session. If the task does not exist, stop and say so.
- `backlog instructions task-execution` before changing status, plan, or notes.
- Set status to In Progress and record the design-level plan with `--plan` now, before any
  worktree or code exists: `backlog task edit $1 --plan "<steps>"`. A one-line plan is
  not a plan; size it to the stakes. If the work later fails, a task already marked In
  Progress with a plan is recoverable — a task silently untouched is not.

**2. Plan review — ask first, do not assume**
- Ask the user whether they want a review of the task before any work starts: gaps in the
  plan, stale assumptions, contradictions with this repo's conventions, and anything that
  looks wrong or underspecified. One question via `ask_user`, and wait for the answer.
- If yes: run the `plan-review` skill inline — severity-ordered findings
  with a concrete proposed fix for each, then work with the user to resolve them. Apply
  accepted fixes to the task itself (description, plan, acceptance criteria via
  `backlog task edit $1`), and re-check that the plan is coherent before moving on.
- If no, or the user declines to dig further: say so plainly and continue. Do not review
  uninvited, and do not re-ask.
- Keep it brief. This is a sanity pass on the plan, not a redesign of it — the skill's
  verdict is input to step 2's discussion, not a gate of its own.

**3. Worktree**
- Derive the branch name, never type it by hand:
  `BRANCH="$(node ~/.pi/agent/skills/git-wt/scripts/branch-name.mjs --task $1)"`
  State the name before creating anything.
- Work from the repo root — relative paths below resolve against cwd:
  `ROOT="$(git rev-parse --show-toplevel)"`
- Resolve the base branch and check it is current. Do not fetch; this repo is local
  first. If `refs/remotes/origin/<base>` exists and differs from local `<base>`, stop and
  report that the base is behind and let the user decide.
- Detect layout with `git rev-parse --git-common-dir`. Output ending in `.bare` means the
  bare git-wt layout; anything else (including `.git`) means plain.
- Bare layout:
  `git --git-dir="$ROOT/.bare" worktree add -b "$BRANCH" "$ROOT/$BRANCH" "$BASE"`
  (do not use `git wt add`; it fetches unconditionally).
- Plain layout:
  `git worktree add -b "$BRANCH" "$ROOT/../$BRANCH" "$BASE"`
  The path is a sibling of the repo root, never inside it. In the bare layout the
  directory name equals the branch name; that is what keeps the layout intact.
- If `$BRANCH` already exists as a branch but has no worktree, stop and report. The reuse
  rule below covers a branch that already has a tree, and nothing else.
- If a worktree already exists for this branch, reuse it only after verifying it is the
  right tree: `git worktree list --porcelain` must show that exact branch path, its
  `HEAD` must be on the branch, and it must be on the correct base. Any mismatch means
  stop and report it. Never guess, never write into a worktree you have not confirmed.
- Record the branch and worktree path on the task with `--notes` so a later session can
  find the tree: `backlog task edit $1 --notes "branch=<...> worktree=<...>"`.
- Do all coding work inside the worktree.

**4. Execute**
- Load the `coding` skill and follow it: new behavior and known-cause fixes go
  red-green-refactor, and watch the failing test fail before implementing.
- After refactor and before Gate 1, run the `adversarial-review` skill over the
  whole branch diff: severity-ranked findings from its four lenses (every deletion
  justified via history and callers, every new abstraction born of the problem not the
  implementation, every change's callers beyond the diff, plus one currency check for
  deprecated or superseded idioms). The skill runs inline in this session: it declares
  the stance switch and re-reads at tool level, so the review
  never runs on the memory of writing the code.
  Report acceptance-criteria findings separately from lens findings so one axis does not
  mask the other. This is the review of the code, not the plan review from step 2.
- Commit as you go using the `conventional-commits` format. No `--no-verify`.

**5. Gate 1 — evidence before merge**
- Determine the full test command once and reuse the exact same command in step 7: read
  the project manifest and AGENTS.md, and state the command you are running.
- Run it. If anything fails, fix it. Do not ask for merge approval with a red suite.
  Then present the evidence and stop:

- Branch and worktree path.
- Every commit on the branch, with subject line.
- The test command and its actual output tail — the real result, not a summary.
- The `adversarial-review` findings from step 4, and their resolution.
- Each acceptance criterion from the task, with the file:line or commit that satisfies it.
- Each Definition of Done item with its checked state; `backlog task view $1 --plain`
  renders the checklist, and task-level items override project defaults.
- Anything you know is incomplete, skipped, or unverified. Strict on "satisfied", honest
  on "unverifiable".

Ask for approval to merge via `ask_user`. Wait. Do not merge, push, or mark the task Done until the user
says yes in this session.

**6. Merge**
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
- Run the remaining steps from the base worktree path, not from inside the task worktree.
- Push is still the host's job unless the user explicitly says otherwise in this session.

**7. Verify in the base worktree**
- Do not switch branches inside the task worktree. In a git-wt layout the base branch is
  already checked out in the main worktree, so `git checkout main` there fails with
  "already checked out at ...". Work around it, do not improvise.
- Find the base worktree path: `git worktree list --porcelain`. The entry on the base
  branch is the one to use.
- Confirm that worktree is on the base branch and is clean. If it has uncommitted
  changes, stop and report — someone else is working there.
- This repo is local first. Do not pull, fetch, or push. Work only with what is on
  disk. If the base worktree is behind, say so and let the user decide.
- Run the same test command from step 5, from that path.
- Report the actual output. A green suite in the task worktree does not count as
  post-merge verification.

**8. Gate 2 — approval before close**
Present: merge commit sha, post-merge test output, and a final pass over the acceptance
criteria. Then ask for approval to close via `ask_user`.

- Only after explicit approval: `backlog instructions task-finalization`, check the
  acceptance criteria and the Definition of Done, write the final summary with
  `--final-summary`, and move the task to Done.
- If post-merge tests fail, do not ask. Report the failure, fix it on the branch, and
  return to Gate 1 with fresh evidence.

**9. Clean up, only after the task is Done**
- Remove the worktree and the local branch, in that order. Preview first
  (`git worktree remove --dry-run` where supported, or `git wt remove <branch> --dry-run`
  in a bare layout — `git wt remove` is the right tool here, it does not fetch), show the
  user what would be deleted, and act only after they confirm via `ask_user`.
- Never delete the remote branch. This repo is local first and push is the host's job.
- If the worktree has uncommitted changes, stop and report instead of forcing removal.
- Report what was removed, and note on the task that the branch is gone.
