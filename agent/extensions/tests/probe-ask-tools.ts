/**
 * PI-066 AC #4.
 * Run: pi -e agent/extensions/tests/probe-ask-tools.ts -p --no-session ok
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
		const askUser = askTools.filter((t) => t.name === "ask_user_question");
		const ok =
			askUser.length === 1 &&
			askUser[0].source.includes("@whamp/pi-pstack") &&
			!askTools.some((t) => t.name === "ask_user");
		if (!ok) console.error(`wrong ask tool set, see ${OUT}`);
		process.exit(ok ? 0 : 1);
	});
}
