const DANGEROUS_PATTERNS: RegExp[] = [
  /(^|\s)rm\s+(-[A-Za-z]*r[A-Za-z]*f|-f[A-Za-z]*r|-[A-Za-z]*R[A-Za-z]*f)\b/,
  /(^|\s)sudo\b/,
  /(^|\s)git\s+reset\s+--hard\b/,
  /(^|\s)git\s+push\b.*\s--force(?:-with-lease)?\b/,
  /(^|\s)chmod\s+-R\s+777\b/,
  /(^|\s)chown\s+-R\b/,
  /(^|\s)dd\s+\b.*\bof=\/dev\//,
  /(^|\s)mkfs(?:\.[A-Za-z0-9_-]+)?\b/,
  /(^|\s)docker\s+system\s+prune\b.*\s-a\b/,
  /(^|\s)kubectl\s+delete\b/,
  /DROP\s+TABLE\b/i,
  /TRUNCATE\s+TABLE\b/i
];

export function isDangerousCommand(command: string): boolean {
  const normalized = command.replace(/\\\n/g, " ").replace(/\s+/g, " ").trim();
  return DANGEROUS_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function dangerousCommandReason(command: string): string {
  if (!isDangerousCommand(command)) return "Command is not classified as dangerous.";
  return "Command matches pi-devkit guardrails for destructive or privilege-sensitive shell operations.";
}
