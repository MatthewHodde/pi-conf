#!/bin/bash
# regen-patch.sh — rebuild a .patch file in extensions/patches/ from the pristine npm tarball.
#
# A patch is a diff: pristine file (registry tarball) → live, modified copy in ~/.pi/agent/npm.
#
# Usage (after `pi install` / `pi update` bumped a package):
#   1. apply-all-patches.sh --check     # expect CONFLICT / FAILED
#   2. re-apply the patch's intent by hand to the freshly installed file
#   3. regen-patch.sh <patch-file>      # rebuild + verify
#   4. apply-all-patches.sh --check     # expect ALREADY applied
#
# The tarball is downloaded and its sha512 checked against the `integrity` field in
# package-lock.json, so the pristine side is always the real registry bytes — a wrong or
# inverted input cannot slip in and produce a backwards patch.
#
# package-lock.json patches: no tarball exists, but npm rewrites the entry unpatched on
# install, so that patch applies by itself.

set -uo pipefail

NPM_DIR="$HOME/.pi/agent/npm"
PATCHES_DIR="$HOME/.pi/agent/extensions/patches"
die() { echo "ERROR: $*" >&2; exit 1; }

PATCH="${1:-}"
[ -n "$PATCH" ] || die "usage: regen-patch.sh <patch-file>"
case "$PATCH" in /*) ;; *) [ -f "$PATCH" ] || PATCH="$PATCHES_DIR/$PATCH" ;; esac
[ -f "$PATCH" ] || die "patch not found: $PATCH"
PATCH_NAME=$(basename "$PATCH")

# Target files, from the "--- a/<path>" headers.
mapfile -t FILES < <(grep -E '^--- a/' "$PATCH" | sed -e 's|^--- a/||' -e 's/\t.*//')
[ ${#FILES[@]} -gt 0 ] || die "no '--- a/<path>' headers in $PATCH_NAME"
for f in "${FILES[@]}"; do [ -f "$NPM_DIR/$f" ] || die "live file missing: $NPM_DIR/$f"; done

# Exactly one package root.
pkg_root_of() { # nearest ancestor dir of $1 with a package.json
  local dir; dir=$(dirname "$1")
  while [ "$dir" != "." ] && [ "$dir" != "/" ]; do
    [ -f "$NPM_DIR/$dir/package.json" ] && { echo "$dir"; return 0; }
    dir=$(dirname "$dir")
  done
  return 1
}
ROOT=""
for f in "${FILES[@]}"; do
  r=$(pkg_root_of "$f") || die "no package tarball covers '$f' — package-lock.json patches are rebuilt by hand
       (npm restores the entry on install, so the patch usually applies unaided)"
  [ -z "$ROOT" ] || [ "$ROOT" = "$r" ] || die "patch spans multiple packages ($ROOT, $r) — unsupported"
  ROOT="$r"
done
NAME=$(jq -r '.name' "$NPM_DIR/$ROOT/package.json")
VERSION=$(jq -r '.version' "$NPM_DIR/$ROOT/package.json")
URL=$(jq -r --arg k "$ROOT" '.packages[$k].resolved // empty' "$NPM_DIR/package-lock.json")
INTEGRITY=$(jq -r --arg k "$ROOT" '.packages[$k].integrity // empty' "$NPM_DIR/package-lock.json")
[ -n "$URL" ] || die "no 'resolved' URL for $ROOT in package-lock.json"
[ -n "$INTEGRITY" ] || die "no integrity field for $ROOT in package-lock.json"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# Download and verify the pristine tarball.
curl -fsSL --retry 2 -o "$TMP/pkg.tgz" "$URL" || die "download failed: $URL"
GOT_SHA=$(node -e 'const c=require("crypto"),fs=require("fs");process.stdout.write(c.createHash("sha512").update(fs.readFileSync(process.argv[1])).digest("base64"))' "$TMP/pkg.tgz")
[ "$GOT_SHA" = "${INTEGRITY#sha512-}" ] || die "sha512 mismatch for $NAME@$VERSION — corrupt or tampered download"
echo "pristine: $NAME@$VERSION (downloaded, sha512-verified)"

# Extract and stage the target files at npm-relative paths.
tar -xzf "$TMP/pkg.tgz" -C "$TMP" || die "tar extract failed"
if [ -f "$TMP/package.json" ]; then EXTRACT="$TMP"; else
  dirs=("$TMP"/*/) 
  if [ ${#dirs[@]} -eq 1 ] && [ -f "${dirs[0]}/package.json" ]; then EXTRACT="${dirs[0]}"; else die "unexpected tarball layout"; fi
fi
TREE="$TMP/tree"
for f in "${FILES[@]}"; do
  rel="${f#"$ROOT"/}"
  [ -f "$EXTRACT/$rel" ] || die "not in tarball: $rel"
  mkdir -p "$TREE/$(dirname "$f")"
  cp "$EXTRACT/$rel" "$TREE/$f"
done

# Emit: pristine → live.
NEW="$TMP/new.patch"
: > "$NEW"
for f in "${FILES[@]}"; do
  diff -u --label "a/$f" --label "b/$f" "$TREE/$f" "$NPM_DIR/$f" >> "$NEW"
  rc=$?; [ $rc -le 1 ] || die "diff failed for $f"
done
[ -s "$NEW" ] || die "no differences between pristine and live — nothing to patch"

# Verify: applies to pristine tree, reverse-applies to live tree, round-trips to live.
( cd "$TREE" && git apply --check "$NEW" ) || die "emitted patch does not apply to pristine tree"
( cd "$NPM_DIR" && git apply --reverse --check "$NEW" ) || die "emitted patch does not reverse-apply to live tree"
if cmp -s "$NEW" "$PATCH"; then
  echo "unchanged: $PATCH_NAME"
else
  cp "$NEW" "$PATCH"
  echo "rewrote:   $PATCH_NAME"
fi
( cd "$TREE" && git apply "$NEW" )
for f in "${FILES[@]}"; do
  cmp -s "$TREE/$f" "$NPM_DIR/$f" || die "round-trip mismatch for $f"
done
echo "round-trip: pristine + patch == live  ✓"
