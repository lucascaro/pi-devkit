import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export function walkFiles(root: string, predicate: (path: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...walkFiles(path, predicate));
    else if (predicate(path)) out.push(path);
  }
  return out;
}

export function parseFrontmatter(file: string): Record<string, string> {
  const text = readFileSync(file, "utf8");
  if (!text.startsWith("---\n")) return {};
  const end = text.indexOf("\n---", 4);
  if (end === -1) return {};
  const raw = text.slice(4, end).trim();
  const result: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const match = /^(?<key>[A-Za-z0-9_-]+):\s*(?<value>.*)$/.exec(line);
    const key = match?.groups?.key;
    const value = match?.groups?.value;
    if (!key || value === undefined) continue;
    result[key] = value.replace(/^['\"]|['\"]$/g, "");
  }
  return result;
}

export function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
