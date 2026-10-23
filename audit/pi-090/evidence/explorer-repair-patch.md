## Components Found

Operator setup: pi-coding-agent v1.3.0 on Node v22.19.0, stock `edit` tool, no edit plugin (/tmp/spike task statement; harness confirms stock runs at /tmp/spike/harness/run.sh line 16, model `opencode-go/mimo-v2.5`).

### 1. pi-edit-guard (repair behind the stock name)

1. **Tool name and schema.** It keeps the stock `edit` name and argument schema. The README Tools table says it "Overrides the built-in `edit` tool (extension tools win by name)" and "The model keeps calling `edit` exactly as it always has, with no prompt or tool-name changes" (/tmp/spike/full-pi-edit-guard.txt, README "Tools" and intro sections, lines 153–155 and ~85–90). It adds one new tool `undo` (lines 156–162). Killswitch `editOverrideEnabled` (line 153).
2. **Runtime repair and match passes.** Argument repair runs in `prepareArguments` before schema validation: envelope recovery (bounded 256 KB input, depth 64, 3 decode attempts, 25 ms budget), preprocessors (field aliases `old_string`→`oldText` etc., stringified `edits` repair up to 5 rounds), schema-guided repair up to 3 passes, then TypeBox validation (/tmp/spike/full-pi-edit-guard.txt, "Argument repair", lines ~401–470). Matching runs 3 autopatch passes (escaped control characters, trailing whitespace, indentation), then a 14-pass tiered literal chain (`simple … token_overlap`, line ~520), then two-pass block resolution over the file. Strict safety gates: original text must match zero times, corrected candidate exactly once.
3. **What the model sees.** Success: native-parity text plus `details = { diff, patch, firstChangedLine }` and an additive `guard` block (README "Result shaping", line ~235). Repaired call: `<repair_note>` blocks attached to the result (README "Repair notes channel"). Hard failure: model-facing retry message that lists schema failures, closest-candidate report with similarity percentages, `[WARNINGS]` lines, stormbreaker error suffixes and a corrective retry prompt, stale-read block "re-read the file and retry".
4. **Partial apply.** Yes, half an edit can land. "If some edits resolve/apply and others fail, the executor takes the partial-apply path: it writes the successful edits and reports each failure" (README "Edit engine"). The vendor pool counts 320 partial-apply of 1396 ("By the numbers").
5. **Undo state.** Append-only JSONL, one record per path, last line wins, tombstones, FIFO eviction at `undoMaxBytes` (default 5 MB, clamped 64 KB–50 MB), survives sessions. Location: `PI_UNDO_STORE_PATH`, else `<pi-agent-dir>/pi-better-toolcalls-undo-store.jsonl`, else `~/.local/state/pi-better-toolcalls/undo-store.jsonl` (/tmp/spike/full-pi-edit-guard.txt lines 655–690). I verified the real on-disk format in /tmp/spike/cfg-editguard/pi-better-toolcalls-undo-store.jsonl: one JSON line per path with `content`, `resultContent`, `rawContent`, `rawResult`, `bom`, `originalEnding`, `encoding`, `updatedAt`, `sessionId`, `project`.
6. **Requirements and killswitches.** "Node >= 24.18.0" (/tmp/spike/full-pi-edit-guard.txt line 793). 0 dependencies, 5 peers, version 0.1.9, published Oct 14 2026, 1,215 downloads/mo (lines 63–78). Killswitches: `editOverrideEnabled`, `undoEnabled`. Config keys: `repairPolicy`, `stormbreakerThreshold`, `staleReadToleranceMs`, `coherenceCheckEnabled`, `overwriteGuardEnabled`, `stormbreakerAutoContinue`, `telemetryEnabled`, `warningsEnabled`. Config file `edit-guard-config.json` (global agent dir, project `.pi/`), layered defaults ← global ← project ← env (lines 177–202).

### 2. pi-edit-file (flat patch-string tool)

