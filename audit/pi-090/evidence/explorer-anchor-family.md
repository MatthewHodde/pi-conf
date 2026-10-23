# Anchor-Protocol Family — Review of Five pi Plugins

## Components Found

Scope: five packages, pi.dev page extracts on disk. All extracts mirror `https://pi.dev/packages/<name>`.

### 1. pi-hashline-edit-pro (fork, "pro")

Source: `/tmp/spike/pi-hashline-edit-pro.txt` (extract of `https://pi.dev/packages/pi-hashline-edit-pro`), `/tmp/spike/pi-hashline-edit-pro.html`.

1. **Tools replaced.** Quote: "The extension registers eight tools: read, replace, replace_match, insert, copy, move, grep, and undo_last_change. The built-in edit tool is disabled." (`/tmp/spike/pi-hashline-edit-pro.txt:268`). Session table: `read` overridden, `edit` disabled, `grep` replaced by anchored grep (default on), `write` kept with an auto-read block appended, `bash` untouched, `copy`/`move`/`replace_match` added with toggles.
2. **Schema the model must emit.** `replace`: flat top-level `{remove_from, remove_to, text}` with 4-char anchors, one edit per call. `insert`: `{anchor, direction: "before"|"after", text}`. `replace_match`: `{replace_from, replace_to, match, replacement}`. `path` is optional by default, the file resolves from anchor ownership (`/tmp/spike/pi-hashline-edit-pro.txt`, Tools → insert; Configuration → requirePath).
3. **Return and next edit.** Quote: "the result is the post-edit diff with fresh anchors, so the next edit needs no re-read" (`/tmp/spike/pi-hashline-edit-pro.txt:101`). `+anchor│` and `anchor│` rows are live, `-anchor│` rows are dead. Diff cap 50KB, rows past the cap are not served, `anchorsOmitted` means a fresh read is needed.
4. **Anchor minting and staleness.** Quote: "anchors are allocated, never derived" (`/tmp/spike/pi-hashline-edit-pro.txt`, How anchors work). Pool of 1,353,139 table entries, stride 836,286, per-session seed, exclusive per-file-line ownership. Anchors free when a line is edited, a file is written or deleted, `/clear-anchors` runs, or the session quota runs out (`W_ANCHOR_RECLAIMED`). Refusals: `[E_STALE_ANCHOR]` (not owned in this session), `[E_RANGE_STALE]` (line changed or never shown, the error returns fresh rows). After restart, restored ownership counts as shown (`/tmp/spike/pi-hashline-edit-pro.txt`, replace section).
5. **Disk state.** `~/.config/pi-hashline-edit-pro/hash-store.sqlite` (+`-wal`/`-shm`) holds per-file anchor snapshots and the undo table. `sessions/<key>.registry.jsonl` holds the ownership log. `config.json` holds settings. Override `PI_HASHLINE_DIR`, XDG aware (`/tmp/spike/pi-hashline-edit-pro.txt`, Privacy and on-disk state). Undo survives restarts, single-level per file, keyed by file path not session, 30-day retention default.
6. **Hard needs.** Quote: pi-coding-agent `>= 0.99.0`, "Node.js 22.19 or newer, or a Bun build that ships bun:sqlite" (`/tmp/spike/pi-hashline-edit-pro.txt:154-160`). SQLite runtime mandatory: `node:sqlite` or `bun:sqlite`, else "every tool fails with `[E_STORE_UNAVAILABLE]`" (`/tmp/spike/pi-hashline-edit-pro.txt:169`). The pi release binary's bundled Bun lacks `node:sqlite`.
7. **Maintenance.** v6.5.1, published Oct 20 2026, 18.9K/mo · 2,615/wk, author yugimob, MIT, 15.7 MB, 4 deps · 3 peers (`/tmp/spike/pi-hashline-edit-pro.html:26`). Repo `https://github.com/YuGiMob/pi-hashline-edit-pro` (same file). Repo commit activity not verified, this session has no fetch tool.
8. **Failure modes, limits, killswitches.** Full code list: `[E_STALE_ANCHOR]`, `[E_RANGE_STALE]`, `[E_BAD_SHAPE]`, `[E_BAD_REF]`, `[E_SUBSTRING_NOT_FOUND]`, `[E_UNDO_STALE]`, `[E_UNDO_UNAVAILABLE]`, `[E_UNDO_NONE]`, `[E_FILE_TOO_LARGE]`, `[E_STORE_UNAVAILABLE]`, `[E_WRITE_HASH_ECHO]`, `[E_BATCH_OVERLAP]`, `[E_OP_ABORTED]`, `[E_GREP_FAILED]`, `[E_GREP_TIMEOUT]`, `[E_REGISTRY]`, plus `W_*` and `H_*` hint codes. Limits table: 2000 lines/50KB output, 50KB per row, 1,353,139 lines/file, 100MB file, 1MB patch guard, 100-line stale-range feedback, session anchor quota 1,353,139. Killswitches: `/hashline-config` per-tool toggles, `disableOnModels` (per-model full removal of anchored surface), `readOnDisabledModels`, `/clear-anchors`, `PI_HASHLINE_DEBUG`, uninstall.
9. **Token claim.** No percentage savings claim. The claim is tokenizer cost: the `anchor│` unit "is verified to tokenize as exactly three tokens in each of eight modern open-weights tokenizers", anchor = 2 tokens (`/tmp/spike/pi-hashline-edit-pro.txt:2174-2178`). Citation for quality: "Explicit Edit Benchmark, an open third-party suite of 226 deterministic, byte-exact editing tasks" (Benchmark section), no score printed on the page.

