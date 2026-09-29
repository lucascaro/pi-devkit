import { isToolCallEventType, type ExtensionFactory } from "@earendil-works/pi-coding-agent";

// Kept local so the standalone subagent package does not depend on the
// separately installable guardrails package. Parity is covered by tests.
function hasRecursiveRm(command: string): boolean {
  const rmCommands = command.matchAll(/(?:^|[\s;&|()])(?:[^\s;&|()]*\/)?rm\b([^;&|()\r\n]*)/gi);
  for (const match of rmCommands) {
    const args = match[1]?.trim().split(/\s+/) ?? [];
    for (const arg of args) {
      if (arg === "--") break;
      if (arg === "--recursive" || (/^-(?!-)/.test(arg) && /r/i.test(arg.slice(1)))) {
        return true;
      }
    }
  }
  return false;
}

const DANGEROUS_PATTERNS: RegExp[] = [
  /(^|[\s;&|()])(?:[^\s;&|()]*\/)?sudo\b/i,
  /(^|[\s;&|()])(?:[^\s;&|()]*\/)?git\s+reset\s+--hard\b/,
  /(^|[\s;&|()])(?:[^\s;&|()]*\/)?git\s+push\b[^;&|\r\n]*\s(?:-[A-Za-z]*f[A-Za-z]*\b|--force(?:-with-lease)?\b)/,
  /(^|[\s;&|()])chmod\s+-R\s+777\b/,
  /(^|[\s;&|()])chown\s+-R\b/,
  /(^|[\s;&|()])dd\s+\b.*\bof=\/dev\//,
  /(^|[\s;&|()])mkfs(?:\.[A-Za-z0-9_-]+)?\b/,
  /(^|[\s;&|()])docker\s+system\s+prune\b.*\s-\-?(a|all)\b/,
  /(^|[\s;&|()])kubectl\s+delete\b/,
  /DROP\s+TABLE\b/i,
  /TRUNCATE\s+TABLE\b/i,
];

function normalizeCommand(command: string): string {
  // Normalize separators inside common quotes/substitutions; leave outer newlines as command boundaries.
  const quotedSeparatorsFlattened = command
    .replace(/"((?:\\.|[^"\\])*)"/g, (_match, contents: string) => `"${contents.replace(/[;&|\r\n]/g, " ")}"`)
    .replace(/'([^']*)'/g, (_match, contents: string) => `'${contents.replace(/[;&|\r\n]/g, " ")}'`);
  const substitutionsFlattened = quotedSeparatorsFlattened
    .replace(/\$\(([^()]*)\)/g, (_match, contents: string) => ` ${contents.replace(/[;&|\r\n]/g, " ")} `)
    .replace(/`([^`]*)`/g, (_match, contents: string) => ` ${contents.replace(/[;&|\r\n]/g, " ")} `)
    .replace(/\\(?=(?:rm|sudo|git|chmod|chown|dd|mkfs|docker|kubectl)\b)/gi, "");
  return substitutionsFlattened.replace(/\\\n/g, " ").replace(/[ \t\r]+/g, " ").trim();
}

function hasDangerousCommand(command: string): boolean {
  const normalized = normalizeCommand(command);
  if (
    hasRecursiveRm(command)
    || DANGEROUS_PATTERNS.some((pattern) => pattern.test(command))
    || hasRecursiveRm(normalized)
    || DANGEROUS_PATTERNS.some((pattern) => pattern.test(normalized))
  ) {
    return true;
  }

  const substitutions = /\$\(([^()]*)\)|`([^`]*)`/g;
  for (const match of command.matchAll(substitutions)) {
    const contents = match[1] ?? match[2];
    if (contents && hasDangerousCommand(contents)) return true;
  }
  return false;
}

export function isSubagentDangerousCommand(command: string): boolean {
  return hasDangerousCommand(command);
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
