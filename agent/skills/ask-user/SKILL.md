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

### 4) Ask every independent question in one call

Call `ask_user_question` once. Put each question in the `questions` array.
Batch questions only when their options do not depend on another answer. Ask
a dependent question in a later call, once the first answer is known.

Payload rules.

- 1 to 4 questions per call. Question text must be unique within the call
  and should end with a question mark.
- Each question needs a `header`, a chip of at most 16 characters, for
  example "Auth method" or "Library".
- Each question needs 2 to 4 options. Labels must be unique within the
  question.
- `label` is at most 60 characters, 1 to 5 words, outcome-oriented. When you
  recommend an option, make it first and put "(Recommended)" at the end of
  its label.
- `description` explains what the choice means or its trade-offs.
- Set `multiSelect: true` when several answers are valid. Leave it off when
  options are mutually exclusive.
- `preview` (single-select questions only) holds markdown for artifacts the
  user compares side by side, such as UI mockups, code snippets, or config
  variants. Skip it for simple preference questions.

Never author the rows the tool appends itself. "Type something.", "Other",
and "Next" are reserved labels and are rejected at runtime.

### 5) Commit the decision

After the answer arrives.

- Restate the decision in plain language.
- State what you will do next.
- Proceed with implementation.

### 6) Re-open only on new ambiguity

Do not run repeat confirmation loops.

## Question budget

- Max 1 call per decision boundary in normal cases.
- Max 2 calls for the same boundary when the first answer was unclear or
  cancelled.
- Never ask the same trade-off again without new evidence.

Escalation ladder.

1. Attempt 1, structured options plus the concise summary from step 3.
2. Attempt 2, only if needed, a narrower question with your recommendation
   and these choices. Proceed with recommended option, choose another option
   (freeform), stop for now.

After attempt 2. For a `high_stakes` boundary, stop and mark the work
blocked. Do not keep asking. For an `ambiguous` boundary where the user says
"your call", proceed with the most reversible default and state the
assumptions.

## Payload example

```json
{
  "questions": [
    {
      "question": "Which caching strategy should the first release use?",
      "header": "Cache",
      "options": [
        {
          "label": "Redis (Recommended)",
          "description": "Shared across instances and fast, adds an ops dependency"
        },
        {
          "label": "In-memory",
          "description": "No new dependency, weak consistency between instances"
        }
      ]
    },
    {
      "question": "Which hardening items go into the first wave?",
      "header": "Hardening",
      "multiSelect": true,
      "options": [
        { "label": "Rate limiting", "description": "Caps abuse, needs a limit decision now" },
        { "label": "Audit logging", "description": "Cheap to add, pays off during incidents" }
      ]
    }
  ]
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
- Batching dependent questions in one call
- Proceeding with high-stakes work after a cancelled or unclear answer