### 2. pi-better-edit

Source: `/tmp/spike/pi-better-edit.txt` (extract of `https://pi.dev/packages/pi-better-edit`).

1. **Tools.** Tagline: "Hash-anchored read/edit/undo tools". README documents `read`, `edit`, `undo_last_edit` under pi's own names (Tools table, `/tmp/spike/pi-better-edit.txt`, Tools section). It does not print an explicit "built-in edit disabled" sentence like pro does. `bash` also changes: single-file views (`cat`, `head`, `tail`, `sed -n`, admitted `grep`/`rg` shapes) return `HASH│content` rows with working leases (Bash View section).
2. **Schema.** `read`: `file`, `offset` (1-based), `limit`, `windows` (up to 16 disjoint slices), `mode` (`served` default, `verbatim`). `edit`: `{file, edits: [{anchor_from, anchor_to, at?, text OR text_ref}]}`, 1 to 32 items, inclusive anchor pair, exactly one payload per item, `at` spelled `"in-place"` (the underscore spelling is refused), `text_ref` needs `mode: "copy"|"cut"`. Note the key is `file`, not `path`. `undo_last_edit`: `path`.
3. **Return and next edit.** Unified diff with fresh anchors: `- szJx│ ... + a3mX│ ...` (`/tmp/spike/pi-better-edit.txt`, Quick Start). Claim: "Self-Serving Diffs: Every applied edit returns fresh anchors ... zero re-read roundtrips". Rejections serve current rows ("fail-closed reject-and-serve", recovery in exactly 1 turn).
4. **Minting and staleness.** Content-derived: xxHash32 of (canonical path, canonical line) mapped to 4-char base62, 14,766,336 space, coprime probe stride 3,907 for duplicate lines, 28-code-point whitespace class stripped before hashing. Session-keyed leases in `served_leases` granted on every serve path. Exterior drift auto-rebases via Patience LIS. Refusals: `[E_STALE_ANCHOR]`, `[E_UNKNOWN_ANCHOR]`, `[E_FOREIGN_ANCHOR]`, `[E_STALE_RANGE]`, `[E_UNVERIFIED_RANGE]`, `[E_TARGET_LOST]`.
5. **Disk state.** `~/.config/pi-better-edit/hash-store.sqlite` (WAL), tables `file_snapshots`, `line_lineage`, `line_id_counters`, `served_leases`, `file_undo`. Snapshot retention: proportional LRU under 50MB. Settings: `<project>/.pi/agents/pi-better-edit.json` or `~/.config/pi-better-edit/pi-better-edit.json`, env `PI_BETTER_EDIT_CONFIG_DIR`. Undo: `file_undo` is snapshot-pinned, "Persists across restarts" (Tools table, undo row).
6. **Hard needs.** Quote: Node.js `>= 24.0.0`, pi-coding-agent `>= 0.75.0 (peer dependency)` (`/tmp/spike/pi-better-edit.txt:209-214`). SQLite store is core to v2.
7. **Maintenance.** v2.13.3, published Oct 22 2026, 3,788/mo · 479/wk, author rianico, MIT, 1.6 MB (`/tmp/spike/pi-better-edit.txt`, page header). Repo `github.com/Rianico/pi-better-edit` (`pi install git:github.com/Rianico/pi-better-edit`). Repo activity not verified.
8. **Failure modes, limits, killswitches.** 22 `E_*` codes and 7 `W_*` codes listed in the Error and Warning Contract table (examples: `E_BAD_PAYLOAD`, `E_MALFORMED_ANCHOR`, `E_SUSPICIOUS_TEXT`, `E_BATCH_ABORT`, `E_NOOP_LOOP`, `E_EMPTY_RANGE`, `E_LOSSY_TEXT`, `E_LARGE_FILE`, `E_UNDO_STALE`, `E_INTERNAL_INVARIANT`). Limits: 32 edits per batch, 200,000 served lines admission, 14,766,336-line ceiling, 50MB snapshot budget. Killswitches: `bash.view` option, `/pi-better-edit` command, `PI_BETTER_EDIT_LENS_BRIDGE`, `PI_BETTER_EDIT_BASH_VIEW`, uninstall. No per-model disable documented in the README.
9. **Token claim.** Quote: "line-anchored feedback cut repair tokens by 22–58% while improving patch correctness in paired experiments (Lamberti 2026, arXiv:2607.12713)" (`/tmp/spike/pi-better-edit.txt`, Core Pillars). Second citation: TokDrift, arXiv:2510.14972, for tokenizer-stable anchors. Benchmark: Explicit Edit Benchmark arm "95.9% quality, 94.7% first-attempt exact, 99.6% exact after recovery", but the page admits the arm is "pinned to pi-better-edit@1.7.0 — the retired 1.x heuristic era", so the score does not describe v2.