1. **Name and schema.** New tool `edit_file` with schema `{ path: string, patch: string }` (/tmp/spike/full-pi-edit-file.txt lines 116–130). When loaded from a package it hides the stock tool: "`edit_file` withdraws pi's built-in `edit` tool (same name re-registered with `exposure: "hidden"`)" (lines 142–146). The model sees one edit path.
2. **Matching.** Per hunk, three tiers against the original file: exact, then trimmed lines, then collapsed whitespace. The block must match exactly once. Line hint `NNN` is advisory only (README "Matching").
3. **What the model sees.** Success: verdict first line ("applied — 2 of 2 hunks, file written"), per-hunk reports, optional `note:` line. Failure: "batch rejected — 0 of 2 hunk(s) applied, nothing was written to the file", plus per-hunk diagnosis, closest line with similarity percent, `=`/`≠` candidate markers, and a ready-to-paste corrected hunk (README "What the model gets back", "Failures name the defect", lines ~215–330).
4. **Partial apply.** No. "All hunks are resolved against the original before anything is written, so a failure writes nothing". A no-op hunk inside a batch is reported `SKIPPED` and the rest still applies.
5. **Undo.** None documented in the README (/tmp/spike/full-pi-edit-file.txt, no undo/snapshot/backup hits).
6. **Requirements.** Tests run on "plain Node ≥ 22.6 with the built-in type stripping" (line 415). Version 0.3.1, Oct 8 2026, 690/mo, 0 deps 3 peers (/tmp/spike/candidates.json). No killswitch or config keys documented. Failure modes are documented as a diagnosis table (vendor claim).

### 3. pi-snap-edit (line/target tools)

1. **Name and schema.** "On session start, the extension removes Pi's built-in `edit` tool from the active set and adds `quick_edit` and `target_edit`" (/tmp/spike/cand/pi-snap-edit.html, README "Behavior"). New contracts: `quick_edit` (line/range replace, `expectedStartLine` required) and `target_edit` (ops array with `replace`/`delete`/`insert_before`/`insert_after`).
2. **Matching.** `target_edit` runs three tiers: exact substring, then unescaped target, then whole-line trim. "Trim matching only runs when the earlier tiers find nothing". Fuzzy hints are "diagnostic-only and never applied automatically".
3. **What the model sees.** Success: diff plus line-numbered refreshed context. Non-exact match: output says "matched via trim ..." or "matched via unescape ...". Guard mismatch: first differing column plus a copy-paste `expectedStartLine` suggestion. Failure hints list moved/close matches and batch line shifts.
4. **Partial apply.** No. "Invalid `quick_edit` ranges/overlaps, invalid `target_edit` selectors/ranges, target misses, and `expectedStartLine` mismatches are rejected without partial writes" (same README bullet list).
5. **Undo.** None documented (no undo/snapshot/backup hits in /tmp/spike/cand/pi-snap-edit.html).
6. **Requirements and signals.** Version 5.3.0, Sep 21 2026, 339/mo, 1 dep 2 peers (/tmp/spike/candidates.json). Maintenance flag: "Experimental project — superseded by pi-utils" banner (line 33). No killswitch or config keys documented. Documented weakness: "`expectedStartLine` guards the current `start` line only; it does not verify the full range or detect line shifts". Eval harness exists: `npx tsx test/eval-guidelines.ts` (vendor claim).

### 4. pi-apply-patch-universal (Codex patch-string tool)

