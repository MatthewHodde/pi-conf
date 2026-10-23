---
name: tuicr
description: Read and answer code review comments in tuicr review sessions through the tuicr review CLI. Use when the user reviews a patch in tuicr or asks the agent to answer a review comment.
---

# tuicr Review Comments

The pi-tuicr package opens the tuicr review pane inside pi. The human writes comments in that pane. This skill teaches the agent CLI flow: find the session, read the comments, and answer them.

## Pick the workflow

1. **User-led review.** The human reviews the agent patch and writes comments. Read the comments when the user says they are ready. Do not add comments unless the user asks for an answer. Never write text as the user.
2. **Agent answers.** The user asks the agent to respond to a specific comment. Add an answer with `tuicr review add`, an explicit `--username`, and the answered comment id in the text.

If the intent is unclear, ask the user.

## Find the session

```bash
tuicr review list --all
```

Each row carries `slug`, `path`, `comment_count`, `file_count`, and `active`. Use these rules:

- Prefer `path`, a session JSON file. A path needs no `--repo`.
- Use `slug` with `--repo <checkout>` when the path is not reachable.
- Ask the user when several sessions are `active` or the right one is unclear. A wrong choice stores the answer in the wrong session and still exits 0.

## Read comments

```bash
tuicr review comments --session <path-or-slug>
```

The command prints a JSON array. Each comment carries these fields:

| Field | Meaning |
|---|---|
| `id` | Comment id. Quote it in your answer. |
| `location` | Target as `path:line`. |
| `path`, `start_line`, `end_line`, `side` | Target file and lines. `side` is `old` or `new`. |
| `comment_type` | `issue`, `suggestion`, `note`, `praise`, or `none`. |
| `author` | Name of the comment author. |
| `lifecycle_state` | Storage state, for example `local_draft`. |
| `created_at` | Write time in RFC 3339 format. |
| `content` | Comment text. |

Treat the types by weight: `issue` first, then `suggestion`, then `note`. `praise` needs no action.

## Answer a comment

tuicr stores no parent or reply field. An answer is a new comment at the same file, line, and side that quotes the answered `id` in the text.

```bash
tuicr review add --session <path> \
  --target-file src/main.rs --line 42 --side new \
  --type note --username "pi" \
  "Re: <comment-id> <answer text>"
```

Follow these rules:

- Match the file, line, and side of the comment you answer.
- Pass `--username` so the user sees your identity and not theirs.
- Omit `--target-file` for a review-level answer.
- The target file must exist in the session file map. `add` fails otherwise.

## Verify your answer

`add` writes to the canonical store and not to the session file you pass in. A foreign path reads stale data after the write. Re-read the canonical location:

```bash
tuicr review list --all        # read the fresh `path` row
tuicr review comments --session <canonical-path>
```

Check that your new comment exists and `author` matches your `--username`. Check that the stored line lies inside the diff on the side you gave. A line outside the diff stores and exits 0 but never renders in the pane.

## Data directory

Sessions live in the tuicr data directory: `$XDG_DATA_HOME/tuicr/reviews/`, or `~/.local/share/tuicr/reviews/` when the variable is unset. `index.json` maps slugs to files. Sessions live in `sessions/<16-hex>.json`. Set `XDG_DATA_HOME` before you run the CLI when the store sits in another root.
