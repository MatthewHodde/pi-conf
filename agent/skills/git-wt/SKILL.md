---
name: git-wt
description: Use the `git-wt` CLI to manage Git worktrees in the bare repository layout. Load when a task mentions `git wt`, `git-wt`, creating/removing/switching worktrees, or when the repository has a `.bare` directory with a `.git` file pointing to it.
---

# git-wt

Use this skill when the user asks to manage Git worktrees with `git-wt` or when
a repository uses the bare worktree layout: Git data lives in `.bare`, `.git` is
a file pointing at `./.bare`, and branch worktrees are sibling directories.

## Detecting `git-wt` repositories

- From any directory in the repo, run:

  ```shell
  git rev-parse --git-common-dir
  ```

  If the result ends in `.bare`, treat the repo as a `git-wt` bare worktree
  layout.

- If you are at a repository root, a `.git` file containing `gitdir: ./.bare`
  and a `.bare` directory are also strong signals.
- If uncertain, run:

  ```shell
  git wt doctor
  ```

## Operating rules for agents

- Prefer `git wt` (or `git-wt`) over raw `git worktree` commands in a `git-wt`
  layout so path resolution, branch cleanup, and safety prompts stay consistent.
- mindplace (PI-013): git-wt (.bare style) repos work fine for mindplace — the graph
  tools read the repo directly from the worktree.
- **Exception — worktree creation.** Use raw `git worktree add`, not `git wt add`.
  `git wt add` always fetches from the remote first and has no `--no-fetch` escape
  hatch, so it hard-fails in any environment without a working `ssh` binary or with
  an unreachable `origin`. Prefer:

  ```shell
  git --git-dir=.bare worktree add -b "$BRANCH" "$BRANCH" main
  ```

  The directory name must equal the branch name; that is what keeps the git-wt
  layout intact. `git wt list` still works afterward and shows the new worktree.
  `git wt update` also fetches unconditionally — fall back to plain `git fetch` /
  `git pull` when the network path is broken.

  Plain (non-bare) layout — sibling directory of the repo root, never inside it:

  ```shell
  git worktree add -b "$BRANCH" "$ROOT/../$BRANCH" "$BASE"
  ```

  State the branch name before creating anything. If `$BRANCH` already exists as a
  branch but has no worktree, stop and report. If a worktree already exists for this
  branch, reuse it only after verifying it is the right tree: `git worktree list
  --porcelain` must show that exact branch path, its `HEAD` must be on the branch,
  and it must be on the correct base. Any mismatch means stop and report it. Never
  guess, never write into a worktree you have not confirmed.
- Prefer explicit, non-interactive commands. Avoid bare `git wt remove` and
  `git wt switch` in automation because they may open `fzf` pickers or prompts.
- Use dry-runs before destructive cleanup. Before removing a task worktree and its
  local branch, preview the removal (dry-run), show the user in the reply exactly
  what would be deleted, and proceed only after they confirm in plain discussion —
  never via the `ask_user` tool. Never remove a worktree with uncommitted changes:
  stop and report instead of forcing removal. Only delete remote branches when the
  user explicitly asks for remote deletion.
- `DEBUG=1` before a mutating command prints the underlying `git` operations
  instead of executing them.

## Branch naming

Every branch an agent creates follows `<prefix>/<TASK-ID>-<slug>`, for example
`pi/PI-026-define-enforce-worktree-branch-naming`. Do not type the name by hand — derive it:

```shell
BRANCH="$(node "$SKILL_DIR/scripts/branch-name.mjs" --task PI-026)"
git wt add -b "$BRANCH" "$BRANCH"
```

- `--task PI-026` reads the title from the backlog CLI, so the slug cannot drift from the task.
- Work with no task: `node scripts/branch-name.mjs --title "ad hoc dns flake repro"` →
  `pi/wip-ad-hoc-dns-flake-repro`.
- `--title` overrides the title when the backlog CLI is unavailable.
- The name is fixed at creation. Never rename the branch afterwards, even if the task is
  retitled.

Full rules: `backlog/docs/worktree-branch-naming/`. Worktree *directory* names are out of
scope — in git-wt layout the directory is the branch name and follows automatically.

## Common commands

Inspect repository health and worktrees:

```shell
git wt doctor
git wt status
git wt list
git wt list --porcelain
```

Clone or migrate repositories:

```shell
git wt clone <url> [folder]
git wt migrate --dry-run
git wt migrate
```

Create worktrees — raw `git worktree add`, per the operating rules above. For
reference, these are the `git wt add` equivalents it replaces:

```shell
git wt add feature origin/feature
git wt add -b new-feature new-feature
git wt add --detach hotfix HEAD~5
```

Update the default branch worktree:

```shell
git wt update
```

Switch worktrees:

- For an interactive human workflow, use:

  ```shell
  cd "$(git wt switch)"
  ```

- For an agent workflow, inspect `git wt list` output and `cd` to the exact
  worktree path instead of invoking the interactive switch picker.

Remove worktrees safely:

```shell
git wt remove feature --dry-run
printf 'y\n' | git wt remove feature
git wt remove --sweep --dry-run
printf 'cleanup\n' | git wt remove --sweep
```

Remote branch deletion is destructive. Use it only when explicitly requested,
and confirm with the branch name expected by the prompt:

```shell
git wt remove feature --delete-remote --dry-run
printf 'feature\n' | git wt remove feature --delete-remote
```

## Suggested workflow

1. Inspect first with `git wt doctor`, `git wt status`, or `git wt list`.
2. Derive the branch name with `scripts/branch-name.mjs` and state it before creating
   anything.
3. Explain the planned operation when it will create, remove, or migrate
   worktrees.
4. Prefer a dry-run or `DEBUG=1` preview where available.
5. Execute the explicit `git worktree add` (or `git wt` command, per the
   operating rules above).
6. Report created paths, removed branches, and any follow-up command the user
   should run.
