#!/usr/bin/env bash
# Security surface scan for an unpacked npm package (PI-042).
# Usage: ./audit-package.sh <unpacked-package-dir>
# Deterministic report. Exits 0 on completion; findings are the output.

set -euo pipefail

dir="${1:?usage: audit-package.sh <unpacked-package-dir>}"
[ -d "$dir" ] || { echo "not a directory: $dir"; exit 1; }

section() { printf '\n=== %s ===\n' "$1"; }
hits() { # hits <label> <pattern>
  local label="$1" pattern="$2"
  local found
  found=$(grep -rn --include='*.ts' --include='*.js' --include='*.mjs' --include='*.json' -E "$pattern" "$dir" 2>/dev/null | grep -v 'package/package.json' || true)
  printf '%s: %s\n' "$label" "$( [ -n "$found" ] && echo "$(echo "$found" | wc -l) hit(s)" || echo "none" )"
  [ -n "$found" ] && printf '%s\n' "$found" | awk '{print "  " $0}'
  return 0
}

section "manifest"
pkg="$dir/package.json"
[ -f "$pkg" ] || pkg="$dir/package/package.json"
if [ -f "$pkg" ]; then
  echo "install scripts:"
  jq -r '.scripts // {} | to_entries[] | "  \(.key): \(.value)"' "$pkg" 2>/dev/null | grep -Ei 'preinstall|install|postinstall|prepare|prepublish' || echo "  none (no install hooks)"
  echo "dependencies:"
  jq -r '.dependencies // {} | to_entries[] | "  \(.key): \(.value)"' "$pkg" 2>/dev/null || echo "  none"
  echo "optionalDependencies:"
  jq -r '.optionalDependencies // {} | to_entries[] | "  \(.key): \(.value)"' "$pkg" 2>/dev/null || echo "  none"
  echo "bundled/duplicate host packages in dependencies (pi warns on these):"
  jq -r '.dependencies // {} | keys[]' "$pkg" 2>/dev/null | grep -E 'pi-coding-agent|pi-tui|pi-ai|typebox' || echo "  none"
fi

section "network egress"
hits "fetch/http" '(^|[^a-zA-Z0-9_.])(fetch|XMLHttpRequest|sendBeacon)\s*\(|require\("node:https?"\)|from "node:https?"|from "node:net"|from "node:dns"|WebSocket|axios|got\(|superagent'
hits "servers/sockets" 'createServer|\.listen\(|connect\(|openConnection'

section "process execution"
hits "child_process" 'child_process|spawn\(|spawnSync|execSync|execFile|fork\('
hits "shell escalation" 'shell:\s*true|/bin/(ba)?sh|-c["'\'']'

section "filesystem writes"
hits "fs writes" 'writeFileSync|writeFile\(|appendFile|mkdirSync|rmSync|renameSync|copyFileSync|createWriteStream|truncate\('
hits "fs reads outside pkg" 'readFileSync|readFile\(|readdirSync|createReadStream'

section "environment and credentials"
hits "env access" 'process\.env'
hits "credential/token names" 'api[_-]?key|apiKey|API_KEY|secret|Secret|password|credential|\.npmrc|\.netrc|\.ssh|bearer|Bearer'

section "dynamic code execution"
hits "eval/Function/vm" 'eval\(|new Function\(|node:vm|require\("vm"\)'
hits "dynamic import" 'await import\(|import\('

section "obfuscation"
hits "fromCharCode" 'String\.fromCharCode|atob\(|btoa\('
hits "long base64/hex blobs" '[A-Za-z0-9+/]{120,}={0,2}|[0-9a-fA-F]{160,}'

section "telemetry"
hits "telemetry/analytics" 'telemetry|analytics|segment\.|mixpanel|posthog|sentry|bugsnag'

section "pi host API usage"
hits "registerTool" 'registerTool\('
hits "events emit/on" 'events\.(emit|on)\(|\.emit\("'
hits "prompt/guidance strings" 'promptSnippet|promptGuidelines|guidance'
hits "system prompt access" 'getSystemPrompt|systemPrompt'

section "totals"
echo "ts files: $(find "$dir" -name '*.ts' | wc -l)"
echo "ts lines: $(find "$dir" -name '*.ts' -exec cat {} + | wc -l)"
echo "all files: $(find "$dir" -type f | wc -l)"