### 3. pi-linehash-edit

Source: `/tmp/spike/full-pi-linehash-edit.txt` (extract of `https://pi.dev/packages/pi-linehash-edit`), `/tmp/spike/cand/pi-linehash-edit.html`.

1. **Tools.** Quote: "Requires pi 0.79.0 or newer. When a session starts, the extension replaces pi's read tool, registers replace, and disables pi's built-in edit tool." (`/tmp/spike/full-pi-linehash-edit.txt:311-315`). Two tools only: `read`, `replace`.
2. **Schema.** `read` returns `checksum:4vQj8YqLw7R3tP0uN2mKxA` then numbered lines `1│const a = 1;`. `replace`: `{path, checksum, changes: [{range: [start, end], content_lines: [...]}]}`, inclusive line numbers, empty `content_lines` deletes, same-file batches apply bottom-up.
3. **Return and next edit.** Result carries the next checksum. Auto-read (on by default) returns windows of up to 32 lines around each change, cap 2,000 lines or 50KB, and names omitted regions. Next edit needs the new checksum plus current line numbers.
4. **Minting and staleness.** Checksum = `base64url(first_128_bits(SHA-256(domain || lengths || canonical_path || raw_bytes)))`, exactly 22 chars, covers whole file bytes and path. Any byte change returns `E_STALE_CHECKSUM`. Quote: "Retrying the old checksum cannot make it current." (`/tmp/spike/full-pi-linehash-edit.txt:211`). Overlap returns `E_EDIT_CONFLICT`. Version guard, not a target guard.
5. **Disk state.** Quote: "The protocol is stateless. It does not need a cache, database, session record, or persisted line index." (`/tmp/spike/full-pi-linehash-edit.txt:254`). Config only: `~/.config/pi-linehash-edit/config.json` with `{"autoRead": true}`. No undo tool in the README.
6. **Hard needs.** pi >= 0.79.0. Development needs Node.js 22. No SQLite, no database.
7. **Maintenance.** v2.3.4, published Oct 1 2026, 296/mo · 16/wk, author lkraider, MIT, 60.5 KB, 0 deps (`/tmp/spike/full-pi-linehash-edit.txt`, header; `/tmp/spike/cand/pi-linehash-edit.html:26`). Repo `https://github.com/lkraider/pi-linehash-edit`. Repo activity not verified.
8. **Failure modes, limits, killswitches.** `E_STALE_CHECKSUM`, `E_EDIT_CONFLICT`, `W_DUP` (replacement repeats a surviving neighbor line), `W_MIXED_EOL`, display-prefix rejection (a submitted line like `2│const b = 2;` that matches a shown row is refused). Limits: 100MB files, replacement result <= 1,000,000 lines, auto-read cap 2,000 lines/50KB. Killswitch: `/toggle-auto-read` only, plus uninstall. No per-model switch.
9. **Token claim.** External: Can Bölük 2026 harness benchmark, 16 models, 3 runs of 180 tasks, hash-addressed editing beat patch editing for 14 of 16 models, Grok Code Fast 1 rose 6.7% to 68.3%, "Grok 4 Fast produced 61% fewer output tokens" (`/tmp/spike/full-pi-linehash-edit.txt:110`). The README disclaims it: "Those numbers do not measure this package." Local: replay with 444 turns and 107 replace calls showed auto-read windows use 45.2% fewer tokens; a 12-case pilot used 11.37% fewer total tokens, and the README states the confidence interval "did not establish a guaranteed saving of at least 10%".