1. **Name and schema.** New tool `apply_patch` with a Codex-style patch string. When active it "hides and blocks built-in `edit` and `write` tools" by default (`disableNativeEdit: true`) (/tmp/spike/cand/pi-apply-patch-universal.html, README Features and Configuration table).
2. **Repair and matching.** Argument normalization: `input`/`patch`/`diff`/`content` keys and raw strings accepted before validation. Forgiving markers and file headers. Matching: a semantic anchor `@@ <line>` is mandatory, line hints rebased by earlier net line change, then content search, then full-file scan, then "a final pass anchors on real code and tolerates paraphrased or truncated doc comments" only when the alignment is unique (README "Matching behavior").
3. **What the model sees.** Success: line-numbered colored diff like native edit, plus `+X -Y` counters. Failure: "Self-Healing Diagnostics: hunk failures include the closest match with line numbers plus concrete advice". Distinct report for a patch cut off before `*** End Patch`.
4. **Partial apply.** No half-write on failure: "All files are matched and computed before any write. Commit failures or cancellation restore modified contents, permissions, and symlinks". Documented limit: "This is in-process recovery, not crash recovery or transaction isolation against concurrent external writes."
5. **Undo.** None. Rollback exists only inside one call.
6. **Requirements and killswitch.** Version 0.3.1, Oct 10 2026, 716/mo, 0 deps 3 peers (/tmp/spike/candidates.json). Killswitch by default: "If both `providers` and `models` are empty `[]`, the extension remains completely inactive (safe default)". Config file `~/.pi/agent/pi-apply-patch.json`, TUI `/apply-patch`. Grammar-constrained sampling works only on providers with OpenAI grammar support (README Features, vendor claim). Attribution: built on WufeiHalf/pi-apply_patch and matsuzaka-yuki/pi-apply_patch-plus (line 173).

### 5. pi-fileops (Codex patch-string tool, native binary)

1. **Name and schema.** New tool `apply_patch`, argument `input` (aliases `patchText`/`patch` normalized to `input`) (/tmp/spike/cand/pi-fileops.html, README "Patch format"). Also callable in codemode as `tools.apply_patch({ input })`. Stock `edit` is not mentioned as hidden.
2. **Repair and matching.** Path cleanup strips leading `@` and quotes. A native Rust binary owns parsing, matching, and writes. Results report a `fuzz` value, so matching is fuzzy, but the pass count is not documented. Direct calls use Lark grammar constrained sampling; other providers get `{ input: string }`.
3. **What the model sees.** Success: changed/created/deleted/moved counts, fuzz, committed unified diff. Partial failure: "the tool returns a `partial_failure` result listing the committed prefix and the failed targets", text tells the model to re-read failed files and not to reapply successful actions, and a `tool_result` hook marks it an error. Total failure: throws with the binary diagnostic bounded to 8 KiB.
4. **Partial apply.** Yes, by design: "Partial failures preserve successful edits and mark the result as an error" (README "Direct and codemode calls").
5. **Undo.** None documented. Only config is `PI_APPLY_PATCH_BIN` (line 107).
6. **Requirements.** "Requires a Rust toolchain" and builds the binary on first use, or set `PI_APPLY_PATCH_BIN` (line 49). Version 0.3.9, Oct 5 2026, 803/mo, 1 dep 1 peer, 25.7 MB (/tmp/spike/candidates.json). Source lives in the `luan/agents` monorepo (line 189). No killswitch; tool presence depends on Pi's active tool selection (README Troubleshooting).

## Flow

**edit-guard call flow.** Model emits stock `edit` args. Preflight normalizes `path` or blocks a non-existent path with near-match suggestions. Stale-read check blocks when file mtime is newer than the last recorded read (+500 ms default). Argument repair rewrites malformed args in `prepareArguments`. The engine reads raw bytes, detects encoding, strips BOM, normalizes LF, runs 3 autopatch passes, resolves blocks in 2 passes over a 14-pass match chain, applies bottom-up, raw-splices onto original bytes, writes atomically via `.guard tmp` rename. The model gets native-shaped output plus a `guard` block, `<repair_note>` on repairs, or a precise diagnostic on failure. Stormbreaker watches results and aborts the turn after 3 identical failures (threshold clamped 1–10), then auto-resumes with a corrective prompt after 3000 ms (/tmp/spike/full-pi-edit-guard.txt, README sections "Core execution", "Stormbreaker", "Preflight").

