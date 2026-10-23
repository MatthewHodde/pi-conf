import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

const REGISTRY = Symbol.for("pi-libactions/registry/v1");

interface ActionsRegistry {
	find(id: string): { run(ctx: unknown): void | Promise<void> } | undefined;
}

function fireTuicr(ctx: unknown): boolean {
	const registry = (globalThis as Record<PropertyKey, unknown>)[REGISTRY] as ActionsRegistry | undefined;
	const action = registry?.find("panels.tuicr.open");
	if (!action) return false;
	void action.run(ctx);
	return true;
}

export default function harness(pi: ExtensionAPI): void {
	pi.registerCommand("tuicr", {
		description: "Review changes with tuicr",
		handler: async (_args, ctx: ExtensionCommandContext) => {
			if (!fireTuicr(ctx)) ctx.ui.notify("panels.tuicr.open is not registered", "error");
		},
	});
	pi.registerShortcut("alt+t", {
		description: "Run panels.tuicr.open (test harness)",
		handler: (ctx) => {
			if (!fireTuicr(ctx)) ctx.ui.notify("panels.tuicr.open is not registered", "error");
		},
	});
}
