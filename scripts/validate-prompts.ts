import { existsSync, readFileSync } from "node:fs";
import { fail, parseFrontmatter, walkFiles } from "./validation-lib.ts";

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
  pi?: { prompts?: string[] };
};

const promptDirs = pkg.pi?.prompts ?? [];
if (promptDirs.length === 0) fail("No prompt directories declared in package.json pi.prompts");

const promptFiles: string[] = [];
for (const dir of promptDirs) {
  const root = dir.replace(/^\.\//, "");
  if (!existsSync(root)) fail(`Prompt directory "${root}" is declared in the manifest but does not exist`);
  promptFiles.push(...walkFiles(root, (path) => path.endsWith(".md")));
}

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