### 4. pi-hashline-edit (upstream)

Source: `/tmp/spike/cand/pi-hashline-edit.html` (extract of `https://pi.dev/packages/pi-hashline-edit`).

1. **Tools.** Quote: "Once installed, pi's read and edit tools are replaced by hashline versions." `grep` optional (off by default, needs `rg` on PATH).
2. **Schema.** `read` output: `LINE#HASH:content`, example ` 9#KT:  console.log("world");`. `edit`: `{path, edits: [{op: "replace"|"append"|"prepend"|"replace_text", pos, end?, lines}]}`. `replace_text` keeps `oldText`/`newText`, fails if not found or if it matches more than once. `pos` is the combined token `LINE#HASH`, for example `"9#KT"`.
3. **Return and next edit.** Result includes an `--- Anchors A-B ---` block with fresh anchors for the changed region. Usable for the next edit "provided the next edit targets the same or nearby lines". No undo tool.
4. **Minting and staleness.** Content hash over `prev + curr + next` neighbors from alphabet `ZPMQVRWSNKTXJBYH`, 2 chars default, config range 2-4. Quote: "editing line N only invalidates anchors for N−1, N, and N+1". Stale hash first tries 3-way snapshot merge recovery with fuzzFactor 0, then fails with `[E_STALE_ANCHOR]`. No fuzzy relocation.
5. **Disk state.** README documents only config `~/.pi/agent/hashline.json`. Snapshots exist for merge recovery, location not documented. Restart persistence not documented in the README.
6. **Hard needs.** No pi version floor and no Node floor documented in the README. Peers: 3 dependencies, 4 peers (`/tmp/spike/candidates.json`).
7. **Maintenance.** v0.8.3, published Jul 14 2026, 932/mo · 154/wk, npm author linioi, MIT, 185.4 KB (`/tmp/spike/candidates.json`, `pi-hashline-edit`). Repo `https://github.com/RimuruW/pi-hashline-edit`. This is the oldest publish of the five. Repo activity not verified.
8. **Failure modes, limits, killswitches.** `[E_STALE_ANCHOR]`, `[E_INVALID_PATCH]` (display prefixes in `lines`), `[E_NOOP_LOOP]` (three identical no-op edits), `[W_DUP]` behavior kept. Grep: limit default 50 max 200, context 0-5. Killswitches: `replaceText: false` removes `replace_text`, `grep: false` default, `PI_HASHLINE_DEBUG=1`, uninstall.
9. **Token claim.** None in the README. Correctness claims only.

### 5. pi-hashline-readmap

Source: `/tmp/spike/cand/pi-hashline-readmap.html` (extract of `https://pi.dev/packages/pi-hashline-readmap`).

