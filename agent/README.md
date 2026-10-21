# Pi Agent Configuration

Custom extensions, skills, and patches for the Pi coding agent.

## Layout

```
~/.pi/agent/               # pi home and git repo root
├── extensions/            # Custom .ts extensions + patch apply/regen scripts
│   ├── apply-all-patches.sh  # apply all patches (run after pi install/update)
│   ├── regen-patch.sh        # rebuild a patch from pristine sources
│   └── patches/           # .patch files for npm packages
├── skills/                # Custom skill definitions
├── themes/                # light-distinct / dark-distinct themes
├── prompts/               # Prompt template entry points
├── bin/                   # scan-secrets scanner (gitleaks comes from PATH, never vendored)
├── npm/                   # Installed npm packages (gitignored)
├── cache/                 # Persisted per-extension state (gitignored)
├── sessions/              # Session state (gitignored)
├── settings.json          # Main pi config
├── mcp.json               # MCP servers (deepwiki, backlog)
├── models.json            # Custom model providers
├── web-search.json        # Web search provider choice
├── keybindings.json       # Key bindings
└── trust.json             # Trusted project paths (gitignored, per machine)
```

## What travels in git

This directory is one git repo. Tracked files are the config you share between
machines. Ignored files are secrets or per-machine state.

Tracked:

- config files: `settings.json`, `mcp.json`, `models.json`, `web-search.json`,
  `keybindings.json`
- `extensions/`, including `patches/` and the apply and regen scripts
- `skills/`, `themes/`, `prompts/`
- `bin/tuicr` (the shim only) and `bin/scan-secrets` with its config and test

Ignored on purpose:

- credentials: `auth.json`, `mcp-auth.json`, `models-store.json`
- `trust.json` (trusted paths differ per machine)
- `bin/gitleaks` (never vendored; the scanner resolves gitleaks from `PATH`, so
  the ignore entry only guards against a stray dropped copy)
- `npm/` (node_modules, package.json, package-lock.json) and `git/` (cloned repos)
- runtime state: `sessions/`, `cache/`, `tmp/`, `missions/`, `sandbox-state/`,
  `run-history.jsonl`, `mcp.log*`
- `graph-out/` and `graphify-out/` (regenerable code graphs)
- the live `backlog/` tree

The whole `backlog/` tree is ignored. Six tasks, `backlog/tasks/pi-001` through
`pi-006`, were committed before `/backlog` was added to `.gitignore` and stayed
tracked by accident. They were untracked on 2026-10-20 with `git rm --cached`, so
they stay on disk but no longer travel. Live task history does not belong in a
config repo, since task churn would ride along in every push. Clone a backlog from
the server that hosts it, not from here.

### Absolute paths in tracked files

Swept 2026-10-20 with `git ls-files | xargs grep` for `/home/`, `~/`,
`/Users/`, and `/var/folders/`. Everything found falls into three groups, none
of which breaks on a machine with a different home directory.

- Runtime code reads `process.env.HOME` and only falls back to a literal when
  `HOME` is unset. `extensions/instance-widget.ts` and
  `extensions/smolvm-notify.ts` both use `process.env.HOME || "/home/ubuntu"`.
  The literal is a last-resort sandbox default, never the primary source.
- Docs and usage examples use the tilde form, `~/.pi/...`, which expands per
  machine. This covers the `extensions/` scripts (`abort.ts`, `disk-pressure.ts`,
  `smolvm-aware.ts`, `apply-all-patches.sh`, `regen-patch.sh`), the `tuicr`
  wrappers, and the `prompts/` templates.
- `bin/HANDOFF.md` and `extensions/HANDOFF.md` name `/home/matthew/...` and
  `/home/ubuntu/...` as literal historical paths. Those are narrative records of
  where a change was made, not path resolution, so they stay as written.

No tracked file resolves a config path from a hardcoded home directory. If a new
extension needs one, read `HOME` and keep any literal as a fallback only.

## Set up a fresh machine

Prerequisites are Node 26 or newer (`@patimweb/pi-mindplace` requires
`>=26.0.0`), git, jq, and bash. Optionally install mise, tmux or Zellij, and the
backlog.md CLI.

1. Clone the repo to `~/.pi`. pi reads its config from `~/.pi`, so the path
   matters.

	```bash
	git clone <private-server-url> ~/.pi
	```

2. Install pi.

	```bash
	npm install -g @earendil-works/pi-coding-agent
	# or: mise install npm:@earendil-works/pi-coding-agent
	```

3. Install every npm package listed in `settings.json`. Run one `pi install` per
   entry.

	```bash
	cd ~/.pi
	node -e 'require("./agent/settings.json").packages.forEach(p => console.log("pi install " + p))' | bash
	```

	This populates `npm/node_modules/` and writes a fresh `package-lock.json`.

