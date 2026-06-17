import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("package manifest", () => {
  it("declares a Pi package manifest", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect(pkg.keywords).toContain("pi-package");
    expect(pkg.pi).toEqual({
      extensions: ["./extensions"],
      skills: ["./skills"],
      prompts: ["./prompts"],
      themes: ["./themes"]
    });
  });
});
