/**
 * smolvm-notify: pi extension for host-side notifications
 *
 * Writes agent state to /tmp/smolvm/state for host-side notification daemon.
 * Only active when SMOLVM env var is set (running inside smolvm).
 * States: idle, working, need-input
 *
 * Events:
 *   session_start   → idle
 *   agent_start     → working
 *   agent_settled   → idle
 *   ui_prompt_start → need-input
 *   ui_prompt_end   → working
 *   session_shutdown → idle
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const IN_SMOLVM = !!process.env.SMOLVM;
const SIGNAL_DIR = "/tmp/smolvm";
const STATE_FILE = join(SIGNAL_DIR, "state");

function writeState(state: string): void {
  if (!IN_SMOLVM) return;
  try {
    mkdirSync(SIGNAL_DIR, { recursive: true });
    writeFileSync(STATE_FILE, state + "\n", "utf-8");
  } catch {
    // Signal dir may not be mounted; silently ignore
  }
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async () => {
    writeState("idle");
  });

  pi.on("agent_start", async () => {
    writeState("working");
  });

  pi.on("agent_settled", async () => {
    writeState("idle");
  });

  pi.on("ui_prompt_start", async (event) => {
    writeState("need-input");
  });

  pi.on("ui_prompt_end", async () => {
    writeState("working");
  });

  pi.on("session_shutdown", async () => {
    writeState("idle");
  });
}