4. Apply the tracked patches. A reinstall wipes patched files, so run this after
   every `pi install` or `pi update`.

	```bash
	bash ~/.pi/agent/extensions/apply-all-patches.sh --check   # dry run
	bash ~/.pi/agent/extensions/apply-all-patches.sh           # apply
	```

	A CONFLICT means a package version moved past the patch pin. Re-apply the
	intent by hand, then rebuild the patch with `regen-patch.sh` (see Patches).

5. Create `auth.json` by hand. It is gitignored and never travels. The
   `opencode-go` and `llama-cpp` entries carry `type` (`api_key`) and `key`. The
   `llama.cpp` entry also carries `env.LLAMA_BASE_URL`, which must match the
   network this machine sits on.

6. Install gitleaks so it resolves on `PATH`, and make sure jq is there too. The
   scanner deliberately keeps no vendored copy and reads no override variable, so
   `mise install aqua:gitleaks/gitleaks` or your package manager is the fix. Until
   both resolve, `scan-secrets` exits 127 and `conventional-commits.ts` fails
   closed, which blocks every pi-mediated commit.

7. Install the backlog.md CLI on PATH so the `backlog` MCP server in `mcp.json`
   works. Install tuicr with `mise install github:agavra/tuicr`, or put
   `tuicr.real` next to the `bin/tuicr` shim, or set `TUICR_BIN`. The shim exits
   127 with these same instructions.

8. Let `trust.json` rebuild from trust prompts. Paths from another machine, for
   example `/home/matthew/...`, never match on a different home directory.

9. Optional pieces. `graph-out/` regenerates from the mindplace build.
   `models.json` ships no providers; add this machine's providers if needed. If
   theme verification fails, the schema path in `themes/verify-themes.mjs` is
   machine-specific, so override it with `PI_THEME_SCHEMA`.

---

## Extensions

### Custom (TypeScript)

#### instance-widget.ts

Owns the line above the prompt: the task this instance is running, then the
worktree path and branch in git-wt repos. No task running here, no task line.

- One widget key (`instance`), one owner. pi orders widgets by `setWidget` call
  order and a re-set moves a key to the end, so two extensions refreshing on
  different triggers swap lines mid-session
- The task line is the one this pane claimed with a successful backlog
  `In Progress` change, parsed by the same `changeFor`/`nextTitle` helpers the
  terminal title uses, so several running tasks never make it guess
- The claim is stored in `$SMOLVM_SIGNAL_PATH/task`, beside `state` and `tmux-*`,
  so a restarted pane picks its own task back up and host notification scripts
  can read the ticket from the folder they already watch
- `backlog-title.ts` reads the same file at session start and puts the ticket
  back in the terminal title, after pi finishes rewriting titles during startup.
  The shared parsing lives in `extensions/lib/claim.ts`, which directory
  discovery skips because it has no `index.ts`
- Read from backlog tool results (MCP and CLI), after the result rather than on
  `tool_call`, which can read the task file before the command finishes writing it
- Follows the worktree the agent `cd`s into, and in git-wt sessions injects the
  mechanical layout guidance into the system prompt at agent start
- The widget is a component, so `render(width)` clamps each line to the width pi
  gives it: a long task title ends in a dim ellipsis instead of wrapping
- Contract test: `node agent/extensions/tests/test-instance-widget.mjs`

#### smolvm-aware.ts

Detects smolvm sandbox environment and adapts behavior.

- Detects via `SMOLVM=1` env var
- Scans available tools (git, curl, node, python3, etc.)
- Injects sandbox context into system prompt
- Notes that nested VM and container tests are allowed (operator-opened sessions)
- Blocks `git push` (only host can push) via tool-level regex + prompt instruction
- Shows tool availability notification on session start

#### smolvm-notify.ts

Writes agent state to the pi config mount for the host-side notification daemon.
Path: `SMOLVM_SIGNAL_PATH` when set, else `$HOME/.pi/agent/sandbox-state/default`.

- States: `idle`, `working`, `blocked`
- Events: `session_start`, `agent_start`, `agent_settled`, `ui_prompt_start`, `ui_prompt_end`, `session_shutdown`

#### disk-pressure.ts

Monitors disk usage in smolvm sandboxes.

- Warns at 80% usage, critical at 90%
- Registers `disk_usage` tool for agent
- Checks after heavy commands (npm install, cargo build, make, etc.)
- Checks at session start

#### conventional-commits.ts

Enforces the conventional commit format on `git commit`.

