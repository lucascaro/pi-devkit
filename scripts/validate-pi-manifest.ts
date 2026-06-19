import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fail } from "./validation-lib.ts";

const pkg = JSON.parse(
  readFileSync("package.json", "utf8")
) as { pi?: Record<string, string[]> };

if (!pkg.pi) {
  console.log("No 'pi' key in package.json — skipping manifest validation");
  process.exit(0);
}

let errors: string[] = [];

for (const [field, paths] of Object.entries(pkg.pi)) {
  for (const relPath of paths) {
    const absPath = join(process.cwd(), relPath);
    if (!existsSync(absPath)) {
      errors.push(`${field}: path "${relPath}" does not exist`);
      continue;
    }
    const entries = readdirSync(absPath);
    if (entries.length === 0) {
      errors.push(`${field}: path "${relPath}" is empty`);
    }
  }
}

if (errors.length > 0) {
  for (const e of errors) console.error(`ERROR: ${e}`);
  fail("package.json 'pi' paths are invalid");
}

console.log(`Validated ${Object.keys(pkg.pi).length} resource directory(ies)`);
