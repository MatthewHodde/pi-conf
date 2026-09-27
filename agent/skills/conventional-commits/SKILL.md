---
name: conventional-commits
description: "Enforces conventional commit message format (type: description). Use when creating git commits to ensure consistent, parseable commit history."
---

# Conventional Commits

Format: `<type>[optional scope][optional !]: <description>`

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
- Body max 72 characters per line
- Body explains what/why, not how
- Use bullets in body for multiple changes

## Breaking Changes

Mark breaking changes with `!` before the colon:

```
feat(api)!: remove legacy authentication
```

Document breaking changes in the footer:

```
feat(api)!: remove legacy authentication

BREAKING CHANGE: Legacy authentication endpoints have been removed.
Clients must migrate to the v2 API.
```

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

## Workflow

When creating a commit:

1. Inspect the changes to understand what changed
2. Identify the primary change type
3. Select appropriate type and scope
4. Write concise commit message
5. Include body only when additional context is valuable
6. Include footer for breaking changes or issue references

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
feat: add export functionality

- Support CSV and JSON export formats
- Add compression option for large datasets

Closes #123
```