- Blocks subjects over 50 chars, bodies over 20 lines, and tool/model attribution
- Subject-rule blocks hand back a copyable corrected subject; body and scan blocks state the fix instead
- Runs `bin/scan-secrets` first and fails closed when the scanner errors
- Latches on any non-zero `git commit` and blocks other git commands until `git log -1 --oneline` shows whether it landed
- `/commit-unlock` clears the latch in place without a restart
- `agent/commit-latch.json` with `{"enabled": false}` disables the latch; a missing file keeps it on
- Blocks `git commit` carrying `--no-verify` or `-n`: the reason tells the agent to fix what the hook reports instead of bypassing
- While the latch is set, blocks any command referencing `.git/hooks` — the hooks belong to the failed commit; `log/status/diff/add/commit` recovery still passes
- `agent/commit-policy.json` with `{"allowNoVerify": true}` permits `--no-verify`; a missing file keeps the block on (the hook-access rule is governed by the `commit-latch.json` switch)
- Verifier fixtures (green/red proof for the bypass and hook-file checks): `node agent/extensions/tests/host-07005/verify-fixtures.mjs`
- Contract test: `node agent/extensions/tests/test-conventional-commits.mts`
- Host test against a real local model: `bash agent/extensions/tests/host-07002/run.sh`
- Host test for the failed-commit latch: `bash agent/extensions/tests/host-07005/run.sh`

### npm Packages

| Package | Description |
|---------|-------------|
| `@0xkahi/pi-vim-keys` | Vim keybindings with normal mode, leader keys |
| `@whamp/pi-pstack` | Poteto-mode skills and playbooks, pstack session commands, `ask_user_question` |
| `pi-web-search` | Provider-native `web_search` (keyless) |
| `@patimweb/pi-mindplace` | Code knowledge graph (`mindplace_query`/`build`/`explain`) |
| `pi-subagents` | Delegation and scripted multi-agent workflows |
| `@ff-labs/pi-fff` | Fuzzy file and content search tools (`fffind`, `ffgrep`) |

### Web search & research

- `web_search` is the workhorse: keyless, provider picked in `web-search.json`
  (falls back to the conversation model when unset).
- `url_context` ships with pi-web-search but is **Gemini-only**: it needs a Google
  API key and a Gemini-compatible model. This setup has no Gemini credentials
  (providers: opencode-go/llama.cpp), so the extension auto-suppresses the
  tool from the active list on every model change — the model never sees it, and a
  direct call returns "requires a Google Gemini-compatible model". Harmless dead
  weight; do not document it as available capability.
- `fetch_content` / `get_search_content` were removed with the web-retrieval
  extension (PI-033, 2026-09-30, subagent cleanup). `web_search` returns results,
  not full page bodies — that tradeoff was accepted deliberately.
- For GitHub repos prefer the deepwiki MCP tools (free, no key) before web search.
- MCP servers are configured natively by pi 1.0 in `agent/mcp.json` (`deepwiki`,
  `backlog`) — no MCP plugin; an extension registering `/mcp` would replace the
  built-in support. Validate with `pi mcp list`, inspect with `/mcp` in-session.

---

## Keymaps

`<leader>` = space in normal mode.

| Keymap | Description | Source | Stock Default |
|--------|-------------|--------|---------------|
| `escape` | Enter normal mode | pi-vim-keys | — |
| `<leader>oe` | Open external editor | pi-vim-keys | `ctrl+g` |
| `<leader>p` | Paste image | pi-vim-keys | `ctrl+v` |
| `<leader>l` | Resume session | pi-vim-keys | *(none)* |
| `<leader>g` | Open session tree | pi-vim-keys | *(none)* |
| `escape`, `alt+escape` | Interrupt the running operation | keybindings.json | `escape` |
| `ctrl+c` | Clear editor | stock | — |
| `ctrl+z` | Suspend to background | stock | — |
| `ctrl+p` | Toggle path display | stock | — |
| `ctrl+s` | Toggle sort mode | stock | — |
| `ctrl+n` | Named sessions filter | stock | — |
| `ctrl+r` | Rename session | stock | — |
| `ctrl+t` | Toggle thinking blocks | stock | — |
| `shift+tab` | Cycle thinking level | stock | — |
| `ctrl+o` | Expand tool output | stock | — |
| `ctrl+x` | Copy message | stock | — |
| `alt+enter` | Queue follow-up | stock | — |
| `alt+up` | Restore queued messages | stock | — |

The tracked `keybindings.json` maps only the interrupt keys. Everything else in
the table comes from pi defaults or from pi-vim-keys.

---

## Skills

| Skill | Purpose |
|-------|---------|
| `ask-user` | Structured decision handshake before high-stakes choices |
| `conventional-commits` | Enforce `type(scope): description` format |
| `tuicr` | Run tuicr review sessions in cmux, tmux, Zellij, or Herdr |

