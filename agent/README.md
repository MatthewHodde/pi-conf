# Pi Agent Configuration

Custom extensions, skills, and patches for the Pi coding agent.

## Layout

```
~/.pi/agent/
├── extensions/          # Custom .ts extensions + patch apply script
│   └── patches/         # .patch files for npm packages
├── skills/              # Custom skill definitions
├── npm/                 # Installed npm packages
│   ├── node_modules/
│   └── patches/         # .patch files for @0xkobold/pi-web
├── cache/               # Persisted config (e.g. pi-ollama-config.json)
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
- Shows tool availability notification on session start

#### smolvm-notify.ts

Writes agent state to `/tmp/smolvm/state` for host-side notification daemon.

- States: `idle`, `working`, `need-input`
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
| `pi-ollama` | Ollama LLM provider integration |
| `pi-caveman` | Caveman mode ( terse responses ) |
| `@0xkobold/pi-web` | Web search and fetch tools |

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

### Current patches

#### pi-superpowers-plus v0.4.1

**File:** `extensions/patches/pi-superpowers-plus+0.4.1.patch`

Adds `/phase-complete` command to workflow-monitor. Marks current phase complete and triggers transition prompt.

#### @0xkobold/pi-web v0.2.0

**File:** `npm/patches/0xkobold+pi-web+0.2.0.patch`

Guards L3 Playwright rendering behind `use_playwright` flag. Without this, cascade always attempts `playwrightFetch()` even when `usePlaywright=false`, causing failed imports on environments without a browser (e.g. smolvm sandbox).

### Manual patches

#### pi-ollama host config

**Doc:** `extensions/pi-ollama-host-patch.md`

Makes `pi-ollama` read Ollama server URL from `~/.pi/agent/cache/pi-ollama-config.json` instead of only `OLLAMA_HOST` env var. Must be re-applied after `pi install npm:pi-ollama` or `pi update`.

**Resolution order:** `OLLAMA_HOST` env → persisted `baseUrl` → `localhost:11434`

---

## Configuration

### settings.json

Key fields:

| Field | Value | Notes |
|-------|-------|-------|
| `defaultProvider` | `opencode-go` | |
| `defaultModel` | `mimo-v2.5` | |
| `theme` | `light/dark` | Auto-switches |
| `cavemanMode` | via `caveman.json` | `defaultLevel: "lite"` |
| `packages` | See above | npm packages to load |
| `extensions` | `vim-keys-patches.ts` | Custom extension loading |

### models.json

Custom providers:

| Provider | Base URL | API |
|----------|----------|-----|
| `llama-cpp` | `http://10.200.0.50:8080/v1` | openai-completions |
| `ollama` | `http://10.200.0.50:11434/v1` | openai-completions |

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
2. If CONFLICT, check if package was updated and patch needs refresh
3. Re-run without `--check` to apply
