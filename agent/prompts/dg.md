---
description: Find the root cause of a backlog task, no fix
argument-hint: "<backlog-id>"
---

Diagnose backlog task `$1` and stop at root cause. No fix, no worktree, no branch.
One approval gate. Never self-approve.

**1. Load context**
- `backlog task view $1 --plain` — always `--plain`; default is an interactive UI and
  will not render in a non-TTY session. If the task does not exist, stop and say so.
- Read the `dig` skill. It governs this prompt.
- `backlog instructions task-execution` before changing status or notes.
- Status to In Progress now, before any probing:
  `backlog task edit $1 -s "In Progress"`. This is what makes an interrupted dig
  recoverable — the notes only help if the status says someone has it.

**2. Reproduce and pin down the symptom**
- Read what the task already carries: verbatim error, repro steps, `cause:` field.
- Minimal, repeatable reproduction. Raise a flaky rate until it's debuggable — a 1% flake
  is not, loop the trigger until it is.
- Cannot reproduce after honest effort: stop, report what was observed, return the task
  to To Do with `blocked: <what's missing>` in the notes. Do not hypothesize against a
  moving symptom.

**3. Hypotheses — visible output, no exceptions**
- First principles: for this symptom to be true, what facts have to hold? Break it into
  a chain of necessary conditions. Every link is a suspect.
- Falsifiable form only: "if it's this, I see X; if not, Y." A hunch without a
  falsification condition doesn't go on the list.
- List item by item in the visible output before probing. The user must be able to
  challenge the direction.
- Always on the list: stale understanding of a dependency, the bug already being known,
  and — for a recurring bug — how the last fix was applied (the fix may feed the problem).
- Small, near-obvious problems: 2-3 items suffice. Root-cause reconciliation and
  item-by-item verification are never exempted, regardless of scale.
- Show the list, then continue. Do not wait for a reply, but do not compress it into one
  throwaway line either.

**4. Falsify**
- Design the observation that kills each hypothesis fastest, not the one that supports it.
- One probe, one variable. Tag every debug log with a unique prefix — cleanup is one grep.
- External evidence is a probe: search the dependency's portion of the error (strip
  project identifiers first), check its issues and changelog for the installed version,
  read the installed source. Facts, not memory.
- Walk upstream: output ← computation ← input ← source, observation at each boundary,
  until "correct" becomes "wrong."
- Read-only probes, diagnostic scripts, and testability scaffolding don't count as fixes
  and need no gate. Any behavior-changing edit stops this prompt — that's `/st`'s job.
- Stream verdicts as they land:
  `backlog task edit $1 --append-notes "- [hypothesis] verdict: <evidence>"`.
  Keep the three-strikes counter in the notes. Three landed fixes that didn't fix it is
  not this prompt's case (nothing lands here), but three dead-end probe rounds on the
  same symptom means rebuild the understanding from step 2 or stop and ask.

**5. Root-cause reconciliation — the gate before you claim it**
- Bar: evidence explains the symptom's magnitude and shape precisely. If the gap is 75,
  find the 30 and the 45. Half a symptom explained is half a root cause — go back to 3.
- Bias firewall: verifying or defending? Picked for evidence or recency? Looked for a
  counterexample?
- Then one question via `ask_user`: root cause accepted, or dig further? Wait for the
  answer. A rejected claim returns to step 3 with the objection as a new suspect.

**6. Record — only after approval**
- `backlog task edit $1 --notes "root cause: <one line — the mechanism, not the symptom>"`.
- If the paste or notes carried secrets: scrub before writing. No tokens, passwords, or
  personal data in notes.
- Meta root cause, if seen: which missing defense (types, contracts, tests, review) let
  it through. One line in the notes, named as separate work — do not create that task
  here.
- If the fix turns out trivial and cause was already obvious, say so — but still do not
  apply it. `/st` takes it from here.

**7. Report**
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