Skills shipped by npm packages load on their own from `agent/npm`.
`@whamp/pi-pstack` carries the review and workflow skills (code-review,
poteto-mode, and the engineering principles). `pi-subagents` carries the
delegation guides.

---

## Patches

### Apply script

```bash
# Apply all patches in extensions/patches/ to npm packages
bash ~/.pi/agent/extensions/apply-all-patches.sh

# Dry-run (check status only)
bash ~/.pi/agent/extensions/apply-all-patches.sh --check
```

Re-run after `pi install` or `pi update`.

Naming: `<owner>+<pkg>+<version>+<desc>.patch` — version pins tell you which
install the patch was built against; a version bump means CONFLICT until regenerated.

### Regenerating a patch

A patch diffs **pristine package file (registry tarball) → live modified copy** in
`~/.pi/agent/npm/`. After an upgrade overwrites the modification:

```bash
bash ~/.pi/agent/extensions/apply-all-patches.sh --check   # 1. see CONFLICT / FAILED
#                                      2. re-apply the patch's intent by hand
bash ~/.pi/agent/extensions/regen-patch.sh <patch-file>    # 3. rebuild + verify
bash ~/.pi/agent/extensions/apply-all-patches.sh --check   # 4. ALREADY applied
```

`regen-patch.sh` downloads the tarball pinned in `package-lock.json` and checks its
sha512 against the lockfile `integrity` field — the pristine side is always real registry
bytes, so a wrong or inverted input can't produce a backwards patch. It rewrites the
patch only after proving pristine + patch == live. `package-lock.json` targets have no
tarball — npm rewrites the entry on install, so the lock patch applies on its own.

### Current patches

All patches live in `extensions/patches/` and are applied by the script above.
Dry-run status should read `ALREADY applied` for every entry.

#### @0xkahi/pi-vim-keys 1.1.2 escape-abort

**File:** `extensions/patches/0xkahi+pi-vim-keys+1.1.2+escape-abort.patch`

Checks app action keybindings (e.g. alt+escape → `app.interrupt`) before the vim
modal layer swallows the key.

### Removed patches

- `jonjonrankin+pi-caveman` 1.0.10 — package uninstalled 2026-10-21 (PI-076),
  so the patch target `node_modules/pi-caveman/extensions/caveman.ts` is gone.
  Static status-bar label instead of the animated frames; the label dies with
  the package.
- `@whamp/pi-pstack` 0.9.1 typebox peer patches. The two patch files no longer
  exist in `extensions/patches/`, and current installs resolve pi-pstack 0.10.1.
  Dropped from this list on 2026-10-19 (PI-069) because the files are gone.
- `0xkobold+pi-web` — package uninstalled (stale since PI-028).
- `pi-ollama+0.1.7` — the host-config change it carried (read
  `~/.pi/agent/cache/pi-ollama-config.json`, resolution order `OLLAMA_HOST` env →
  persisted `baseUrl` → `localhost:11434`) is **native in pi-ollama 0.2.0**
  (`src/config.ts`); the patch conflicted against the newer version and was deleted
  2026-09-30. Nothing to re-apply after `pi update`.
- `pi-superpowers-plus` — was listed in this README but its patch file never existed
  in `extensions/patches/`; entry removed.

---

## Configuration

### settings.json

Key fields:

| Field | Value | Notes |
|-------|-------|-------|
| `defaultProvider` | `opencode-go` | |
| `defaultModel` | `mimo-v2.5` | |
| `theme` | `light-distinct/dark-distinct` | Auto-switches, Flexoki user panels |
| `packages` | See above | npm packages to load |
| `extensions` | empty | No manual entries; pi discovers `agent/extensions/` |

### models.json

The tracked file holds no providers (`{"providers": {}}`). Providers are per
machine. The `llama.cpp` endpoint used here is defined in the gitignored
`auth.json` through `env.LLAMA_BASE_URL`.

### keybindings.json

```json
{ "app.interrupt": ["escape", "alt+escape"] }
```

### trust.json

Projects with auto-trusted tool execution. `trust.json` is gitignored and per
machine. It rebuilds from trust prompts, and absolute paths from another machine
never match.

---

## Troubleshooting

### smolvm not detected

1. Ensure `SMOLVM=1` env var is set
2. Check extension is loaded in pi config

### Disk pressure warnings

1. Run `disk_usage` tool to check current state
2. Clean build artifacts (`node_modules`, `target`, etc.)
3. The extension warns at 80%, critical at 90%

### Patches not applying

1. Run `bash ~/.pi/agent/extensions/apply-all-patches.sh --check` to see status
2. If CONFLICT, package was updated — re-apply the intent by hand, then
   `bash ~/.pi/agent/extensions/regen-patch.sh <patch-file>` to rebuild it
3. Re-run without `--check` to apply
