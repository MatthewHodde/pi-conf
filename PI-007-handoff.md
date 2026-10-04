# PI-007 handoff — tmux-agent-panel (tap) in smolvm

Date: 2026-10-04. Task: PI-007, status In Progress.
Question: add tap to pi, works when pi runs in a smolvm microVM?

## Verdict

Changed on 2026-10-04. The handoff rejected the bridge as too complex, and
repo exploration reversed that verdict.

1. agenmux for pane identity. A user-level `agents/pi.conf` override adds the
   run-agent.sh launcher paths, so the watcher claims the pane without a patch.
2. The notification bridge for tap state. It already ran on the host. It now
   maps its state file to `tap state`, and run-agent.sh clears the state on exit.
3. A guest pi extension sets the pane title to the active Backlog task id.
   run-agent.sh restores the saved title on exit.

Hooks still can not reach the host tmux socket from inside the VM.

## Findings

1. tap mechanism. Hooks call `tap state`, which writes `@agent_state` on
   `$TMUX_PANE`. It needs the host tmux socket. The VM has no tmux binary and
   no socket. Calls from inside the VM are silent no-ops. The pane-title
   fallback works for Claude Code only.
2. Host facts. tmux 3.7b, socket `/tmp/tmux-1000/default`. One pane: title
   `π - .pi` (U+03C0 prefix), `pane_current_command` = `bash`. pi writes an
   OSC title from inside the VM. The escape sequence crosses to host tmux.
   The host process tree shows no `pi` process.
3. agenmux (`snirt/agenmux`, clone was at `/tmp/agenmux-src`). Closest fit,
   hookless detection. Blocker: `src/procs.rs` `identify()` matches only
   `pane_pid` descendants against `AGENT_BINS` / `AGENT_PATH_HINTS`. Title and
   screen rules run after identity passes. `agents/pi.conf` already has
   pi-ready screen rules. Identity fails for VM panes, so the pane renders as
   a plain pane. The `@agenmux` pane option is a sidebar marker only.
4. tmux-agent-sidebar. `hook.sh` writes tmux options. Same VM wall. Dead.
5. Shared mount. `/home/matthew/.pi` is virtiofs rw on both sides. agenmux
   `SUBJECT_CMD` can read `~/.pi/agent/sessions` from the host.

## Plan

1. Mount the smolvm launch repo on the host. Trace what process a host tmux
   pane runs to enter the VM. Pane command showed `bash`.
2. Pick a fix.
   - Fix A: name the host wrapper so agenmux `AGENT_BINS` matches. No patch.
   - Fix B: patch agenmux. Add a title-identity key. `pi.conf` gets `^π - `.
3. Verify live. Run `ps -ef | grep -E 'pi|smolvm'` on the host. Confirm the
   agenmux sidebar shows working and blocked states on a real pane.
4. Record the tap verdict: rejected, needs a bridge. agenmux path chosen.

## Rejected

Mount the host tmux socket into the VM. It breaks isolation.

## Alternate bridge (chosen)

A host watcher runs `tap state` per pane from a VM state file. The listener is
that watcher, so no new process was added.
