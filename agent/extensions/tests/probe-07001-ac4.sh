#!/usr/bin/env bash
# AC4 verifier for PI-070.01: the guidance's classification rule against a real
# git-wt layout. Identity rides on every git call so the probe commits nothing
# and reads no identity from whatever repo it is run inside.
set -uo pipefail

gitc() {
  git -c user.email=pi-07001@example.com -c user.name="PI-07001 probe" "$@"
}

fail=0
check() {
  if [ "$1" = "$2" ]; then
    echo "PASS $3"
  else
    echo "FAIL $3: got '$1' want '$2'"
    fail=1
  fi
}

work="$(mktemp -d /tmp/pi-07001-ac4.XXXXXX)"
trap 'rm -rf "$work"' EXIT

# The rename before cloning is what points the bare repo's HEAD at main; the
# later "bare root sees the worktree commit in git log" check reads that HEAD.
gitc init -q "$work/src"
gitc -C "$work/src" commit -q --allow-empty -m "chore: init"
gitc -C "$work/src" branch -qm main
mkdir "$work/repo"
gitc clone -q --bare "$work/src" "$work/repo/.bare"
printf 'gitdir: ./.bare\n' > "$work/repo/.git"
gitc --git-dir="$work/repo/.bare" worktree add "$work/repo/main" main >/dev/null 2>&1

cd "$work/repo" || exit 1
check "$(git rev-parse --is-inside-work-tree 2>/dev/null)" "false" "bare root is not a work tree"
git status >/dev/null 2>&1
check "$?" "128" "git status exits 128 at bare root"

cd "$work/repo/main" || exit 1
check "$(git rev-parse --is-inside-work-tree 2>/dev/null)" "true" "sibling worktree is a work tree"
echo "note" > note.txt
gitc add note.txt
gitc commit -q -m "chore: add note"
check "$(git log -1 --format=%s)" "chore: add note" "staged file commits in the sibling worktree"

cd "$work/repo" || exit 1
# Process substitution, not a pipeline: a piped while-body runs in a subshell
# and its fail=1 would be lost, making the script exit 0 despite FAIL lines.
while IFS= read -r d; do
  inside="$(git -C "$d" rev-parse --is-inside-work-tree 2>/dev/null)"
  case "$d" in
    */.bare) check "$inside" "false" "porcelain entry classifies as bare: $d" ;;
    *)       check "$inside" "true"  "porcelain entry classifies as worktree: $d" ;;
  esac
done < <(git worktree list --porcelain | awk '/^worktree /{print $2}')

check "$(git log -1 --format=%s)" "chore: add note" "bare root sees the worktree commit in git log"

exit "$fail"
