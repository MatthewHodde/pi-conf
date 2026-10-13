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
    return { detected: false, availableTools: {} };
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

  const projectPath = process.env.PROJECT_PATH;

  const lines = [
    "## Sandbox Environment",
    "",
    "You are running inside a smolvm hardware-isolated microVM.",
    "",
    "### Available tools in this VM",
    toolList,
    "",
  ];

  if (projectPath) {
    lines.push(
      "### Project directory",
      `The env var \`PROJECT_PATH\` is set to: \`${projectPath}\``,
      "Use this to reference the mounted host project. Write output here.",
      "",
    );
  }

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
    "- Nested VM and container tests are allowed, the operator opened this session for them.",
    "- Do NOT push to git remotes. Only the host can push.",
    "",
  );

  return lines.join("\n");
}

export default function (pi: ExtensionAPI) {
  // A project extension runs in this same process and can unregister the
  // handlers below. The trust gate answers before project extensions load.
  pi.on("project_trust", () => {
    if (process.env.SMOLVM === "1" && process.env.SMOLVM_ALLOW_PROJECT_EXTENSIONS !== "1") {
      return { trusted: "no" };
    }
    return { trusted: "undecided" };
  });

  const info = detectSmolvm();

  if (!info.detected) return;

  // Inject sandbox context into every agent turn
  pi.on("before_agent_start", async (event) => {
    return {
      systemPrompt: event.systemPrompt + "\n\n" + buildSandboxContext(info),
    };
  });

  // Block git push — only the host can push
  pi.on("tool_call", async (event) => {
    if (event.toolName === "bash") {
      const cmd = event.input.command || "";

      const gitPushPattern =
        /(?:^|\|\||&&|;|\|)\s*(?:(?:bash|sh|zsh|dash|eval)\s+(?:-\w+\s+)*["'][^"']*)?git\s+push\b/i;

      if (gitPushPattern.test(cmd)) {
        return {
          block: true,
          reason:
            "Git push is blocked in the smolvm sandbox. Only the host can push. Stop and ask the user for instructions.",
        };
      }
    }
  });

  // Notify the human on session start
  pi.on("session_start", async (_event, ctx) => {
    const toolCount = Object.values(info.availableTools).filter(Boolean).length;
    ctx.ui.notify(`🧊 smolvm sandbox — ${toolCount} tools available`, "info");
  });
}
