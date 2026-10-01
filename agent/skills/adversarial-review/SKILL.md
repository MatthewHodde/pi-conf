---
name: adversarial-review
description: Single-context adversarial review of a branch diff, plan, or implemented work — no subagents. Severity-ranked findings via four lenses (deletions, abstractions, callers, currency), acceptance criteria checked separately, merge verdict. Use when the user says adversarial review, review this diff, review the branch, or pre-merge review. Do not trigger for plan review before work starts (st.md step 2), concept questions, or when the user asks for parallel/multi-agent review.
---

# adversarial-review: one context, full tools, no delegation

Review the code, not the memory of writing it. Run inline — no subagents, no
`/parallel-review`, no `workflowScript` review fans: one context owns the whole
evidence chain, from `git diff` pull to verdict. Ordinary tools are all fair game:
`bash`, `read`, `backlog`. Feedback questions are plain discussion in the reply,
never the `ask_user` tool.

## 1. Establish the target

- Base: the branch's merge target (`main` unless told otherwise). Confirm the base ref
  exists: `git rev-parse --abbrev-ref HEAD` for where we are, `git rev-parse <base>` for
  the target. The three-dot diff below resolves the merge-base itself.
- If the base is genuinely ambiguous — multiple plausible targets, no backlog task to
  name one, remote/local divergence that changes the diff — stop and ask in plain
  discussion which base to review against. Do not pick silently; the whole review is
  relative to it.
- The whole diff: `git diff <base>...HEAD` (three-dot — merge-base, not endpoint).
  Stat first (`--stat`) for shape, then full text.
- Uncommitted work is invisible to that diff. Check `git status --short` first: a dirty
  tree gets its staged and unstaged changes reviewed too (`git diff --cached`,
  `git diff HEAD`), and the output must say which parts were uncommitted. A clean-tree
  review that silently skipped dirty changes reviewed an older diff.
- Commits: `git log --oneline <base>..HEAD` — intent evidence.
- Task context if a backlog ID exists: `backlog task view <ID> --plain` for acceptance
  criteria and Definition of Done.
- If git fails: **stop and report the exact error**. Do not fall back to reading files
  and calling it the diff. A reconstructed diff is a different diff.

## 2. Stance switch

Declare out loud: "reviewer stance — I did not write this." Then re-read the diff from
tool output, not from memory of implementing it. Implementer blindness is bias
(confirmation, sunk cost, overconfidence), not a capability gap. Re-pull the diff after
the declaration; never judge from recall.

## 3. Four lenses over the diff

Severity-ranked findings from each, evidence-backed, no nit-padding.

1. **Deletions**: every removed line — why did it exist? Verify via `git log -S` /
   `git log --follow` on the file and via remaining callers. "Cleanup" is a claim, not
   evidence.
2. **New abstractions**: every new function/class/module — born of the problem, or of
   the implementation path? Abstraction that encodes one call site is premature;
   ask what the second caller would need.
3. **Callers beyond the diff**: the diff shows what changed, never what it affected.
   `grep -rn` every changed symbol outside the changed files. Signature, import, config,
   and fixture consumers all count.
4. **Currency**: anything new in the diff — deprecated API, superseded idiom, outdated
   flag? Verify against the installed version or official docs, not memory. The
   coding skill's source order applies.

## 4. Acceptance criteria pass — separate section

Check each acceptance criterion and Definition of Done item individually:
- `satisfied` — `file:line` or commit sha that proves it.
- `unverifiable` — say why (no fixture, no runtime, out of scope).
- `not satisfied` — finding with evidence.

Never merge this ranking into the lens findings: one axis masks the other.

## 5. Findings discipline

- P0 blocks merge, P1 must fix, P2 note/defer. Every finding: file:line, why it matters,
  smallest fix. No findings under a lens: say so, citing what was checked.
- Every finding needs proof read from disk this session (file content, command output).
  No proof → drop it, or label it `HYPOTHESIS` with the check that would confirm it.
- The test suite is evidence: run it if cheap and note the result as review input.

## 6. Feedback points — ask, don't guess

Ask one plain-discussion question (options listed in the reply) when the review hits a
choice only the user can make. Everywhere else, proceed without asking.

- **Base branch ambiguous** (step 1): which base to diff against.
- **Ambiguous acceptance criterion**: wording admits two readings that lead to opposite
  verdicts, and the task doesn't disambiguate. Ask which reading is intended before
  scoring it.
- **Finding with real cost to verify** (needs a running service, destructive command,
  or long build): ask whether to spend it now or report the finding as `HYPOTHESIS`.
- **Verdict BLOCK with a judgment call**: if fixing a P0/P1 would change task scope or
  an accepted design decision (not just correct a defect), report the finding and ask
  fix-now vs. defer-to-task vs. accept-as-is. Defects with a clear smallest fix that
  changes no scope and no accepted design decision: fix them, no question — but finish
  the full review pass first, record findings, then fix, then re-pull the diff
  (`git diff <base>...HEAD`) before writing the output. Lenses run against one
  consistent snapshot; fixes land between review and report, never mid-lens.

Never ask for: merge or close approval (st.md owns those gates), findings the disk
already proves, or choices with an obvious repo convention — check the convention.

## 7. Output

1. Findings, severity-ranked (P0 → P2), lens named per finding, each with a status:
   `open` | `fixed @ <sha>` | `deferred` | `rejected (why)`.
2. Acceptance criteria table: criterion → verdict → evidence.
3. Test command + output tail if run.
4. Verdict line: `Merge verdict: BLOCK` | `Merge verdict: OK` | `Merge verdict: OK with notes`.
