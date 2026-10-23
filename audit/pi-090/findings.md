# PI-090 findings: pi edit plugins for weak-agent reliability

Date: 2026-10-23
Task: PI-090 (spike)
Verdict: adopt none today. Hold pi-edit-guard for a weaker model class.

## 1. Question

Weak agents may fail on the stock edit tool. The stock tool needs an exact text match. This
spike surveys the pi.dev plugin space and reads what each plugin changes.

## 2. Environment

- pi 1.3.0 from npm, Node v22.19.0, smolvm sandbox
- Model in the live test, opencode-go/mimo-v2.5, the install default
- Stock baseline, 12 packages installed, no edit plugin in use
- Scratch configs under /tmp/spike, production config untouched
- Heredoc guard from PI-083 blocked one setup write. The write tool did the file writes.

## 3. The stock contract, verified from pi 1.3.0 source

This closes the load-bearing assumption of the task. Source files on disk:

- dist/core/tools/edit.js (146 lines)
- dist/core/tools/edit-diff.js (420 lines)

Findings:

1. Stock edit matches `oldText` with an exact `indexOf` first.
2. A fuzzy fallback runs when the exact match fails. It normalizes with NFKC, strips trailing
   whitespace per line, and maps Unicode quotes and dashes to ASCII. Edit-diff.js line 31 and
   line 143.
3. Leading indentation differences still fail. The normalizer trims line ends only.
4. Duplicate matches raise an error with the count and ask for more context. Edit-diff.js
   line 188.
5. A multi-edit call is all-or-nothing. All members match before one write runs.
6. Stock already repairs three malformed shapes. It parses `edits` sent as a JSON string,
   hoists a single edit object, and hoists a legacy flat `oldText` pair. Edit.js,
   `prepareEditArguments`.
7. BOM is stripped. CRLF is normalized for the match and restored after the write.

So the exact-match premise holds with four built-in tolerances. Stock does not repair a wrong
field name such as `old_string`. Stock also misses three cases. Leading indent drift fails, a
wrong target choice lands, and no closest-candidate diagnostic exists.

## 4. Survey (acceptance criterion 1)

pi.dev holds 2282 packages over 108 listing pages. A keyword filter found 19 edit-related
packages. Detail pages were read for all 19. The full metadata table sits in
evidence/explorer-anchor-family.md and evidence/synthesis.md.

### 4.1 Shortlisted and live tested

| Package | Version | Published | Downloads |
|---|---|---|---|
| pi-hashline-edit-pro | 6.5.1 | Oct 20, 2026 | 18.9K/mo |
| pi-better-edit | 2.13.3 | Oct 22, 2026 | 3,788/mo |
| pi-edit-guard | 0.1.9 | Oct 14, 2026 | 1,215/mo |
| pi-linehash-edit | 2.3.4 | Oct 1, 2026 | 296/mo |
| pi-edit-file | 0.3.1 | Oct 8, 2026 | 690/mo |

### 4.2 Surveyed, not tested

pi-hashline-edit, pi-hashline-readmap, pi-multiedit, pi-mono-multi-edit, pi-fileops,
pi-apply-patch-universal, pi-snap-edit, pi-edit-first, pi-deepseek-v4-anchor.

Confirmed as not edit tools. pi-anchor, pi-cc-patch, pi-edit-last, pi-edit-session-in-place,
pi-file.

All 19 packages published between Jul and Oct 2026. The space is active.

## 5. Mechanism classes (acceptance criterion 2)

Five classes appear in the evidence.

| Class | Model must emit | Stock `edit` |
|---|---|---|
| 1. Anchor addressed | 4-char anchors, line hash tokens, or file checksum | removed or shadowed |
| 2. Repair behind stock name | stock arguments, unchanged | kept by name |
| 3. Patch string | hunk block with `@@` headers | hidden or removed |
| 4. Line and selector | line ranges or a selector per item | removed or coexists |
| 5. Steering hook | unchanged edit calls | unchanged |

Per package detail sits in evidence/synthesis.md section 5. It carries one row per package
with tool contract change, learning cost, disk state, requirements, maintenance, and evidence
strength.

Two requirement facts changed by direct test:

1. README Node floors are documentation only. pi-better-edit states Node 24.0.0 and
   pi-edit-guard states Node 24.18.0. Both ran on Node v22.19.0 in this spike and wrote their
   own state files.
2. Class 1 state lives in `$HOME/.config/<pkg>/`, not in the agent dir. An isolated
   `PI_CODING_AGENT_DIR` does not contain it. Confirmed on disk after the runs.

## 6. Live test results (acceptance criterion 3)

Method. 7 edit tasks, 6 configs, model mimo-v2.5, 42 scored runs, 300 second timeout, byte
exact final file match. Two hard tasks target the classic failure modes. One is a 160 line
file with 24 near-identical functions. One is JSON with escaped quotes and backslashes.

