---
name: ask-user
description: "You MUST use this before high-stakes architectural decisions, irreversible changes, or when requirements are ambiguous. Runs a decision handshake with the ask_user_question tool: summarize evidence in your reply, present structured options, collect explicit user choice, then proceed."
---

# Ask user decision gate

Force an explicit user decision before consequential steps. This skill is
about decision control, not chit-chat.

## Non-negotiable rule

Invoke `ask_user_question` before proceeding when any of these is true.

1. The next step changes architecture, schema, API contracts, deployment
   strategy, or security posture.
2. The step is costly to undo (large refactor, migration, destructive edit,
   production-facing behavior change).
3. Requirements, constraints, or success criteria are unclear, conflicting,
   or missing.
4. Multiple valid options exist and the trade-off is preference-dependent.
5. You are about to assume something that can materially change the
   implementation.

Do not skip this gate unless the user already gave a clear, explicit decision
for the exact trade-off.

## Handshake

Follow the steps in order.

### 1) Classify the boundary

- `high_stakes`, `ambiguous`, or `both` needs the gate.
- `clear` needs nothing.

### 2) Gather evidence first

Read the code, run the commands, check the timing. Never ask the user to
decide blind. The tool has no field for evidence, so the evidence goes in
your reply.

### 3) Write the summary in your reply

Before the tool call, state in plain text. Three to seven short bullets.

- current state
- key constraints
- trade-offs
- your recommendation, if any

### 4) Ask one question per call

Call `ask_user_question` once per question. Each call carries exactly one
question. Independent questions become separate calls inside the same
question budget. Ask a dependent question in a later call, once the first
answer is known.

Payload rules.

- One question per call. The `question` string should end with a question
  mark.
- `options` holds 2 to 6 unique strings. Keep each option short and
  outcome-oriented. When you recommend an option, make it first and put
  "(Recommended)" at the end.
- Set `allow_multiple: true` when several answers are valid. Leave it off
  when options are mutually exclusive.

The tool appends its own "Type a different answer" row to every question.
Never author that row yourself.

### 5) Commit the decision

After the answer arrives.

- Restate the decision in plain language.
- State what you will do next.
- Proceed with implementation.

### 6) Re-open only on new ambiguity

Do not run repeat confirmation loops.

## Question budget

- Max one question per decision boundary in normal cases. Independent
  questions become separate calls and share that budget.
- Max two calls for the same boundary when the first answer was unclear or
  cancelled.
- Never ask the same trade-off again without new evidence.

Escalation ladder.

1. Attempt 1, structured options plus the concise summary from step 3.
2. Attempt 2, only if needed, a narrower question with your recommendation
   as the first option and "Stop for now" as the other. The user can type a
   different answer.

After attempt 2. For a `high_stakes` boundary, stop and mark the work
blocked. Do not keep asking. For an `ambiguous` boundary where the user says
"your call", proceed with the most reversible default and state the
assumptions.

## UI requirement

The tool needs an interactive TUI session. With no UI the call throws
"Pstack question UI unavailable in this Pi mode". Do not call it in
headless runs. State the blocked decision in your reply instead.

## Payload example

```json
{
  "question": "Which caching strategy should the first release use?",
  "options": ["Redis (Recommended)", "In-memory"]
}
```

With multiple selections allowed.

```json
{
  "question": "Which hardening items go into the first wave?",
  "options": ["Rate limiting", "Audit logging", "Request tracing"],
  "allow_multiple": true
}
```

## If the user cancels or the answer is unclear

Pause and explain what is blocked. Use at most one narrower follow-up call.
After that, do not loop. High-stakes work stays blocked until an explicit
decision. Ambiguity-only work proceeds only on a delegated choice.

## Anti-patterns

- Asking before gathering evidence
- Asking about trivial formatting choices
- Forcing options when a typed answer is clearly better
- Repeating a question without new information
- Asking a dependent question before its prerequisite answer
- Proceeding with high-stakes work after a cancelled or unclear answer
