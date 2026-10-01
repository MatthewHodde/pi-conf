---
description: Turn an error or symptom into a bug task
argument-hint: "<error text or symptom>"
---

Add a bug task to the backlog from what you pasted. Capture, don't investigate — no
diagnosis in this prompt, the fix happens later under `/st`. The `backlog` skill owns
search, creation rules, the repro question, and the confirm-before-create question;
the `workflow` skill's interaction policy applies as written. Entry point and
sequence only.

**1. Load context**
- Read the `backlog` skill.

**2. Search first**
- One chained call, before any creating:
  `backlog instructions task-creation && backlog search "$1" --plain && backlog task list --type bug --plain`.
- Same error already tracked: stop, report the ID, offer to append the new occurrence
  (`backlog task edit <ID> --append-notes "<new context>"`). Do not create a second one.

**3. Extract what the error gives you**
From the pasted text, pull out what is present — never invent what isn't:

- **Error message** — verbatim, exact. Keep stack trace lines, exit codes, HTTP status.
- **Where** — file:line, command, endpoint: only if the paste shows it. `—` otherwise.
- **When** — first seen, frequency, regression or always-broken: only if stated.
- **Expected vs actual** — if the user said it; otherwise leave for the AC.
- **Cause** — only if the error message itself states it (e.g. `ENOENT: no such file`).
  Otherwise `cause: unknown`. No guessing, no hypotheses.

Scrub before anything goes further: no secrets, tokens, passwords, or personal data in
the message or description. Replace with `***` and say you redacted.

**4. Repro** — the `backlog` skill's bug-intake question.
Then proceed on whatever comes back; `repro: not confirmed` is an acceptable answer.

**5. Draft the task**
- **Title** — the error or symptom, one line. Not the fix.
- **Description** — verbatim error, where, when, repro steps, expected vs actual,
  `cause: <stated | unknown>`.
- **Acceptance criteria** — two axes:
  - the failing case now succeeds under the recorded repro (or `repro not yet
    confirmed — must be established before fix` when the repro question came back empty),
  - a regression test covering it, and no existing behavior regressed.
  Behavior, testable, no implementation steps.
- **Type** `bug`, **priority** from stated impact only, **deps** only on real IDs.

**6. Confirm** — the `backlog` skill owns the create-or-revise question.

**7. Create**
- One chained call — create, parse the new ID from its output, re-read:
  `backlog task create "<title>" -d "<description>" --ac "<criterion>" ... --type bug --priority <pri> && backlog task view <ID> --plain`
  Add `--dep`, `-m`, `-l` only if justified.
- Confirm the error text and every acceptance criterion survived the CLI round-trip
  (quoting eats backticks and newlines — for a multi-line paste, escape newlines as `\n`
  inside the quoted string).

**8. Report**
Markdown, tight:

    **Created**

    - **PI-0xx** — <error/symptom>
    - Cause: <stated in error | unknown>, repro: <confirmed / not confirmed>
    - AC: <n> criteria, pri <x>
    - Next: run `/st PI-0xx` to diagnose and fix
      in one pass, `/bl` to see the ready set

Create ends here. Do not diagnose, do not fix, do not set In Progress.
