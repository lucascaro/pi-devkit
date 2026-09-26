import { isToolCallEventType, type ExtensionFactory } from "@earendil-works/pi-coding-agent";

// Kept local so the standalone subagent package does not depend on the
// separately installable guardrails package. Parity is covered by tests.
const DANGEROUS_PATTERNS: RegExp[] = [
  /(^|\s)rm\s+(-[A-Za-z]*r[A-Za-z]*f|-f[A-Za-z]*r|-[A-Za-z]*R[A-Za-z]*f)\b/,
  /(^|\s)sudo\b/i,
  /(^|\s)git\s+reset\s+--hard\b/,
  /(^|\s)git\s+push\b.*\s--force(?:-with-lease)?\b/,
  /(^|\s)chmod\s+-R\s+777\b/,
  /(^|\s)chown\s+-R\b/,
  /(^|\s)dd\s+\b.*\bof=\/dev\//,
  /(^|\s)mkfs(?:\.[A-Za-z0-9_-]+)?\b/,
  /(^|\s)docker\s+system\s+prune\b.*\s-\-?(a|all)\b/,
  /(^|\s)kubectl\s+delete\b/,
  /DROP\s+TABLE\b/i,
  /TRUNCATE\s+TABLE\b/i,
];

export function isSubagentDangerousCommand(command: string): boolean {
  const normalized = command.replace(/\\\n/g, " ").replace(/\s+/g, " ").trim();
  return DANGEROUS_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * SDK subagents have no confirmation UI. Block the same dangerous Bash
 * commands as pi-devkit guardrails instead of allowing an unprompted run.
 */
export const sdkSubagentGuardrails: ExtensionFactory = (pi) => {
  pi.on("tool_call", (event) => {
    if (!isToolCallEventType("bash", event)) return;
    if (!isSubagentDangerousCommand(event.input.command)) return;

    return {
      block: true,
      reason: "SDK subagents block destructive or privilege-sensitive Bash commands.",
    };
  });
};