| Config | Pass | Fail |
|---|---|---|
| stock baseline | 7 | 0 |
| pi-hashline-edit-pro | 7 | 0 |
| pi-edit-guard | 7 | 0 |
| pi-better-edit | 7 | 0 |
| pi-edit-file | 7 | 0 |
| pi-linehash-edit | 6 | 1 |

### 6.1 Adjudication of the three failed rows

1. insert-after under edit-guard and hashline-pro. The scorer compared export order. The
   prompt never asked for an order. Both runs placed the function correctly and exported it.
   Both re-scored as pass. The assertion was wrong, not the code.
2. indent-mismatch under linehash, two repeat runs. The runner renamed the file. The model
   found the right file, reasoned about the name, and made the right edit. The scorer looked
   for the old name. Both re-scored as pass.
3. indent-mismatch under linehash, one run. It timed out at 300 seconds with an empty log.
   Three repeats gave correct edits. One hang in 43 total runs. Cause unknown. Full tool call
   transcripts would show it.

### 6.2 Engagement evidence

Disk and session artifacts prove the plugins ran, not only that configs listed them.

| Package | Proof |
|---|---|
| pi-linehash-edit | Session file shows calls to `read` and `replace`, no stock `edit` |
| pi-edit-guard | Undo JSONL holds 8 entries from the test runs |
| pi-hashline-edit-pro | `~/.config/pi-hashline-edit-pro/hash-store.sqlite`, 7 snapshots, 7 undo rows |
| pi-better-edit | `~/.config/pi-better-edit/hash-store.sqlite`, 279 served leases, 536 lineage rows, 7 undo rows |
| pi-edit-file | No disk artifact found. Engagement not proven |

### 6.3 What the result means

The premise did not reproduce. Stock edit passed all 7 tasks with mimo-v2.5, including both
hard tasks. No candidate beat the baseline on correctness. Source reading explains part of
it. Stock edit already carries a fuzzy fallback and three argument repairs.

## 7. Recommendations (acceptance criterion 4)

| Package | Call | Reason |
|---|---|---|
| pi-edit-guard | hold, adopt if a weaker model fails | keeps the stock name and schema, teaches the model nothing new, covers the real stock gaps such as wrong field names and indent drift |
| pi-hashline-edit-pro | reject | removes stock edit, 8 new tools, SQLite dependency, echo refusals, prompts and skills turn stale, no measured gain |
| pi-better-edit | reject | same class, new `file` key and serve discipline, state outside the agent dir, no measured gain |
| pi-linehash-edit | reject | replaces read and edit, one hang in 43 runs, full re-read on stale, no measured gain |
| pi-edit-file | reject | new patch grammar, engagement not proven, no measured gain |
| pi-hashline-edit | reject | upstream of pro, oldest publish, snapshot location undocumented |
| pi-hashline-readmap | reject | replaces 6 tools, validated below pi 1.3.0 |
| pi-multiedit | reject | most invasive, withdraws `write`, conflicts with hashline packages |
| pi-mono-multi-edit | reject | 4 edit-capable tools compete for one choice, license unknown |
| pi-fileops | reject | 25.7 MB, builds a native binary on first use, no undo store |
| pi-apply-patch-universal | reject | hides stock edit and write, in-process rollback only |
| pi-snap-edit | reject | supersession banner points elsewhere |
| pi-edit-first | reject | blocks the write fallback and steers to the failing tool |
| pi-deepseek-v4-anchor | reject | experimental, narrow model scope, writes settings.json |
| 5 confirmed non-tools | no action | not edit tools |

## 8. Evidence gaps

1. pi-edit-file engagement. No session record and no disk state. One probe run would settle
   it.
2. Weakest model class. Local llama.cpp models, Qwen2.5-14B and Qwen3.5-9B, never ran. The
   harness can rerun them from the host.
3. Long session cost. Token savings make the main claim of class 1. This spike measured
   correctness on short runs only.
4. Repo activity and npm engines fields need a URL fetch. Marked web boundary in
   evidence/synthesis.md section 7.
5. edit-guard corpus reproducibility. Its 71 failure corpus needs a clone and `pnpm replay`.
6. linehash hang root cause. Needs full tool call transcripts.

## 9. Artifacts

- evidence/synthesis.md, merged report from three explorers and one synthesizer
- evidence/explorer-anchor-family.md, class 1 detail with line citations
- evidence/explorer-repair-patch.md, class 2 and 3 detail
- evidence/explorer-additive.md, class 4 and 5 detail plus the non-tool check
- tasks/, run.sh, matrix.sh, hard.sh, rerunnable harness
- Every investigation step was read-only. No package install and no pi run happened for this
  report.
