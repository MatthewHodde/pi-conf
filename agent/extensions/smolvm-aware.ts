/**
 * smolvm-aware.ts — Pi extension that detects smolvm sandbox environment
 * and adapts behavior accordingly.
 *
 * Drop into ~/.pi/agent/extensions/ for global use, or .pi/extensions/ for project-local.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execSync } from "node:child_process";

interface SmolvmInfo {
  detected: boolean;
  availableTools: Record<string, boolean>;
}

function detectSmolvm(): SmolvmInfo {
  const isSmolvm = process.env.SMOLVM === "1";

  if (!isSmolvm) {
    return { detected: false, agent: "", availableTools: {} };
  }

  const toolsToCheck = [
    "git",
    "curl",
    "node",
    "python3",
    "pip",
    "uv",
    "ripgrep",
    "rg",
    "fd",
    "shellcheck",
    "jq",
    "tree",
    "make",
    "gcc",
    "g++",
    "cargo",
    "rustc",
  ];

  const availableTools: Record<string, boolean> = {};
  for (const tool of toolsToCheck) {
    try {
      execSync(`which ${tool}`, { stdio: "ignore", timeout: 1000 });
      availableTools[tool] = true;
    } catch {
      availableTools[tool] = false;
    }
  }

  return {
    detected: true,
    availableTools,
  };
}

function buildSandboxContext(info: SmolvmInfo): string {
  if (!info.detected) return "";

  const toolList = Object.entries(info.availableTools)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join(", ");

  const missingTools = Object.entries(info.availableTools)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  const lines = [
    "## Sandbox Environment",
    "",
    "You are running inside a smolvm hardware-isolated microVM.",
    "",
    "### Available tools in this VM",
    toolList,
    "",
  ];

  if (missingTools.length > 0) {
    lines.push(
      "### NOT available (do not attempt to use)",
      missingTools.join(", "),
      "",
    );
  }

  lines.push(
    "### Important constraints",
    "- This is an ephemeral VM. Changes to the VM filesystem are lost on exit.",
    "- Only mounted host directories persist. Write important output there.",
    "- Do NOT attempt to run nested VMs (no smolvm/KVM inside here).",
    "- Do NOT attempt to install smolvm, Docker, or other container/VM runtimes.",
    "",
  );

  return lines.join("\n");
}

export default function (pi: ExtensionAPI) {
  const info = detectSmolvm();

  if (!info.detected) return;

  // Inject sandbox context into every agent turn
  pi.on("before_agent_start", async (event) => {
    return {
      systemPrompt: event.systemPrompt + "\n\n" + buildSandboxContext(info),
    };
  });

  // Block nested VM/container attempts
  pi.on("tool_call", async (event) => {
    if (event.toolName === "bash") {
      const cmd = event.input.command || "";
      const blocked = [
        /\bsmolvm\b/,
        /\bqemu-(system|img)\b/,
        /\bkvm\b/,
        /\bdocker\b/,
        /\bpodman\b/,
        /\bvagrant\b/,
        /\bmultipass\b/,
        /\bfirejail\b/,
        /\blxc\b/,
      ];

      for (const pattern of blocked) {
        if (pattern.test(cmd)) {
          return {
            block: true,
            reason:
              "Nested VM/container commands are not available inside a smolvm sandbox.",
          };
        }
      }
    }
  });

  // Notify the human on session start
  pi.on("session_start", async (_event, ctx) => {
    const toolCount = Object.values(info.availableTools).filter(Boolean).length;
    ctx.ui.notify(`🧊 smolvm sandbox — ${toolCount} tools available`, "info");
  });
}
