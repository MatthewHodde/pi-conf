# Handoff: scan-secrets no longer vendors gitleaks

For the agent that owns the pi config dir and will commit this change.
Scope is this directory only: `~/.pi/agent/bin/`. Read the general
`~/.pi/agent/extensions/HANDOFF.md` for the whole directory; it is a
different, broader document. This one covers a single change.

## What changed

Two things in `~/.pi/agent/bin/`.

1. `scan-secrets` resolves gitleaks from `PATH` instead of a vendored binary.
2. The vendored `gitleaks` binary was deleted from this directory.

`scan-secrets` previously pinned a 15MB gitleaks 8.24.2 that sat next to the
script:

```bash
gitleaks="${GITLEAKS_BIN:-$script_dir/gitleaks}"
[ -x "$gitleaks" ] || die "gitleaks missing at $gitleaks; set GITLEAKS_BIN" 127
```

That was wrong twice over. The sandbox image already ships gitleaks through
mise (`sandboxes/pi-dev/mise.container.toml` pins `aqua:gitleaks/gitleaks` to
a version, installed by the Dockerfile), but `agent/bin` precedes the mise
shims on `PATH`, so the stale vendored copy shadowed the pinned one. The
scanner silently ran 8.24.2 on every host and guest.

It now reads:

```bash
gitleaks="$(command -v gitleaks)"
[ -n "$gitleaks" ] || die "no gitleaks on PATH; it ships with the sandbox image via mise" 127
```

No override hook and no fallback path. A missing gitleaks is now a build
problem that fails loudly at exit 127, not something to paper over by
dropping another binary into this directory. If you are tempted to re-add a
vendored copy to make a bare host work: don't. Fix the image or the host
toolchain instead.

## State of the working tree

- `~/.pi` is **not** a git repository, and was not one as of the general
  handoff dated 2026-10-15. Verify whether that is still true before you
  assume a plain `git add` works. If the owner has since made it a repo, or
  tracks these files from a dotfiles repo elsewhere, commit from there.
- Files touched: `scan-secrets` (edited), `gitleaks` (deleted).
- `scan-secrets.test` and `scan-secrets.toml` are unchanged.
- These files are reached in the sandbox at `/home/ubuntu/.pi/agent/bin/`,
  mounted from the host's pi config dir. The edit landed on the real host
  file through the writable mount. The host-side path was not visible from
  the guest that made the change, so confirm the true location before
  committing.

## Verification already done

All in a smolvm guest, uid 1000, against the managed gitleaks 8.30.1.

- `bash -n` and `shellcheck` clean on `scan-secrets`.
- `command -v gitleaks` resolves the mise copy, not a local one.
- A clean staged tree scans with exit 0.
- With no gitleaks on `PATH`, it exits 127 with the message above.
- `scan-secrets.test` passes, all 16 cases.

The version bump is the one behavioral risk in the diff: detection moved from
8.24.2 to 8.30.1, so rule matching can differ. The test suite passing is the
evidence that the contract holds. If the owner sees a new finding on a real
repo, that is a gitleaks-version effect, not a regression in this script.

## Committing

Suggested conventional commit, since `conventional-commits.ts` in this
directory enforces the format and runs this very scanner before any commit:

```
fix(scan-secrets): use the managed gitleaks instead of a vendored copy
```
