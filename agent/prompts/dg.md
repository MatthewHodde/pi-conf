---
description: Find the root cause of a backlog task, no fix
argument-hint: "<backlog-id>"
---

Diagnose backlog task `$1` and stop at root cause. No fix, no worktree, no branch.
One approval gate. Never self-approve.

**1. Load context**
- `backlog task view $1 --plain` — always `--plain`; default is an interactive UI and
  will not render in a non-TTY session. If the task does not exist, stop and say so.
- Read the `dig` skill. It governs this prompt: its repro, hypothesis, falsification
  and reconciliation method is the method here, followed as written.
- `backlog instructions task-execution` before changing status or notes.
- Status to In Progress now, before any probing:
  `backlog task edit $1 -s "In Progress"`. This is what makes an interrupted dig
  recoverable — the notes only help if the status says someone has it.

**2. Work the dig method against this task**
- Start from what the task already carries: verbatim error, repro steps, `cause:` field.
- Then the skill's loop, in order: reproduce and pin down the symptom, hypothesize in
  visible output (falsifiable form, item by item), falsify fastest-first one variable
  at a time, reconcile against the symptom's magnitude and shape before claiming
  anything.
- Cannot reproduce after honest effort: stop, report what was observed, return the task
  to To Do with `blocked: <what's missing>` in the notes. Do not hypothesize against a
  moving symptom.
- No behavior-changing edit at any point — read-only probes only. That boundary is what
  keeps this prompt's no-fix promise; the fix is `/st`'s job.

**3. Stream verdicts**
As each hypothesis settles:
`backlog task edit $1 --append-notes "- [hypothesis] verdict: <evidence>"`.
The notes carry the hypothesis list and the three-strikes counter per the dig skill.

**4. The gate before you claim it**
When the dig skill's reconciliation bar is met (evidence explains the symptom's
magnitude and shape), one question via `ask_user`: root cause accepted, or dig further?
Wait for the answer. A rejected claim returns to the skill's hypothesis step with the
objection as a new suspect.

**5. Record — only after approval**
- `backlog task edit $1 --notes "root cause: <one line — the mechanism, not the symptom>"`.
- Scrub before writing: no tokens, passwords, or personal data in notes.
- Meta root cause, if seen: which missing defense let it through — one line in the
  notes, named as separate work. Do not create that task here.
- If the fix turns out trivial and the cause was already obvious, say so — but still do
  not apply it. `/st` takes it from here.

**6. Report**
Markdown, tight:

    **PI-0xx — <title>**

    - Root cause: <one line mechanism>
    - Evidence: <the observation that settled it, file:line or output>
    - Confidence: <confirmed / strong / best available — what would overturn it>
    - Defense gap: <one line | none seen>

    - [hypothesis] verdict lines from the notes

    **Next**: run `/st PI-0xx` to fix it.

Return the task to To Do with the root cause in its notes — diagnosis done, nobody
working it now. In Progress is for active sessions; a finished dig is not one.

Ends with the report. No fix, no worktree, no branch, no status beyond the flip back.
