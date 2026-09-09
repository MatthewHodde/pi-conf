/**
 * disk-pressure.ts — Pi extension that monitors disk usage in smolvm sandboxes.
 *
 * Warns when disk is filling up, and after operations that tend to consume
 * lots of space (npm install, cargo build, etc.).
 *
 * Drop into ~/.pi/agent/extensions/ for global use.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execSync } from "node:child_process";

interface DiskUsage {
  total: number;  // bytes
  used: number;   // bytes
  available: number; // bytes
  percent: number;
}

function getDiskUsage(path = "/"): DiskUsage | null {
  try {
    const raw = execSync(
      `df -B1 --output=size,used,avail,pcent ${path} | tail -1`,
      { encoding: "utf-8", timeout: 2000 }
    );
    const [total, used, avail, pct] = raw.trim().split(/\s+/);
    return {
      total: parseInt(total, 10),
      used: parseInt(used, 10),
      available: parseInt(avail, 10),
      percent: parseInt(pct.replace("%", ""), 10),
    };
  } catch {
    return null;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}

// Commands that tend to eat disk
const HEAVY_COMMANDS = [
  /\bnpm\s+(install|i|ci)\b/,
  /\byarn\s+(install|add)\b/,
  /\bpnpm\s+install\b/,
  /\bcargo\s+(build|install)\b/,
  /\bmake\b/,
  /\bgradle\b/,
  /\bmvn\b/,
  /\bpip\s+install\b/,
  /\bapt(-get)?\s+install\b/,
];

const WARN_THRESHOLD = 80;   // percent
const CRITICAL_THRESHOLD = 90; // percent

function checkAndWarn(ctx: any): void {
  const usage = getDiskUsage();
  if (!usage) return;

  if (usage.percent >= CRITICAL_THRESHOLD) {
    ctx.ui.notify(
      `🚨 Disk CRITICAL: ${usage.percent}% full (${formatBytes(usage.available)} free)`,
      "error"
    );
  } else if (usage.percent >= WARN_THRESHOLD) {
    ctx.ui.notify(
      `⚠️ Disk pressure: ${usage.percent}% full (${formatBytes(usage.available)} free)`,
      "warning"
    );
  }
}

export default function (pi: ExtensionAPI) {
  if (process.env.SMOLVM !== "1") return;

  // Register a tool the agent can query
  pi.registerTool({
    name: "disk_usage",
    label: "Disk Usage",
    description: "Check current disk usage in the VM. Useful before large operations.",
    parameters: { type: "object" as const, properties: {} },
    async execute() {
      const usage = getDiskUsage();
      if (!usage) {
        return { content: [{ type: "text", text: "Could not read disk usage." }] };
      }

      const lines = [
        `Total:     ${formatBytes(usage.total)}`,
        `Used:      ${formatBytes(usage.used)} (${usage.percent}%)`,
        `Available: ${formatBytes(usage.available)}`,
        "",
      ];

      if (usage.percent >= CRITICAL_THRESHOLD) {
        lines.push("⚠️ CRITICAL: Very low disk space. Clean up before continuing.");
      } else if (usage.percent >= WARN_THRESHOLD) {
        lines.push("⚠️ WARNING: Disk is getting full. Consider cleaning build artifacts.");
      } else {
        lines.push("✅ Disk space is healthy.");
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  });

  // Check after heavy commands complete
  pi.on("tool_execution_end", async (event, ctx) => {
    if (event.toolName !== "bash" || event.isError) return;

    const cmd = event.input?.command || "";
    const isHeavy = HEAVY_COMMANDS.some((p) => p.test(cmd));
    if (!isHeavy) return;

    // Small delay to let writes finish
    await new Promise((r) => setTimeout(r, 500));
    checkAndWarn(ctx);
  });

  // Periodic check at session start
  pi.on("session_start", async (_event, ctx) => {
    checkAndWarn(ctx);
  });
}
