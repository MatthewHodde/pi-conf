---
name: conventional-commits
description: "Enforces conventional commit message format (type: description). Use when creating git commits to ensure consistent, parseable commit history."
---

# Conventional Commits

Enforces the [Conventional Commits](https://www.conventionalcommits.org/) specification for git commit messages.

## Format

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

## Allowed Types

| Type | When to Use |
|------|-------------|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation only changes |
| `style` | Formatting, missing semi-colons, etc (no code change) |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf` | Performance improvement |
| `test` | Adding or updating tests |
| `build` | Changes to build system or dependencies |
| `ci` | Changes to CI configuration |
| `chore` | Other changes that don't modify src or test |
| `revert` | Reverts a previous commit |

## Rules

1. **Type is required** and must be lowercase
2. **Colon and space** follow the type: `feat: add feature`
3. **Description is required** and must be lowercase
4. **Description must not end with a period**
5. **Scope is optional** and in parentheses: `feat(auth): add login`
6. **Breaking changes** require `!` before the colon: `feat!: remove deprecated API`
7. **Subject line max 50 characters** — keep it concise
8. **Body max 72 characters per line** — wrap at 72 chars
9. **Body explains what and why**, not how
10. **Use bullets in body** for multiple changes — start with `- `
11. **Footer references issues** — `Closes #123`, `Fixes #456`

## Usage

### When Creating Commits

Always format commit messages as:

```bash
git commit -m "feat: add user authentication"
git commit -m "fix: resolve login timeout"
git commit -m "refactor: extract shared utilities"
git commit -m "docs: update API reference"
```

### With Scope

```bash
git commit -m "feat(auth): implement OAuth2 flow"
git commit -m "fix(api): handle null response"
```

### Breaking Changes

```bash
git commit -m "feat!: redesign configuration format"
git commit -m "fix!: change default port to 8080"
```

### Multi-line Commits

```bash
git commit -m "feat: add export functionality

Support CSV and JSON export formats.
Closes #123"
```

**Subject line** (first line):
- Max 50 characters
- Lowercase, no period
- Imperative mood ("add" not "added")

**Body** (after blank line):
- Max 72 characters per line
- Explain **what** and **why**, not **how**
- Wrap long descriptions

**Footer** (after body):
- Reference issues: `Closes #123`, `Fixes #456`
- Reference beads issues: `Closes feat-abc`, `Closes bug-xyz`
- Note breaking changes: `BREAKING CHANGE: description`

### Multi-line with Bullets

```bash
git commit -m "feat: add export functionality

- Support CSV and JSON export formats
- Add compression option for large datasets
- Include column headers by default

Closes #123"
```

### Validation Script

Use the included script to validate commit messages:

```bash
# Validate a commit message
./skills/conventional-commits/scripts/validate-commit.sh "feat: add feature"

# Validate last commit
./skills/conventional-commits/scripts/validate-commit.sh --last

# Validate from stdin
echo "fix: resolve bug" | ./skills/conventional-commits/scripts/validate-commit.sh -
```

## Examples

### Good
- `feat: add user profile page`
- `fix(auth): resolve token refresh issue`
- `docs: update installation guide`
- `refactor: simplify error handling`
- `chore: update dependencies`

### Good (with body)
```
feat(auth): add OAuth2 support

- Implement authorization code flow
- Add token refresh handling
- Store tokens securely in keychain

Closes #456
```

### Good (with beads issue)
```
feat(auth): add OAuth2 support

Implements OAuth2 authorization code flow with
token refresh and secure keychain storage.

Closes feat-abc
```

### Bad
- `Added new feature` (missing type)
- `fix stuff` (missing colon, vague)
- `FIX: Bug fix` (uppercase type)
- `feat: Add feature.` (trailing period)
- `feature: new thing` (invalid type)
