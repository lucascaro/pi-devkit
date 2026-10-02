import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import {
  makeTempProject,
  runTypeScriptScript,
  writeJson,
  writeText,
} from "./script-test-utils.ts";

let project: string;

beforeEach(() => {
  project = makeTempProject("catalog-generator-");
  writeJson(project, "package.json", {
    name: "@fixture/catalog",
    pi: {
      extensions: ["./packages/demo/extensions"],
      skills: ["./skills"],
      prompts: ["./prompts"],
      themes: ["./themes"],
    },
  });
  writeJson(project, "packages/demo/package.json", { description: "Workspace description" });
  writeText(
    project,
    "packages/demo/extensions/demo/index.ts",
    'export const manifest = {\n  description: "Source description"\n};\n',
  );
  writeText(project, "skills/demo/SKILL.md", "---\nname: demo-skill\ndescription: Skill description\n---\nBody\n");
  writeText(project, "prompts/review.md", "---\nname: review\ndescription: Review description\n---\nBody\n");
  writeJson(project, "themes/dark.json", {
    name: "Dark",
    vars: { background: "#000", foreground: "#fff" },
    colors: { accent: "#f00" },
  });
  writeText(project, "themes/broken.json", "not json");
});

afterEach(() => {
  rmSync(project, { recursive: true, force: true });
});

describe("generate-catalog CLI", () => {
  it("falls back to source metadata and skips missing resource directories", () => {
    rmSync(`${project}/packages/demo/package.json`);
    writeJson(project, "package.json", {
      name: "@fixture/catalog",
      pi: {
        extensions: ["./packages/demo/extensions"],
        skills: ["./missing-skills"],
        themes: ["./missing-themes"],
      },
    });

    const result = runTypeScriptScript("scripts/generate-catalog.ts", project);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Source description");
    expect(result.stdout).toContain("## Skills");
    expect(result.stdout).not.toContain("./missing-skills");
    expect(result.stdout).not.toContain("./missing-themes");
    expect(result.stdout).not.toContain("Workspace description");
  });

  it("renders catalog entries from extension, skill, prompt, and theme resources", () => {
    const result = runTypeScriptScript("scripts/generate-catalog.ts", project);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("# catalog");
    expect(result.stdout).toContain("Workspace description");
    expect(result.stdout).toContain("| demo | `./skills/demo` | Skill description |");
    expect(result.stdout).toContain("review");
    expect(result.stdout).toContain("Review description");
    expect(result.stdout).toContain("Dark");
    expect(result.stdout).toContain("2 vars, 1 colors");
    expect(result.stdout).not.toContain("broken");
  });
});
