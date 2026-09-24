# Publish a final implementation spec

Iron rule: **the agent never publishes a spec on its own.** The deliverable is always a local file. The user is responsible for distributing it.

Rewrite the publish artifact from confirmed understanding against the template. Use the draft only for fact-checking. Never copy it as source text.

## Where It Goes

The deliverable is the spec or design text as a local file. Where it lands is the user's call -- an Issue, PR description, committed file, or elsewhere. Ask once and let them choose. A timing default: finalizing before work starts → recommend an Issue (it can be claimed and assigned). Wrapping up and backfilling the record afterward → recommend a PR/MR description.

## Allowlist Template

The published text may consist of only the following five sections. Nothing outside them may appear:

```markdown
## Problem

<Problem statement, from the user's point of view>

## Solution

<Solution description, from the user's point of view>

## Acceptance Criteria

<Drawn from the inversion-based failure test, verifiable point by point>

## Key Decisions

<Why A was chosen over B, one sentence per rejected option>

## Out of Scope

<What is explicitly not being done>
```

## Privacy Discipline (Non-Negotiable)

- The published text must not contain: backlog internal paths, verbatim quotes from the draft, internal codenames, judgments about specific individuals, or file paths and code snippets (except a schema or state machine that encodes a decision, which must be labeled as coming from the prototype).
- Within the template's five sections, any content you filled in by inference rather than the user's confirmation (most common in Out of Scope) must be labeled item by item as "inferred, unconfirmed" in the preview.
- **Run the mechanical gate before showing the user.** Write the candidate text to a temp file and run `python3 scripts/check-publish.py <draft-spec.md> <candidate.md> <title>` (paths relative to this skill's directory; the title argument is required so it gets scanned too). It catches leaked private paths, verbatim draft lines, and missing template sections, and warns when the target repo is public. Fix every finding and rerun until green, only then show the text to the user.
- Before publishing, show the user the complete final text. When the repository can be detected as public, add a prominent notice: "This will be published to a public repository." Only run the publish command after the user explicitly confirms. The gate runs before the human, never instead of the human.

## Handoff

This skill does not run a publish command. The deliverable is the distilled text as a local file. Hand it to the user for distribution. Do not improvise a substitute publish channel on your own.

## No-Git Scenario

The draft is the final state: the `spec.md` inside the task directory is the deliverable. If the user needs to sync with or persuade someone else (a co-founder, family member, or client), distill the spec into a passage ready to send (following the same allowlist discipline) and hand it to the user.