**edit-guard special focus: is anything model-visible?** The tool name and schema do not change. The model still sees new text: `<repair_note>` blocks, `guard` diagnostics, `[WARNINGS]`, closest-candidate reports, stale-read block messages, stormbreaker corrective prompts, plus a new `undo` tool in the catalog. So the answer is: contract stays stock, feedback channel grows. Only the repair rules and match chain are purely host-side.

**edit-guard corpus claim.** The README claims 71 live failures, stock fails 65, edit-guard fully applies 57, 14 get precise diagnostics, 0 unexpected outcomes; 44-fixture session replay 36 → 23 errors, 13 fixed, 0 regressed; pool of 1396 → 606 full-apply, 320 partial-apply, 254 precise diagnostics (/tmp/spike/full-pi-edit-guard.txt, "By the numbers" and "Integration testing"). The README names replay commands `pnpm replay`, `pnpm replay:live`, `pnpm score`, fixture paths `tests/integration/fixtures/`, corpora `session-failures.json` and `live-failures.json`, and pinned baselines `docs/baselines/`. From this runtime I can only confirm the README documents them. The GitHub repo is not reachable from this session (no shell, no curl, per supervisor decision). The README itself limits reproducibility: raw session logs for the 44-fixture corpus were "removed to keep the repo lean", `farm-sessions/` is "Empty until first batch", and `tmp/pool/` is gitignored. Verdict on the corpus: documented vendor claims with named artifacts, public reproducibility not verified here.

**Local harness cross-check (independent evidence).** A pi harness ran 7 tasks × 6 configs with stock baseline and these plugins (/tmp/spike/harness/run.sh, matrix.sh, hard.sh). Results: stock baseline `cfg` passed 7/7 tasks; `cfg-editfile` passed 7/7; `cfg-editguard` passed 6/7. The failing edit-guard task is `insert-after`: /tmp/spike/matrix.log records `insert-after_cfg-editguard pass=0 rc=0 60s`, while /tmp/spike/harness/out/results.tsv records `cfg-editguard insert-after 1 0 60`. The file on disk proves the matrix.log verdict: /tmp/spike/harness/out/work-insert-after_cfg-editguard/app.js exports `{ add, subtract, multiply }` but /tmp/spike/harness/tasks/insert-after/expected.app.js exports `{ add, multiply, subtract }`. Exact diff fails. The stock run passed this task in 11 s, edit-guard took 60 s. The harness does not reproduce any stock-edit failure, so it neither confirms nor refutes the 92% failure claim.

**Judgment: which package reduces weak-model failures without teaching the model anything new?**

- **pi-edit-guard is the only one.** It keeps the stock `edit` name, schema, and prompt surface. All repair and matching is host-side. Evidence: /tmp/spike/full-pi-edit-guard.txt "The model keeps calling `edit` exactly as it always has".
- The other four all change the contract. `pi-edit-file` hides stock `edit` and teaches a flat patch. `pi-snap-edit` removes stock `edit` at session start and teaches two new tools. `pi-apply-patch-universal` adds a patch grammar and by default hides stock `edit` and `write`. `pi-fileops` adds `apply_patch` and teaches the Codex patch format. Each reduces some failure modes, but each teaches a new contract first.
- Two patch tools use provider-side grammar constraints (pi-apply-patch-universal, pi-fileops). Grammar makes malformed calls undecodable, so this reduces failures without in-context model learning. The patch format itself is still new to the model.
- Costs and risks for a weak model under edit-guard: partial-apply can leave half a multi-block edit on disk, stale-read and stormbreaker blocks add new failure paths the stock tool does not have, and the Node requirement conflicts with the operator setup (finding below).

**Findings**

