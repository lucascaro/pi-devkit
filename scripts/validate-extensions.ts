import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fail } from "./validation-lib.ts";

const root = "extensions";

// Read declared extension paths from package.json
const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
  pi?: Record<string, string[]>;
};
const extPaths = pkg.pi?.extensions ?? [];

if (extPaths.length === 0) {
  console.log("No extension paths declared in package.json — skipping extension validation");
  process.exit(0);
}

// Resolve actual extension directories
const extDirs: string[] = [];
for (const relPath of extPaths) {
  const absPath = join(process.cwd(), relPath);
  if (!statSync(absPath).isDirectory()) {
    fail(`Extension path "${relPath}" is not a directory`);
  }
  for (const entry of readdirSync(absPath)) {
    const entryPath = join(absPath, entry);
    if (statSync(entryPath).isDirectory()) {
      extDirs.push(entryPath);
    }
  }
}

if (extDirs.length === 0) {
  console.log("No extension directories found — nothing to validate");
  process.exit(0);
}

const extensions: Array<{ name: string; ok: boolean; errors: string[] }> = [];

for (const dir of extDirs) {
  const name = dir.split("/").pop() ?? "unknown";
  const errors: string[] = [];
  const indexPath = join(dir, "index.ts");

  // Check index.ts exists
  if (!readFileSync(indexPath, "utf8").trim()) {
    errors.push("index.ts is missing or empty");
  }

  // Check that the source contains a default export
  const source = readFileSync(indexPath, "utf8");
  if (!/export\s+default\s+function/.test(source) && !/export\s+default\s+\(/.test(source)) {
    errors.push("index.ts does not have a default export");
  }

  // Check that the function accepts an api parameter (heuristic: looks for (pi: or (api: or (ctx:)
  if (/export\s+default\s+function/.test(source) && !/\(\s*(pi|api|ctx|agent)\s*:?/.test(source)) {
    errors.push("default function does not appear to accept an API parameter");
  }

  extensions.push({ name, ok: errors.length === 0, errors });
}

let totalErrors = 0;
for (const ext of extensions) {
  if (ext.ok) {
    console.log(`  ✓ ${ext.name}`);
  } else {
    for (const err of ext.errors) {
      console.error(`  ✗ ${ext.name}: ${err}`);
      totalErrors++;
    }
  }
}

if (totalErrors > 0) {
  fail(`${totalErrors} extension validation error(s) found`);
}

console.log(`Validated ${extensions.length} extension(s)`);
