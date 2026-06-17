import { existsSync } from "node:fs";
import { fail, parseFrontmatter, walkFiles } from "./validation-lib.ts";

const root = "prompts";
if (!existsSync(root)) fail("prompts/ directory is missing");

const promptFiles = walkFiles(root, (path) => path.endsWith(".md"));
if (promptFiles.length === 0) fail("No prompts found");

for (const file of promptFiles) {
  const fm = parseFrontmatter(file);
  if (!fm.description) fail(`${file}: missing description`);
  if (fm.description.length < 20) fail(`${file}: description is too vague`);
  if (fm["argument-hint"] && !/[<[].+[>\]]/.test(fm["argument-hint"])) {
    fail(`${file}: argument-hint should use <required> or [optional] notation`);
  }
}

console.log(`Validated ${promptFiles.length} prompt template(s)`);
