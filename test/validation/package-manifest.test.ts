import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("package manifest", () => {
  it("declares a Pi package manifest", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect(pkg.keywords).toContain("pi-package");
    expect(pkg.workspaces).toEqual(["packages/*"]);
    expect(pkg.pi).toEqual({
      extensions: [
        "./packages/ambiguity-detection/extensions",
        "./packages/anti-people-pleasing/extensions",
        "./packages/ask-question/extensions",
        "./packages/guardrails/extensions",
        "./packages/hello/extensions",
        "./packages/input-bell/extensions",
        "./packages/model-router/extensions",
        "./packages/subagent/extensions"
      ],
      skills: ["./skills"],
      prompts: ["./prompts", "./packages/subagent/extensions/subagent/workflows"],
      themes: ["./themes"]
    });
  });
});
