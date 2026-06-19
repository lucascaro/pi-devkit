import { existsSync } from "node:fs";
import { join } from "node:path";
import { fail, parseFrontmatter, walkFiles } from "./validation-lib.ts";

const root = "skills";
if (!existsSync(root)) fail("skills/ directory is missing");

const skillFiles = walkFiles(root, (path) => path.endsWith("SKILL.md"));
if (skillFiles.length === 0) fail("No skills found");

const namePattern = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

for (const file of skillFiles) {
  const fm = parseFrontmatter(file);
  if (!fm.name) fail(`${file}: missing name`);
  if (!namePattern.test(fm.name) || fm.name.includes("--")) fail(`${file}: invalid skill name ${fm.name}`);
  if (!fm.description) fail(`${file}: missing description`);
  if (fm.description.length > 1024) fail(`${file}: description exceeds 1024 chars`);
  if (fm.description.length < 20) fail(`${file}: description is too vague (minimum 20 chars)`);
}

console.log(`Validated ${skillFiles.length} skill(s)`);
