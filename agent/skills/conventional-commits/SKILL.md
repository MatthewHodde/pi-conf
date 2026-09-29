---
name: conventional-commits
description: "Enforces conventional commit message format (type: description). Use when creating git commits to ensure consistent, parseable commit history."
---

# Conventional Commits

Format:
```
<header>

<body>

<footer>
```

- **Header**: `<type>[optional scope][optional !]: <description>`
- **Blank line** separates header from body
- **Body**: Optional. Default to no body. Max 20 non-blank lines
- **Blank line** separates body from footer
- **Footer**: Optional, references issues or documents breaking changes

## Never Write

These are hard-blocked by the validator:

- Any tool or model attribution: `Claude`, `Anthropic`, `GPT-*`, `Copilot`,
  `Gemini`, `Codex`, `Cursor`, `Ollama`, emoji robots
- `Co-Authored-By:` / `Signed-off-by:` trailers naming a tool or model
- "Generated with/by AI", or any note about who or what wrote the change

The commit describes the code change. It is not a changelog of the assistant that
made it.

## Types

| Type | Use |
|------|-----|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting, no code change |
| `refactor` | Neither fix nor feature |
| `perf` | Performance improvement |
| `test` | Adding/updating tests |
| `build` | Build system or dependencies |
| `ci` | CI configuration |
| `chore` | Other, no src/test change |
| `revert` | Reverts previous commit |

## Rules

- Type required, lowercase
- Colon + space after type: `feat: add feature`
- Description required, lowercase, no trailing period
- Use imperative mood: `add` not `added`, `fix` not `fixes`
- Scope optional in parentheses: `feat(auth): add login`
- Subject max 50 characters
- Body max 72 characters per line, max 20 non-blank lines
- Body explains what/why, not how and not which files changed
- Use bullets in body for multiple changes

## Body: When You Need One At All

Default to subject only. `git log --oneline` is what people read. A body earns
its place only when the diff cannot carry the *why* on its own.

Include a body for:

- Non-obvious rationale (why this approach over the obvious one)
- Behavioral or configuration changes a reader would not expect
- Constraints, tradeoffs, or follow-up debt worth remembering

Skip the body for:

- Straightforward fixes and small features
- Anything already obvious from the diff
- File-by-file inventories: "status-bar.ts: uses setWidget", "AGENTS.md: updated"
- Restating the subject in longer words
- Step-by-step narration of the edit

Shape: **why it is this way**, not **what files were touched**. If the body
would still make sense after deleting every filename in it, keep it; otherwise
cut it. Hard cap is 20 non-blank lines — staying under 5 is the real goal.

## Breaking Changes

Mark breaking changes with `!` before the colon:

```
feat(api)!: remove legacy authentication
```

Document breaking changes in the footer (after blank line):

```
feat(api)!: remove legacy authentication

BREAKING CHANGE: Legacy authentication endpoints have been removed.
Clients must migrate to the v2 API.
```

Footer format: `BREAKING CHANGE: <description>`

## Choosing the Commit Type

When multiple changes are present:

1. Prefer splitting work into separate commits when possible
2. If a single commit is required, choose the type representing the primary user-visible impact
3. Use `feat` for new capabilities
4. Use `fix` for correcting existing behavior
5. Use `refactor` only when behavior remains unchanged
6. Use `chore` only when no more specific type applies

## Validation Checklist

Before committing, verify:

- [ ] Type is valid and lowercase
- [ ] Scope is concise and meaningful (if used)
- [ ] Subject uses imperative mood
- [ ] Subject does not end with punctuation
- [ ] Message accurately describes the change
- [ ] Breaking changes are marked with `!` and/or `BREAKING CHANGE` footer
- [ ] Subject is reasonably short
- [ ] Body, if present, explains why and is under 20 non-blank lines
- [ ] Body is not a file-by-file inventory
- [ ] No tool, model, or assistant attribution anywhere in the message
- [ ] No `Co-Authored-By:` / `Generated with` trailers

## Workflow

When creating a commit:

1. Inspect the changes to understand what changed
2. Identify the primary change type
3. Select appropriate type and scope
4. Write concise commit message
5. Include body only when the *why* is not visible in the diff
6. Include footer for breaking changes or issue references
7. Strip any tool, model, or assistant attribution from the message

When reviewing a commit message:

1. Check syntax and semantics against the rules
2. Identify any problems
3. Provide corrected version if needed
4. Do not rewrite valid messages unnecessarily

## Examples

```
feat: add user authentication
fix(auth): resolve token refresh issue
docs: update API reference
refactor(database): extract connection pool
test(payments): cover declined card responses
ci: run tests on Node.js 22
chore: update dependencies
```

### Breaking change

```
feat!: remove deprecated v1 API

BREAKING CHANGE: Clients must migrate to the v2 API.
```

### Multi-line

```
feat: add CSV and JSON export

Large exports were unreadable uncompressed. gzip keeps them under the
response size limit while staying transparent to clients.
```

### Too verbose (reject this shape)

```
feat(graph): replace pi-graphify with pi-mindplace

Swap @audsiui/pi-graphify for @patimweb/pi-mindplace.
Tree-sitter AST parsing, zero API cost, auto-refresh.

- settings.json: @audsiui/pi-graphify -> @patimweb/pi-mindplace
- Deleted graphify-guard.ts, subagent-graphify-only.ts extensions
- Updated AGENTS.md: graphify -> mindplace references
```

Rewrite as:

```
feat(graph): replace pi-graphify with pi-mindplace

Tree-sitter AST parsing, no API cost, auto-refresh on change.
```

### Never

```
chore: update deps

Co-Authored-By: Claude <noreply@anthropic.com>
```

Blocked. Attribution and generated-by notes do not belong in a commit.