- **P1 — Node version conflict.** edit-guard documents "Node >= 24.18.0" (/tmp/spike/full-pi-edit-guard.txt line 793). The operator runs Node v22.19.0. Smallest fix: check the npm `engines` field and a smoke load on Node 22 before install. Do not install until this is resolved.
- **P1 — Partial-apply risk is real and by design.** edit-guard writes the successful subset of a multi-block edit (README "Edit engine"), and its own pool counts 320 partial applies. Stock pi `edit` partial behavior is not in my sources, so regression-neutrality is unproven. Smallest fix: verify stock behavior, then decide if `repairPolicy: conservative` is enough.
- **P2 — Harness records contradict each other.** out/results.tsv says edit-guard and hashlinepro `insert-after` passed, matrix.log says both failed, and the on-disk file confirms failure. Smallest fix: regenerate results.tsv from the work files before anyone quotes it.
- **P2 — Pool arithmetic gap.** 606 + 320 + 254 = 1180 of 1396 pool entries. 216 outcomes are not accounted for in the README "By the numbers" table (/tmp/spike/full-pi-edit-guard.txt).

## Sources Read

- /tmp/spike/full-pi-edit-guard.txt (README, all sections)
- /tmp/spike/full-pi-edit-file.txt (README, all sections)
- /tmp/spike/cand/pi-snap-edit.html (README body)
- /tmp/spike/cand/pi-apply-patch-universal.html (README body)
- /tmp/spike/cand/pi-fileops.html (README body)
- /tmp/spike/candidates.json (metadata table)
- /tmp/spike/all-packages.txt (registry names, lines 397, 844, 915, 1813)
- /tmp/spike/harness/run.sh, matrix.sh, hard.sh (harness design)
- /tmp/spike/matrix.log, /tmp/spike/hard.log, /tmp/spike/harness/out/results.tsv, out2/results.tsv, out-smoke/results.tsv
- /tmp/spike/cfg-editguard/pi-better-toolcalls-undo-store.jsonl (undo store format, real run data)
- /tmp/spike/harness/out/work-insert-after_cfg-editguard/app.js, /tmp/spike/harness/tasks/insert-after/expected.app.js, prompt.txt
- /tmp/spike/harness/out/logs/insert-after_cfg-editguard.log (model final message)
- /tmp/spike/cfg-editguard/ (config dir contents: no edit-guard-config.json, so defaults were active)

## Boundaries

- No shell, no curl, no web fetch. Supervisor decision on this runtime: "no shell, no curl ... Work entirely from the on-disk sources". GitHub repos, npm metadata, and pi.dev live pages could not be opened.
- I did not install packages, did not run pi, and did not create, change, or delete any file.
- Harness logs hold only the final assistant message because run.sh uses `pi -p --no-session`. Model-visible tool results are not captured on disk.
- Harness wall-clock includes model generation time. It does not measure the edit-guard match engine.
- I did not read pi-coding-agent source. Stock `edit` partial-apply and override semantics come from the plugin READMEs only.

## Open Questions

1. Does github.com/k0valik/pi-edit-guard contain `tests/integration/fixtures/live-failures.json`, `session-failures.json`, `docs/baselines/`, and the replay scripts? Parent with shell should curl the repo tree and run `pnpm replay` claims check.
2. Does npm metadata for pi-edit-guard declare `"engines": { "node": ">=24.18.0" }`, or is line 793 only documentation? This decides P1.
3. Which harness record is authoritative, results.tsv or matrix.log, and why do they disagree on exactly two rows with identical durations?
4. What are the 216 unaccounted pool outcomes in the edit-guard README numbers?
5. Does stock pi `edit` apply a subset of a multi-block edit on failure? Needed to judge edit-guard partial-apply as neutral or risky.
6. Is `pi-fileops` the same package as `@luan.sh/pi-fileops`? The README title and install command use the scoped name, the registry list uses `pi-fileops` (/tmp/spike/all-packages.txt line 915).
7. Do edit-guard stale-read blocks fire when a bash command changed the file, and how many turns does recovery need?
8. Do pi-snap-edit, pi-apply-patch-universal, and pi-fileops declare Node engines compatible with Node 22.19.0?

Adoption verdict: OK with notes. Only pi-edit-guard meets the "no new contract" requirement. Do not install it on Node 22.19.0 before the engines question is answered, and treat its corpus numbers as vendor claims until the repo is checked.