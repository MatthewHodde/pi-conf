# Handoff

State as of 2026-10-15. This document orients the next engineer to this directory.

## What this directory is

Personal configuration for the pi coding agent. It has two halves.

Local extensions live here as top-level `.ts` files. Pi discovers each one as a
global extension.

The patch system maintains local fixes to third-party packages. Pi installs
those packages under `~/.pi/agent/npm`, and a reinstall wipes any manual edit
there. The scripts in this directory reapply the fixes and rebuild them when a
package version bumps. The list of installed packages lives in
`~/.pi/agent/settings.json` under `packages`. The npm tree and its
`package-lock.json` live in `~/.pi/agent/npm`.

The same directory is reachable at two paths in the sandbox. Both carry the
same files. They differ in two ways that matter.

| Path | Writes | Sits inside the full pi tree |
| --- | --- | --- |
| `/home/matthew/.pi/agent/extensions` | yes | no |
| `/home/ubuntu/.pi/agent/extensions` | no, read-only mount | yes |

Only the `/home/ubuntu/.pi` tree holds `bin/`, `settings.json`, and the npm
installs. The `/home/matthew/.pi` path holds `extensions` and nothing else.
The scripts in this directory write under `$HOME/.pi/agent/npm`, which is
writable in the sandbox, so the read-only mount on `extensions` does not stop
them. Pick the path per job. Edit files through the writable path. Run tests
per the note under Tests.

This directory is not a git repository. Nothing here is version controlled.
Copy out anything you cannot afford to lose.

## Local extensions

Each top-level `.ts` file is one extension.

- `abort.ts` adds `/abort`, with the same semantics as the `app.interrupt`
  keybinding.
- `backlog-title.ts` puts the active Backlog task in the terminal title. It
  watches one pair of tool events, so it catches the backlog CLI, the backlog
  MCP server, and codemode scripts alike. The title changes only on a
  successful tool result.
- `conventional-commits.ts` enforces conventional commit messages. It blocks a
  `git commit` whose message breaks the format and runs the secret scanner
  first. The scanner path resolves as `../bin/scan-secrets` from this file.
- `deepwiki-guard.ts` injects the research source order into the system prompt
  when the DeepWiki MCP tools are available.
- `disk-pressure.ts` warns when a smolvm sandbox disk fills, with extra checks
  after operations such as `npm install` and `cargo build`.
- `instance-widget.ts` draws the line above the prompt that names the backlog
  task this instance claimed and where it runs.
- `smolvm-aware.ts` detects the smolvm sandbox and adapts behavior to it.
- `smolvm-notify.ts` writes agent state, one of idle, working, or blocked,
  where the host listener can read it. It activates only inside smolvm.

`lib/claim.ts` is the shared rule for which backlog task an instance runs.
`backlog-title.ts` and `instance-widget.ts` import it. It is not an extension.
It sits in `lib/` with no registration, so pi's directory discovery skips it.

`pi-vim-keys/config.json` holds keybindings for the installed
`@0xkahi/pi-vim-keys` package, including the leader mappings and
`alt+escape` bound to `app.interrupt`.

## Tests

`tests/` holds one plain node script per extension that needs one. Some assert
through `node:assert`, some print their own tick and cross lines. Each exits
nonzero when a check fails. Node 22.19.0 runs the TypeScript directly.

```sh
cd /home/matthew/.pi/agent/extensions
for t in tests/test-*; do node "$t" || echo "FAIL $t"; done
```

Five of the six suites pass from each path in the sandbox. The two failures
are artifacts of the mount split described above. Neither is an extension bug.

`tests/test-conventional-commits.mts` passes only through the
`/home/ubuntu/.pi/agent/extensions` path. `conventional-commits.ts` resolves
its secret scanner as `../bin/scan-secrets` relative to its own file. Load the
extension through the `/home/matthew` mount and that lookup lands on
`/home/matthew/.pi/agent/bin/scan-secrets`, which does not exist in the
sandbox. The scanner exits 127, the tool_call handler blocks the commit with
"secret scan failed", and the assertion "invalid subject notifies" fails
because the notification that fired names the scanner failure instead.

`tests/test-backlog-footer.mjs` passes only through the
`/home/matthew/.pi/agent/extensions` path. The test creates and deletes a
fixture directory at `tests/.test-backlog`, and the `/home/ubuntu` mount is
read-only, so the `mkdir` fails with ENOENT and six of its seventeen checks
fail.

To see all six suites green in one run, run each suite from the path that
suits it. On a host install, where `bin/` sits beside this directory and the
tree is writable, the split does not apply.

## Patches

`patches/` holds unified diffs from the pristine npm tarball to the live file
in `~/.pi/agent/npm`. Each file is named
`owner+package+version+purpose.patch`.

Two patches are current. Both were confirmed applied on 2026-10-15.

- `0xkahi+pi-vim-keys+1.1.2+escape-abort.patch` lets vim-mode input fall
  through to app keybindings first. Without it, modal editing swallows
  `alt+escape` and the interrupt never fires.
- `jonjonrankin+pi-caveman+1.0.8.patch` removes the animated status frames.
  The status line then shows the caveman level without cycling frames on a
  timer.

Two patches were deleted on 2026-10-15. `whamp+pi-pstack+0.9.1+typebox-peer.patch`
and its `-lock` companion moved `typebox` out of pi-pstack 0.9.1's hard
`dependencies` and into `peerDependencies` with the range `*`, so the agent's
single top-level copy is shared instead of duplicated at a pinned version.
Upstream shipped the same change in 0.10.1. The hunks stopped applying, the
desired state was already present, and keeping them only produced false
failures. The installed pi-pstack is 0.10.1.

## Scripts

`apply-all-patches.sh` applies every patch in `patches/` to `~/.pi/agent/npm`.
Its `--check` flag runs a dry run and reports one of NOT applied, ALREADY
applied, or CONFLICT for each patch.

`regen-patch.sh <patch-file>` rebuilds one patch. It downloads the registry
tarball named in `package-lock.json`, checks the download's sha512 against the
lockfile's `integrity` field, and diffs the pristine file against the live one.
A patch that targets `package-lock.json` itself has no tarball. npm restores
that entry on every install, so such a patch usually applies unaided.

## After a pi install or pi update

1. Run `bash ~/.pi/agent/extensions/apply-all-patches.sh --check`.
2. Read the output. ALREADY applied is success. CONFLICT means the package
   changed under one of its patches.
3. For a CONFLICT, re-apply the patch's intent by hand to the fresh file in
   `~/.pi/agent/npm`, then run `regen-patch.sh <patch-file>`, then run the
   check again and expect ALREADY applied.

If a patch's intent turns out to be shipped upstream, delete the patch file
instead. That is what happened to the two pi-pstack patches above.