1. **Tools.** Quote: "pi-hashline-readmap replaces Pi's read, edit, grep, write, ls, and find; adds enhanced ast_search; retains deprecated optional nu; and post-processes bash." (line 34). Largest surface of the five.
2. **Schema.** Anchor format `LINE:HASH`, example read row `1:f0c|hello, hashline!`. Edit example: `edit({path, edits: [{set_line: {anchor: "1:f0c", new_text: "hello, anchored edits!"}}]}`. Verbs: `set_line`, `replace_lines`, `insert_after`, `copy_lines`, `move_lines`, plus exact-text escape hatch `replace`. Full field lists for the other verbs live in `docs/structured-output.md`, not fetched.
3. **Return and next edit.** Structured diffs with fresh anchors. Quote: "anchors made stale by your own line-shifting edit are remapped or refused, never applied to a different line." Next edit needs fresh anchors from `read`, `grep`, `ast_search`, `write`, or the diff.
4. **Minting and staleness.** Content-derived `LINE:HASH` anchors with hard anchor checks at edit time, staleness signaled "forward-only" (context-hygiene doc). Exact hash width and mint rule not in README.
5. **Disk state.** Global `~/.pi/agent/hashline-readmap/settings.json`, project `.pi/hashline-readmap/settings.json`, environment variables win. Mapper cache mentioned in Contributing. Bash compression keeps snapshots (docs/bash-output.md). No undo tool in the README.
6. **Hard needs.** Quote: "Requires Pi extension support and Node.js 22.19 or newer." Validated baseline Pi 0.84.2 with TypeBox 1.3.7, CI provisions exactly Pi 1.2.0. No SQLite stated.
7. **Maintenance.** v0.16.1, published Oct 14 2026, 1,668/mo · 277/wk, author coctostan, MIT, 1.7 MB, 8 deps · 3 peers (`/tmp/spike/candidates.json`, `pi-hashline-readmap`). Repo `https://github.com/coctostan/pi-hashline-readmap`. Repo activity not verified.
8. **Failure modes, limits, killswitches.** Long line clipped at 500 chars with `charOffset`/`charLimit` recovery (default 500, cap 10,000). `write` returns anchors for up to 2000 lines or 50KB, else one-line summary, binary content written with warning and no anchors. Required JSON `null` arguments rejected at host boundary. ast-grep parse failures return `Pattern failed to parse`. Killswitches: `PI_RTK_BYPASS=1` for bash compression, env-var settings override. No per-model switch in README.
9. **Token claim.** No quantified savings claim in README. The pitch is quieter bash output and compact structured output.

## Flow

Shared lifecycle: `read` (or `grep`, `ast_search`, or `write` auto-read) serves rows with anchors → model emits an edit addressed by anchor (or checksum + line numbers) → tool validates against served record or version evidence → tool returns a diff with fresh anchors → next edit chains without re-read.

Contract change vs stock edit, where stock edit needs an exact `oldText` match:

| Package | Address unit | Model still types old text? | Error recovery data |
|---|---|---|---|
| pro | allocated 4-char anchor | No | fresh rows inside the error |
| better-edit | content-derived 4-char anchor | No | fresh rows inside the error |
| linehash | 22-char file checksum + line numbers | No, but full new `content_lines` | re-read required |
| hashline-edit | `LINE#HASH` (line number + neighbor hash) | No, but full `lines` array | re-read, or auto 3-way merge |
| readmap | `LINE:HASH` | No, except `replace` escape hatch | remap or refuse, then re-read |

**What a weak model must learn that it does not know today:**

1. Anchor transcription instead of text echo. It must copy 4-char codes byte-exact and keep track of live versus dead rows (`-anchor│` rows die). A typo now fails as `E_BAD_REF` or `E_MALFORMED_ANCHOR`, not as a visible text mismatch.
2. Serve discipline. Anchors exist only after a serve. `grep` rows serve, `bash` views serve in better-edit, and a model that edits a file it never read gets a refusal instead of a lucky match (`E_STALE_ANCHOR`, never-served refusals).
3. New argument schemas, all different from each other: flat fields (pro), nested `edits` array with `file` key and XOR payload (better-edit), `{path, checksum, changes}` (linehash), `{path, edits:[{op,pos,lines}]}` (hashline-edit), `{path, edits:[{set_line:...}]}` (readmap). Also exact enum spelling `"in-place"` in better-edit.
4. Batch rules. Same-message edits group into one batch in pro, better-edit and linehash. Ranges must be disjoint. One bad member can abort the batch (`E_BATCH_OVERLAP`, `E_BATCH_ABORT`, `E_OP_ABORTED`). Stock edit has no batch concept.
5. Error payloads as data source. In pro and better-edit the refusal carries fresh rows, and the model must retry from the error text without a new `read`. In linehash the refusal demands a full re-read.
6. Echo prohibition. Pro refuses `write` content that reproduces served rows (`E_WRITE_HASH_ECHO`). Linehash rejects a pasted display row. Better-edit refuses anchor-shaped first lines unless `mode: "literal"`. A weak model trained to paste read output verbatim now gets blocked.
7. Undo vocabulary. Single-level, per file, refuses when the file changed (`E_UNDO_STALE`). Pro shares undo across conversations because records key on path.
8. linehash keeps line numbers, so the model must count ranges correctly. The checksum guards the file version only. It does not guard target selection.

