/**
 * Probe the registered ask tools on a real pi load (PI-064 AC #2/#3).
 *
 * Run:  pi -e ~/.pi/agent/extensions/tests/probe-ask-tools.ts -p --no-session ok
 * Reads: $PI_ASK_PROBE_OUT, defaults to /tmp/ask-probe.json
 *
 * Dumps every registered tool whose name contains "ask" at session_start,
 * then exits before any model call. A correct install shows exactly one
 * ask_user_question sourced from @juicesharp/rpiv-ask-user-question and no
 * tool named ask_user.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { writeFileSync } from "node:fs";

const OUT = process.env.PI_ASK_PROBE_OUT ?? "/tmp/ask-probe.json";

export default function (pi: ExtensionAPI) {
	pi.on("session_start", () => {
		const askTools = pi
			.getAllTools()
			.filter((t) => t.name.includes("ask"))
			.map((t) => ({ name: t.name, path: t.sourceInfo.path, source: t.sourceInfo.source }));
		writeFileSync(OUT, JSON.stringify(askTools, null, 2) + "\n");
		process.exit(0);
	});
}
