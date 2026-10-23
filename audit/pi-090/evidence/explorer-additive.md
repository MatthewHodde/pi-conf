All source material on disk is read. The report follows.

## Review
- Correct: the four real candidates and the five suspected non-tools are classified from primary page text. Each claim below carries a source tag.
- Fixed: nothing to fix. This is a read-only investigation report.
- Finding: no blocking defect in the investigation. One tooling gap: this sandbox has no shell tool, so no curl fetch was possible. All web material came from the pre-extracted pi.dev snapshots on disk. See Boundaries.
- Merge verdict: OK with notes (report only).

# Components Found

## Real candidate 1: pi-multiedit (v0.4.1, Oct 12 2026, 1,124/mo, MIT, 2.4 MB, 4 deps, 18 peers)
Source: /tmp/spike/cand/pi-multiedit.html (pi.dev page https://pi.dev/packages/pi-multiedit), /tmp/spike/candidates.json.

1. Touch or add? It REPLACES. Quote: "It replaces pi's `read` and `edit` tools and withdraws `write` (even if `--tools` names it)" (/tmp/spike/cand/pi-multiedit.html, README). It also states a conflict: "Remove pi-hashline-edit if you have it installed: both register `read` and `edit`." Stock edit is gone from the tool list. Write is gone too.
2. Tool list at session start: the model sees the new `read{path, offset?, limit?}` (adds `N#HH` line anchors) and the new `edit{edits, allowSyntaxErrors?}` (scope, one selector from `old`/`from`+`to`/`regex`/`json`/none, action, count). Stock `write` is absent. File creation happens through a selector-less edit (same file). Images still use pi's built-in `read` (source: same README, "The two tools" table).
3. Requirements and maintenance: "pi 1.0.3 or newer, on Node 22.19 or newer" (README, "Requirements"). The operator runs pi 1.3.0 and Node v22.19.0, so the requirement fits. Active maintenance signal: v0.4.1 published Oct 12 2026, eval tables use current frontier models (claude-opus-5-5, gpt-6-sol) (/tmp/spike/candidates.json, README "How it compares"). Documented failure modes: all-or-nothing refusal with "nearest" context lines; syntax-check refusal with `allowSyntaxErrors` escape; mixed line endings give loose matching ("the result says so"); "Deleting a symlink itself is refused; use bash for links"; "hard links break and the owner and extended attributes are not kept"; a race window exists between last check and rename (README, "Limits" and "How it works").
4. Risks for a weak model:
   - Prompt tokens: the `edit` schema is much larger than stock edit (fields scope/selector/action/count plus a complete example in the description). The README claims lower total tokens in evals, but only on frontier models ("Two runs per task show a direction, not a significant result").
   - Tool-choice confusion: LOW on names (the model still calls `edit`), HIGH on concept. The model must learn selectors and anchors. The anchor flow requires a `read` from the new tool first. A weak model that fails exact-text `oldText` on stock edit gets help here: exact-match misses fall back to "ignoring trailing whitespace and curly quotes, then a consistent indentation shift", only when unique, and the result says so (README).
   - Disk state: every write is temp-file plus rename. Mode is kept. Hard links, owner, xattrs are lost (README, "Limits"). Python parser is bundled as prebuilt binaries; other languages need `npm i @ast-grep/lang-<name>`, otherwise "the syntax check skips those files" (README).
   - Size: 2.4 MB, 4 dependencies, 18 peers (/tmp/spike/candidates.json).

## Real candidate 2: pi-mono-multi-edit (v2.0.0, Aug 21 2026, 1,454/mo, license "unknown", 120.4 KB, 1 dep, 4 peers)
Source: /tmp/spike/cand/pi-mono-multi-edit.html, /tmp/spike/candidates.json.

1. Touch or add? Purely additive. Quote: "The extension does **not** override `edit`. Pi's native tool remains the preferred path for ordinary single-file work" (README, "Why additive tools?").
2. Tool list at session start: two new tools beside stock edit and write: `multi_file_edit` (cross-file and repeated-occurrence exact replacements, preflighted on a virtual filesystem) and `apply_patch` (Codex-style Add/Update/Delete). Stock read, edit, write are untouched.
3. Requirements and maintenance: no pi or Node version stated in the README (boundary). Maintenance signals are weaker: v2.0.0 published Aug 21 2026, about two months before the Oct 2026 page snapshot; weekly downloads 76 against 1,454 monthly, which suggests declining install rate (/tmp/spike/candidates.json); license shows "unknown" on pi.dev (/tmp/spike/candidates.json). Documented failure modes: "Cross-file writes use best-effort rollback" only; unsupported patch features are "`*** Move to:` renames", "`*** End of File` sentinel hunks", "Full whitespace or Unicode-normalized patch matching" (README, "Unsupported patch features").
4. Risks for a weak model:
   - Prompt tokens: plus two full tool schemas on every request, with overlap against stock `edit` and `write`. The README answers with a "Choosing a tool" table, but that table lives in the README, not in the model's prompt, so a weak model can pick the wrong tool among `edit`, `multi_file_edit`, `apply_patch`, `write`.
   - Direct help on the exact-match failure: repeated identical `oldText` entries "match successive occurrences", and "Exact matching falls back to curly-quote and trailing-whitespace normalization" (README, "Behavior"). Positional repeats remove the need for invented context.
   - Disk state: direct multi-file writes with best-effort rollback only. A crash mid-batch can leave a partial change, the exact hazard the operator fears.

## Real candidate 3: pi-edit-first (v0.1.9, Oct 15 2026, 1,280/mo, MIT, 18.2 KB, 0 deps, 1 peer)
Source: /tmp/spike/cand/pi-edit-first.html, /tmp/spike/candidates.json. Repo: github.com/sorinirimies/pi-edit-first (README badges).

1. Touch or add? It touches nothing in the tool list, but blocks calls. Quote: "Enforcement lives in a `tool_call` hook, so it adds **zero tokens to the system prompt**. The model only sees a one-line reason when a call is blocked" (README intro). Rules: "1. `write` over an existing file longer than `maxWriteLines` (default 40) — tells the model: use `edit` with targeted replacements. 2. `write` of `Cargo.toml`, `settings.gradle[.kts]`, `package.json` in a dir with no project yet — run `cargo init` / `android create` / `npm init -y`" (README, "Rules" table). And: "Only affects the `write` tool; `edit` is never blocked" (README, "Notes").
2. Mechanism, exactly: it is NOT a permission prompt and NOT a system-prompt text. It is an automatic tool-call block through pi's `tool_call` hook. The model's `write` call is stopped before execution and the model receives a one-line reason as the result. Evidence for the hook contract: "Fails open. pi blocks a tool when a `tool_call` handler throws, so any unexpected error here means 'allow'" (README, "Security notes").
3. Requirements and maintenance: no pi version stated. Strong maintenance signals: CI badge, 95% line and function coverage gate, nightly dependency auto-publish pipeline, conventional commits with git-cliff changelog (README, "Development" and "Releases"). Zero runtime dependencies, no network, no shell (README, "Security notes").
4. Does it help or harm the weak model that already fails on edit? On the evidence, it can harm:
   - It removes the working fallback. A weak model that fails stock `edit` exact-match often succeeds with whole-file `write`. The plugin blocks exactly that path and steers with one line to "use `edit` with targeted replacements", the tool the model already fails at. The README assumes the block is cheap: "A block costs one extra round trip, far cheaper than a whole-file rewrite." That math holds for strong models. For a weak model, each block starts a retry loop on the failing tool, with no extra guidance, because guidance tokens are the thing the plugin deletes by design.
   - Documented escapes reduce the harm: `maxWriteLines` config, `ignore` globs, `/edit-first off`, `/edit-first allow <path>` per session, and fail-open behavior (README, "Config" and "Commands").
   - Perverse incentive, acknowledged by the author: "An agent can still write files through `bash`; the guard exists to keep wasteful rewrites out of your context, not to confine the agent" (README, "Security notes"). A weak model blocked on `write` over an existing file can reach the same result with `bash`. The block also covers only existing files, so a delete-then-write sequence via bash defeats it.
   - Verdict for the operator's stated problem: this plugin solves token waste, not edit reliability. For a weak model that fails on stock edit, it removes the safety valve. Install it only with a raised `maxWriteLines` and an `ignore` list, or not at all until the edit path works.

## Real candidate 4: pi-deepseek-v4-anchor (v1.2.1, Oct 10 2026, 510/mo, MIT, 123.3 KB, 0 deps, 2 peers)
Source: /tmp/spike/cand/pi-deepseek-v4-anchor.html, /tmp/spike/candidates.json. Tagline: "Port of xiaobright/dsh-anchored-standard" (candidates.json).

1. Touch or add? It hides and rewrites the request, and adds one tool. First request: "first request ships only `bash` + `str_replace_editor` with the DSH Minimal persona; the first durable tool call restores the full catalog (sticky across compaction)" (README, "Features"). The stock `edit`, `write`, `read` are absent from the first request on a target model. The preset table adds: "`native` anchors nothing: it hides the extension's own tool", which implies the extension registers `str_replace_editor` itself and keeps it visible in the anchor presets (README, "Presets").
2. Tool list at session start: on a target model, the first request shows 2 tools (`bash`, `str_replace_editor`) plus a one-line persona, with a first-turn output cap (`bootstrapMaxTokens`, default 1024). After the first tool call, the full catalog returns. Scoping is per model id: "non-target models are untouched and never see the bootstrap tools" (README, "Features"). The tool "is declared per run, not at session start" (README, "Quick start").
3. Requirements and maintenance: works with both "`anthropic-messages` and `openai-chat` payload formats"; settings live in `~/.pi/agent/settings.json` with trusted project deep-merge; env off-switch `PI_ANCHORED=0` (README). Documented failure modes and honesty signals: "Status: experimental. The measured gain comes from a single private benchmark; it is not a universal performance claim" (README blockquote). Logs are written to `~/.pi/agent/tmp/anchored-loaded.log` and friends (README, "Verifying it works").
4. Risks for a weak model:
   - Edit contract for the first turn becomes Anthropic-style `str_replace_editor`, which also matches exact text for `str_replace`. The weak model trades pi's edit tool for an older, narrower one on turn one. After promotion the model may see two edit tools at once, stock `edit` plus `str_replace_editor`, since the README only promises "full catalog restored". Tool-choice confusion risk after promotion is real and unmeasured.
   - Prompt tokens go DOWN hard on the first request, then return to normal. This is the only candidate that reduces first-request tool tokens.
   - The 1024-token first-turn cap can truncate the first tool call, which delays promotion.
   - Default rule scope is narrow: "`/deepseek.*(flash|pro)/i`" (README, "Configuration"). On a non-DeepSeek weak model the plugin does nothing, so it does not answer the operator's problem in general.

## The five suspected non-tools: confirmed, all NOT edit tools

- pi-anchor: "Cross-session Task & Todo Dock for Pi — persistent belowEditor tree overlay" (/tmp/spike/candidates.json); README calls it "A digital sticky note & cross-session `todo` checkpoint docked below your Pi editor" (/tmp/spike/cand/pi-anchor.html). UI dock, no file tool. Confirmed not an edit tool.
- pi-cc-patch: "Use Claude Pro/Max subscription with pi — bypasses third-party app detection" (candidates.json); "This extension patches the request payload to bypass it… Just a `before_provider_request` hook" (/tmp/spike/cand/pi-cc-patch.html). Request-payload patch, no file tool. Confirmed not an edit tool. Classic misclassified search hit: "patch" in the name, but nothing to do with apply_patch.
- pi-edit-last: "Restore the last user message to the Pi editor using session tree navigation" (candidates.json); "Restore the latest user message on the current Pi session branch to the editor, so you can edit and send it again" (/tmp/spike/cand/pi-edit-last.html). User-message editing UI. Confirmed not an edit tool.
- pi-edit-session-in-place: "pi extension that lets you re-edit or delete an earlier user message in the current session branch" (candidates.json); adds "`/edit-turn` and the `Ctrl+Shift+E` shortcut" (/tmp/spike/cand/pi-edit-session-in-place.html). Session message editing. Confirmed not an edit tool. Bonus: it "Requires Pi `1.0.0` or later and Node.js `>=24.15.0`", so it cannot run on the operator's Node v22.19.0 anyway (same file).
- pi-file: "Create temporary Markdown files from Pi command text and embed them in the input editor" (candidates.json); "`/file` turns command text into temporary Markdown files and prepares them as embedded Pi file context" (/tmp/spike/cand/pi-file.html). Input attachment helper. Confirmed not an edit tool.

# Flow

What a weak agent sees, per install, at session start:

1. Stock pi 1.3.0, no plugin: tools `read`, `edit` (exact `oldText` match per the operator's premise), `write`, `bash`, plus others. The model that fails `oldText` falls back to `write` or bash scripts.
2. Plus pi-multiedit: stock `read`, `edit`, `write` are gone from the list. New `read` returns anchored lines. New `edit` takes an array of scoped edits with one selector each, checks all in memory, writes atomically or reports every failure with nearest context. Bash-script edits stop appearing in the eval data ("pi-multiedit is the only setup with none for every model", README).
3. Plus pi-mono-multi-edit: the list grows by `multi_file_edit` and `apply_patch`. Stock tools unchanged. Overlap invites wrong-tool picks by weak models.
4. Plus pi-edit-first: the list is unchanged. The `write` behavior changes: a `write` over an existing file above 40 lines is blocked with a one-line steer to `edit`. The weak model's fallback path closes.
5. Plus pi-deepseek-v4-anchor, on a DeepSeek flash/pro model: first request shows only `bash` and `str_replace_editor`, output capped at 1024 tokens, one-line persona. First tool call restores the catalog. On other models, nothing changes.

# Sources Read

- /tmp/spike/candidates.json — metadata for all 16 candidates (versions, dates, downloads, deps, peers, licenses).
- /tmp/spike/cand/pi-multiedit.html — full pi.dev page, README, Limits, eval tables, repo link github.com/jkeskikangas/pi-multiedit.
- /tmp/spike/cand/pi-mono-multi-edit.html — full pi.dev page, README, repo link github.com/emanuelcasco/pi-mono-extensions.
- /tmp/spike/cand/pi-edit-first.html — full pi.dev page, README, rules table, security notes, release automation, related plugins.
- /tmp/spike/cand/pi-deepseek-v4-anchor.html — full pi.dev page, README, presets, matching rules, verification, env vars.
- /tmp/spike/cand/pi-anchor.html, pi-cc-patch.html, pi-edit-last.html, pi-edit-session-in-place.html, pi-file.html — README intros for the five suspected non-tools.
- /tmp/spike/all-packages.txt, /tmp/spike/full-pi-*.txt, /tmp/spike/pi-*.txt — inventoried; they cover other-angle packages (hashline, better-edit, edit-guard, edit-file families), not this angle's candidates, so they were not mined in depth.
- Equivalent web URLs for the snapshots: https://pi.dev/packages/pi-multiedit, https://pi.dev/packages/pi-mono-multi-edit, https://pi.dev/packages/pi-edit-first, https://pi.dev/packages/pi-deepseek-v4-anchor, and the five non-tool pages of the same form.

# Boundaries

- READONLY respected: no package installed, pi not run, no file created, changed, or deleted.
- No shell tool exists in this sandbox, only read, grep, find, ls. The planned curl GET fetches to registry.npmjs.org and raw.githubusercontent.com could not run. All web claims come from the pre-extracted pi.dev HTML on disk. Consequences: peer-dependency lists were not expanded from npm metadata; exact source code of pi-edit-first's block message string and pi-deepseek-v4-anchor's post-promotion tool list were not verified.
- The claim in pi-mono-multi-edit's README that pi's native edit "now provides robust same-file batching, uniqueness and overlap validation, Unicode/whitespace normalization" is an author claim about pi core. It was not verified against pi 1.3.0 source here. If true, the operator's premise that stock edit needs a raw exact match is outdated for current pi.
- No model evaluation was run. Weak-model outcomes above are reasoned from documented mechanisms, not from fresh benchmarks.

# Non-Obvious Things

1. pi-multiedit is filed here among "additive" candidates, but it is the most invasive of the four: it removes stock `write` entirely and replaces stock `read` and `edit` under the same names. The name suggests addition. The README states replacement.
2. The operator's premise may be stale. Two independent READMEs describe pi's native edit as already tolerant: pi-mono-multi-edit lists "Unicode/whitespace normalization" in stock edit, and pi-edit-first's own world assumes stock `edit` works well enough to steer agents toward it. The exact-match complaint fits older pi or unnormalized paths, not necessarily pi 1.3.0.
3. pi-edit-first and pi-deepseek-v4-anchor are steering, not editing. Neither improves edit success. pi-edit-first removes a fallback. pi-deepseek-v4-anchor swaps in a different exact-match editor for one turn.
4. The strongest fix for the operator's actual failure mode, exact-text misses, sits inside pi-multiedit: whitespace and curly-quote fallback plus nearest-context error output plus anchors that remove retyping. The cost is a full tool-contract replacement.
5. Disk-state hazards differ sharply: pi-multiedit is atomic per call with read-back verification and documented attribute loss; pi-mono-multi-edit offers best-effort rollback only; pi-edit-first touches no files; pi-deepseek-v4-anchor writes settings and log files under ~/.pi/agent.
6. pi-multiedit conflicts by name with pi-hashline-edit. Both register `read` and `edit`. The README orders removal of the other one. If the operator ever tested hashline-style tools before, check what remains installed.

# Open Questions

1. What are pi-multiedit's 18 peers? Likely optional wildcard pi-core peers, as pi-edit-session-in-place describes for itself. npm metadata fetch needed.
2. After pi-deepseek-v4-anchor promotes, does `str_replace_editor` stay in the catalog beside stock `edit`? The README only says "full catalog restored" and only the `native` preset "hides the extension's own tool". Repo source check needed.
3. Exact text of pi-edit-first's one-line block reason. The README paraphrases it as "use `edit` with targeted replacements". The literal string matters for weak models. Repo source check needed.
4. Is the stock pi 1.3.0 `edit` normalization claim from pi-mono-multi-edit's README true? Verify in pi core source before trusting or discarding the operator's exact-match premise.
5. The task named "five" real candidates but listed four. If a fifth was intended, the name is missing from the task text. The five items in the separate list were all confirmed non-tools.