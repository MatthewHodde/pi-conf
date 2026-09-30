/**
 * abort.ts — Pi extension that adds `/abort` to stop the running task.
 *
 * Same semantics as the `app.interrupt` keybinding (Escape): aborts the
 * active agent operation and returns queued messages to the editor.
 *
 * Drop into ~/.pi/agent/extensions/ for global use, then `/reload`.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function abortExtension(pi: ExtensionAPI) {
  pi.registerCommand("abort", {
    description: "Abort the running task",
    handler: async (_args, ctx) => {
      if (ctx.isIdle()) {
        ctx.ui.notify("Nothing running", "info");
        return;
      }
      ctx.abort();
      ctx.ui.notify("Aborted", "warning");
    },
  });
}
