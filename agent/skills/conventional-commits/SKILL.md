---
name: conventional-commits
description: "Enforces conventional commit message format (type: description). Use when creating git commits to ensure consistent, parseable commit history."
---

# Conventional Commits

Format: `<type>[optional scope]: <description>`

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
- Scope optional in parentheses: `feat(auth): add login`
- Breaking changes: `!` before colon: `feat!: remove deprecated API`
- Subject max 50 characters
- Body max 72 characters per line
- Body explains what/why, not how
- Footer references issues: `Closes #123`

## Examples

```
feat: add user authentication
fix(auth): resolve token refresh issue
docs: update API reference
feat!: redesign configuration format
```

### Multi-line

```
feat: add export functionality

- Support CSV and JSON export formats
- Add compression option for large datasets

Closes #123
```
