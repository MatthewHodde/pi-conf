---
name: plan-review
description: "Single-context review of a plan before any work starts — no subagents. Severity-ranked findings over the plan's steps: gaps, unstated assumptions, contradictions with repo conventions, missing verification, sizing vs. stakes. Use when the user says review the plan, review this plan, critique the plan, plan review, or asks whether a plan is sound before execution starts. Do not trigger for reviewing completed work (adversarial-review's job), concept questions, or when the plan is still being shaped (shaping's job)."
---

# plan-review: catch it before the worktree exists

Review the plan, not the code — nothing is written yet, so every defect found here is
free. Run inline, no subagents: ordinary tools (`read`, `bash`, `backlog`, `ask_user`)
are all fair game. This is the review st.md step 2 points at.

## 1. Establish the artifact

- The plan itself: `backlog task view <ID> --plain` for `--plan`, description, acceptance
  criteria, Definition of Done. Or a spec/design doc the user names — read the actual
  text, never the summary of it.
- The task's stakes: what breaks if this is wrong (data, deploy, public surface). Size
  expectations follow from this — a config edit and a migration are not reviewed alike.
- Repo context: AGENTS.md, manifest, conventions the plan must fit. Read what the plan
  touches; do not audit the whole repo.
- No plan, or a one-liner pretending to be one: say that is the finding. Do not review
  what does not exist, and do not write it yourself — that is shaping's job.

## 2. Stance switch

Declare: "reviewer stance — I did not write this." A plan's author reads its steps as
obvious; review the text as written for a reader with none of that context. Missing
detail is a defect even when the author "obviously meant it."

## 3. Four lenses over the plan

Severity-ranked findings, each with the step it belongs to.

1. **Gaps**: every step — what must happen that no step covers? Interfaces between
   steps especially: who carries output of step N into step N+1, in what state? A plan
   of islands is a plan of surprises.
2. **Hidden assumptions**: every claim the plan relies on but never checks — base branch
   state, tool availability, API behavior, data shape, "the tests already cover X."
   Assumptions cheap to verify before work: name the check. Expensive or load-bearing:
   flag hard.
3. **Convention fit**: each step against the repo's own rules (AGENTS.md, manifest,
   existing patterns). Contradiction with a stated convention = the plan changes, not
   the convention. Also ordering: does the sequence respect the repo's real
   dependencies (install before run, migrate before deploy, test before merge)?
4. **Verification and sizing**: every step that changes something — how do we know it
   worked? A step with no observable outcome is unfalsifiable; demand its check. Then
   overall: plan sized to the stakes? Trivial change with ceremony = drag; high-stakes
   change with three bullets = under-planned. The plan must also name where it stops
   for approval — a plan that never asks permission to merge/delete/publish has lost
   its gates.

## 4. Failure paths

Plans describe the happy road. For each irreversible or high-breach step (delete,
migrate, push, force, overwrite): what happens on failure, and does the plan stop
there or improvise? "Stop and report, leave state debuggable" is the bar this repo
runs on — a plan that says "retry" or "resolve conflicts" without an escalation point
is a finding.

## 5. Feedback points — ask, don't guess

Use `ask_user` (one focused question, options listed) only for these:

- **No plan text found where expected**: ask where the plan lives before concluding
  anything.
- **Ambiguous requirement**: plan step reads two ways with materially different work or
  risk — ask which is intended before scoring the step.
- **Convention conflict with a judgment call**: repo docs silent or self-contradictory
  on the point the plan needs — ask which way to read it.

Never ask: whether findings are correct (prove them from the text), merge/close
approval (st.md owns those gates), or anything the task description already answers —
read it first.

## 6. Findings discipline

- P0 blocks starting work, P1 fix in the plan before starting, P2 note.
  Every finding: step/quote it attacks, why it matters, smallest change to the plan.
- Every finding cites the plan's exact text or the repo file that contradicts it.
  No citation → drop it, or label `HYPOTHESIS` with the check that would confirm it.
- Nothing found under a lens: say so, citing what was read.

## 7. Output

1. Findings, severity-ranked (P0 → P2), lens named, plan step quoted, each with
   `status: open | accepted | rejected (why)`.
2. Verification gaps table: step → observable outcome → missing check, or `none`.
3. Things the plan gets right worth keeping (so a fix-up does not gut it).
4. Verdict line: `Plan verdict: REVISE` | `Plan verdict: GO` | `Plan verdict: GO with notes`.
