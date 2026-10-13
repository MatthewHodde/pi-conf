# Pi Agent Configuration

Custom extensions, skills, and patches for the Pi coding agent.

## Layout

```
~/.pi/agent/
├── extensions/          # Custom .ts extensions + patch apply/regen scripts
│   ├── apply-all-patches.sh  # apply all patches (run after pi install/update)
│   ├── regen-patch.sh        # rebuild a patch from pristine sources
│   └── patches/         # .patch files for npm packages
├── skills/              # Custom skill definitions
├── npm/                 # Installed npm packages
│   └── node_modules/
├── cache/               # Persisted per-extension state
├── sessions/            # Session state
├── settings.json        # Main pi config
├── models.json          # Custom model providers
├── keybindings.json     # Key bindings
├── caveman.json         # Caveman mode settings
└── trust.json           # Trusted project paths
```

---

## Extensions

### Custom (TypeScript)

#### smolvm-aware.ts

Detects smolvm sandbox environment and adapts behavior.

- Detects via `SMOLVM=1` env var
- Scans available tools (git, curl, node, python3, etc.)
- Injects sandbox context into system prompt
- Blocks nested VM/container commands (docker, kvm, vagrant, etc.)
- Blocks `git push` (only host can push) via tool-level regex + prompt instruction
- Shows tool availability notification on session start

#### smolvm-notify.ts

Writes agent state to `/tmp/smolvm/state` for host-side notification daemon.

- States: `idle`, `working`, `blocked`
- Events: `session_start`, `agent_start`, `agent_settled`, `ui_prompt_start`, `ui_prompt_end`, `session_shutdown`

#### disk-pressure.ts

Monitors disk usage in smolvm sandboxes.

- Warns at 80% usage, critical at 90%
- Registers `disk_usage` tool for agent
- Checks after heavy commands (npm install, cargo build, make, etc.)
- Checks at session start

### npm Packages

| Package | Description |
|---------|-------------|
| `@0xkahi/pi-vim-keys` | Vim keybindings with normal mode, leader keys |
| `pi-ask-user` | Interactive user prompts with structured options |
| `pi-caveman` | Caveman mode ( terse responses ) |
| `pi-web-search` | Provider-native `web_search` (keyless) |
| `@patimweb/pi-mindplace` | Code knowledge graph (`mindplace_query`/`build`/`explain`) |
| `agent-ste` | ASD-STE100 prose gate (writes, commit messages, replies) |

### Prose gate (agent-ste)

`agent-ste` checks every `write`, `edit`, `git commit -m` and reply against
ASD-STE100. A hard fault blocks the tool call with the line, the column and the
replacement word. A soft fault warns in the status bar. The reply layer notes
faults and never blocks. `/ste` toggles it and `/ste strict` sends every reply
through the `say` tool.

Rule severities live in `.ste.json` at the repo root. The file names all twelve
rules at their package defaults. A global file would sit at
`$XDG_CONFIG_HOME/ste/config.json`. That path does not survive a smolvm restart,
so this repo carries the only config. The project file wins for each rule it
names.

`conventional-commits.ts` stays the format gate for type, length and AI
attribution. `agent-ste` is the prose gate. Both watch `git commit` and both can
block.

Contract tests: `node agent/extensions/tests/test-agent-ste.mjs` and
`node agent/extensions/tests/test-conventional-commits.mts`.

### Interaction with caveman

Both extensions append to the system prompt through `before_agent_start`. Pi
chains handler results, so both blocks survive and the load order does not
matter. The status bar uses separate keys, `caveman` and `ste`, so the two
indicators coexist.

Caveman changes output tokens only. It never touches a tool call, so it cannot
weaken the agent-ste gates. Caveman example lines lint clean. Its bans on hedges
and marketing words point the same way as the soft rules.

The one friction is `style/contraction`, which reads hard. A reply with a
contraction gets a ste-violation note. A write or a commit with a contraction
blocks. Set the rule to `soft` in `.ste.json` if the notes chatter.

Agent-ste never blocks a reply in normal mode. `/ste strict` sends replies
through the `say` tool, where a hard fault blocks the call. Caveman text passes
through the same gate.

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
| `alt+escape` | Interrupt operation | pi-vim-keys | `escape` |
| `ctrl+q` | Exit pi | keybindings.json | `ctrl+d` |
| `alt+d` | Delete session | keybindings.json | `ctrl+d` |
| `alt+m` | Open model picker | keybindings.json | `ctrl+l` |
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



---

## Skills

| Skill | Purpose |
|-------|---------|
| `coding` | Red-green-refactor TDD discipline |
| `dig` | Cross-domain root-cause diagnosis |
| `shaping` | Turn unformed intent into actionable specs |
| `snapshot` | Task-state snapshots for session handoff |
| `conventional-commits` | Enforce `type(scope): description` format |
| `pi-extension-security-review` | Security review of third-party pi packages |

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

#### pi-caveman v1.0.8

**File:** `extensions/patches/jonjonrankin+pi-caveman+1.0.8.patch`

Status-bar label for the active caveman level.

#### @whamp/pi-pstack 0.9.1 typebox → peerDependencies

**Files:** `extensions/patches/whamp+pi-pstack+0.9.1+typebox-peer.patch`
(manifest) and `extensions/patches/whamp+pi-pstack+0.9.1+typebox-peer-lock.patch`
(`package-lock.json`). Split per file so a lock-only conflict can't block the manifest fix.

Silences the extension-loader warning `Host-provided extension packages must be
declared in peerDependencies with a "*" range, not dependencies: typebox.` — pi
bundles typebox (1.3.27) and aliases it into extensions; the pinned `dependencies`
entry hoisted a second copy (1.3.7). Manifest change alone clears the warning (it
reads only `dependencies`); the lock change keeps `npm ls` consistent.

### Removed patches

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
| `cavemanMode` | via `caveman.json` | `defaultLevel: "lite"` |
| `packages` | See above | npm packages to load |
| `extensions` | `vim-keys-patches.ts` | Custom extension loading |

### models.json

Custom providers:

| Provider | Base URL | API |
|----------|----------|-----|
| `llama.cpp` | `http://10.200.0.50:8080/v1` | openai-completions |

### keybindings.json

```json
{ "app.exit": "ctrl+q" }
```

### trust.json

Projects with auto-trusted tool execution.

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
