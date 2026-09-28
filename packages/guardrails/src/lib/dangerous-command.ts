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

export function isDangerousCommand(command: string): boolean {
  const normalized = command.replace(/\\\n/g, " ").replace(/[ \t\r]+/g, " ").trim();
  return hasRecursiveRm(normalized) || DANGEROUS_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function dangerousCommandReason(command: string): string {
  if (!isDangerousCommand(command)) return "Command is not classified as dangerous.";
  return "Command matches pi-devkit guardrails for destructive or privilege-sensitive shell operations.";
}
