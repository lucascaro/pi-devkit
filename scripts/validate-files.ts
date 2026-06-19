import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fail } from "./validation-lib.ts";

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
  files?: (string | { src: string; dest: string })[];
};

if (!pkg.files || pkg.files.length === 0) {
  console.log("No 'files' declared in package.json — nothing to validate");
  process.exit(0);
}

let errors: string[] = [];

for (const entry of pkg.files) {
  if (typeof entry === "string") {
    const absPath = join(process.cwd(), entry);
    if (!existsSync(absPath)) {
      errors.push(`file "${entry}" does not exist`);
    }
  } else if (typeof entry === "object" && entry !== null && "src" in entry) {
    const absPath = join(process.cwd(), entry.src);
    if (!existsSync(absPath)) {
      errors.push(`file "${entry.src}" (src → ${entry.dest}) does not exist`);
    }
  }
}

if (errors.length > 0) {
  for (const e of errors) console.error(`ERROR: ${e}`);
  fail(`${errors.length} file(s) in package.json are missing`);
}

console.log(`Validated ${pkg.files.length} file(s)`);