**New failure modes that stock edit does not have:**

1. Stale-target refusals after unrelated external changes. In linehash any byte change anywhere rotates the checksum and refuses the edit. Stock edit with an intact `oldText` would still succeed.
2. Anchor quota reclaim in pro (`W_ANCHOR_RECLAIMED`) frees least-recently-used files and turns many anchors dead at once.
3. Neighbor rotation in upstream hashline-edit: an edit at line N invalidates anchors N−1 and N+1, so the next edit on an adjacent line fails even though that line did not change.
4. Runtime dependency failure. Pro fails every tool with `E_STORE_UNAVAILABLE` without SQLite, including `read`. Better-edit needs Node >= 24, which the operator's Node v22.19.0 does not meet.
5. Batch abort semantics, including partial commits and `Aborts batch N.` messages in pro.
6. Echo refusal on `write`, described above.
7. Cross-conversation undo in pro, since undo records key on file path.
8. Tokenizer-dependent anchor cost in pro, with Nemotron 3 Ultra excluded from the verified table.
9. Undo staleness classes in pro and better-edit.

**Judgment per package for a weak model on this operator setup (pi 1.3.0, Node v22.19.0, stock edit, no plugin today):**

- **pro** fits the runtime exactly (pi >= 0.99.0, Node 22.19+). It gives the best recovery contract (fresh rows in every staleness error, auto-read after write, undo). It costs the largest new vocabulary: 8 tools, flat schemas, batch rules, quotas, echo refusal, and a hard SQLite dependency that breaks under the pi release binary. Best fit if the operator runs pi under Node.
- **better-edit** fails the operator's Node floor (>= 24.0.0) as written in its README. Its schema is the strictest (XOR payload, exact enum spelling, `file` key). Auto-rebase of external drift is the strongest feature for formatter-heavy workflows.
- **linehash** has the smallest contract (2 tools, stateless, no database, pi >= 0.79.0 fits). It solves oldText reproduction but not off-by-one targeting, and it refuses on unrelated file changes more often than stock edit.
- **hashline-edit (upstream)** removes oldText but keeps full line arrays, embeds line numbers inside anchors, rotates neighbor anchors, documents no undo, no version floors, and last published Jul 14 2026. Weakest maintenance signal of the five. Pro is its active fork.
- **readmap** fits Node 22.19 but replaces six tools plus bash post-processing, documents no undo, and validates at Pi 0.84.2 / CI 1.2.0, below the operator's 1.3.0. Largest blast radius for a weak model.

## Sources Read

- `/tmp/spike/pi-hashline-edit-pro.txt` — full extract, `https://pi.dev/packages/pi-hashline-edit-pro`.
- `/tmp/spike/pi-hashline-edit-pro.html` — detail links, repo URL, version block (line 26).
- `/tmp/spike/pi-better-edit.txt` — full extract, `https://pi.dev/packages/pi-better-edit`.
- `/tmp/spike/full-pi-linehash-edit.txt` — full extract, `https://pi.dev/packages/pi-linehash-edit`.
- `/tmp/spike/cand/pi-linehash-edit.html` — repo URL, version block (line 26).
- `/tmp/spike/cand/pi-hashline-edit.html` — full README of upstream, `https://pi.dev/packages/pi-hashline-edit`.
- `/tmp/spike/cand/pi-hashline-readmap.html` — full README, `https://pi.dev/packages/pi-hashline-readmap`.
- `/tmp/spike/candidates.json` — publish dates, downloads, sizes, deps for hashline-edit, linehash-edit, readmap.
- `/tmp/spike/npmsearch.json` — npm search dump, inspected, single-line format, no usable per-package rows for this family.
- `/tmp/spike/hard.log` — parent harness log, shows `cfg-linehash` and `cfg-hashlinepro` runs. Not my evidence, I did not run anything.
- Not analyzed, out of my angle: `/tmp/spike/full-pi-edit-file.txt`, `/tmp/spike/full-pi-edit-guard.txt`, `/tmp/spike/all-packages.txt`, `cfg-*` directories.

