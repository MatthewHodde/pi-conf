# Conventional Commits Specification

## Summary

The Conventional Commits specification is a lightweight convention on top of commit messages. It provides an easy set of rules for creating an explicit commit history.

## Specification

Each commit message consists of a **header**, a **body**, and a **footer**:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Header

The header is mandatory and must conform to the format:

```
<type>[optional scope]: <description>
```

- **type**: Must be one of the allowed types (see below)
- **scope**: Optional, provides contextual information
- **description**: Required, a short summary of the change

### Types

| Type | Description |
|------|-------------|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation only changes |
| `style` | Changes that do not affect the meaning of the code |
| `refactor` | A code change that neither fixes a bug nor adds a feature |
| `perf` | A code change that improves performance |
| `test` | Adding missing tests or correcting existing tests |
| `build` | Changes that affect the build system or external dependencies |
| `ci` | Changes to CI configuration files and scripts |
| `chore` | Other changes that don't modify src or test files |
| `revert` | Reverts a previous commit |

### Scope

The scope provides contextual information about the changes. It is optional and must be enclosed in parentheses:

```
feat(auth): add OAuth2 authentication
fix(api): handle null responses
```

### Description

The description contains a concise description of the change:

- Use the imperative, present tense: "change" not "changed" nor "changes"
- Don't capitalize the first letter
- No period at the end

### Breaking Changes

Breaking changes must be indicated by adding `!` before the colon, or by adding a `BREAKING CHANGE:` footer:

```
feat!: remove support for Node 14

feat: add new API endpoint

BREAKING CHANGE: minimum Node version is now 16
```

### Body

The body is optional and should provide additional context about the change:

```
feat: add user profile page

Support displaying user avatars, bios, and activity history.
Implements the new profile API endpoints.
```

### Footer

The footer is optional and should reference issues or pull requests:

```
fix: resolve login timeout

The issue was caused by a missing timeout handler in the auth module.

Closes #123
Fixes #456
```

## Examples

### Feature
```
feat: add dark mode support

Closes #789
```

### Bug Fix
```
fix(auth): prevent token expiration race condition

The previous implementation could cause multiple refresh requests
to be sent simultaneously when the token expired.

Fixes #321
```

### Breaking Change
```
feat!: redesign configuration format

The new format uses YAML instead of JSON for better readability.

Migration guide: docs/migration-v2.md
```

### Documentation
```
docs: update API reference for v2 endpoints
```

### Refactor
```
refactor(auth): extract token management into separate module

Improves testability and separation of concerns.
```

## Tools

- [commitlint](https://commitlint.js.org/) - Lint commit messages
- [husky](https://typicode.github.io/husky/) - Git hooks made easy
- [semantic-release](https://semantic-release.gitbook.io/) - Fully automated version publishing