## Boundaries

- READONLY rule held. I installed nothing, ran nothing, wrote nothing.
- This session gives me no shell or curl tool. I could not fetch npm registry metadata, raw GitHub READMEs, the linked jsdelivr docs (`structured-output.md`, `configuration.md`, `bash-output.md`, FAQ.md), the Explicit Edit Benchmark explorer, or repo activity (commits, issues, releases). Repo activity is unverified for all five packages.
- `watchdog_diff` is not useful here. This is not a commit or diff review.
- pi core source is not on disk. I state stock edit behavior only as the operator described it: exact text match of `oldText`.
- `better-edit` does not print an explicit "built-in edit disabled" sentence. I infer shadowing from tool names and the tagline.
- Readmap per-verb field lists, error codes, and undo status come from README absence only. Absence in README is not proof of absence in the package.
- Line numbers refer to extraction files on disk, not to pi.dev page layout.
- Page "Published" dates are pi.dev render values, not raw npm `time` fields.

## Non-Obvious Things

1. The operator's Node v22.19.0 matches pro's floor exactly and fails better-edit's stated floor of 24.0.0.
2. Pro fails hard without SQLite: every tool, including `read`, returns `E_STORE_UNAVAILABLE`. The pi release binary path is documented as broken for pro.
3. "Anchor" means five different things: allocated token (pro), content hash with coprime probing (better-edit), whole-file checksum (linehash), neighbor content hash with embedded line number (hashline-edit), line-plus-content key (readmap). Semantics do not transfer between packages.
4. The token savings numbers mostly rest on other people's work. Better-edit cites arXiv:2607.12713. Linehash cites the Can Bölük blog and disclaims it, then adds a small local pilot that fails its own 10% threshold. Pro claims tokenizer token counts only. Upstream and readmap claim no percentages.
5. Better-edit's published benchmark score is pinned to the retired 1.7.0 architecture, so the 95.9% number does not describe the version on sale today.
6. Pro's undo records key on file path, not session. Any conversation in a multi-conversation host can revert the last edit on that file.
7. Linehash keeps line numbers. Of the five, only linehash leaves off-by-one targeting risk fully intact, because the checksum validates the version and not the line choice.
8. Upstream hashline-edit anchors contain the line number (`9#KT`) and hash neighbors, so they rotate more often than pro or better-edit anchors.
9. Upstream is the least maintained: Jul 14 2026, v0.8.3, 932/mo. The pro fork (v6.5.1, 18.9K/mo) absorbed its design and moved ahead.
10. Pro warns that prompts, skills and hooks which expect line-numbered `read` output break after install. Every package in the family removes stock `edit`, so all existing stock-edit instructions in the operator's setup become wrong.
11. Readmap validated at Pi 0.84.2 and CI 1.2.0 while the operator runs 1.3.0, so the operator sits past the tested baseline.

## Open Questions

1. What exact fields do `replace_lines`, `insert_after`, `copy_lines`, `move_lines` take, and what are readmap's edit error codes? Need `https://cdn.jsdelivr.net/npm/pi-hashline-readmap@0.16.1/docs/structured-output.md`.
2. Does better-edit start under Node 22.19.0 despite the >= 24 floor, and does `node:sqlite` behave there? Runtime test, not allowed in this session.
3. Where does upstream hashline-edit persist merge snapshots, and what happens across restart?
4. Repo commit and release activity for all five packages. Need `https://registry.npmjs.org/<name>` and GitHub.
5. Where does pro's Explicit Edit Benchmark explorer show a score for pro itself, not just the dataset?
6. What do the parent harness logs (`/tmp/spike/hard.log`, `/tmp/spike/matrix.log`) show for `cfg-linehash` and `cfg-hashlinepro`? Those are runtime results outside my read-only documentation angle.

## Review
- Correct: all nine requested points answered per package from disk extracts, with file paths and line numbers for each claim.
- Fixed: nothing to fix, read-only task.
- Finding: P1, this session has no shell or curl tool, so repo activity, npm registry metadata and the linked docs remain unfetched, which leaves items 1 to 4 in Open Questions open.
- Finding: P2, upstream `pi-hashline-edit` documents no pi floor, no Node floor and no snapshot location, so its hard needs cannot be confirmed from its README.
- Merge verdict: OK with notes.