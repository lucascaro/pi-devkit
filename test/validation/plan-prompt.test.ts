import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const prompt = readFileSync("prompts/plan.md", "utf8");
const lowerPrompt = prompt.toLowerCase();

describe("plan prompt template", () => {
  it("stays generic instead of Pi-package-specific", () => {
    expect(prompt).toContain("$ARGUMENTS");
    expect(lowerPrompt).toContain("create an implementation plan");
    expect(lowerPrompt).not.toContain("pi resource type");
    expect(lowerPrompt).not.toContain("extension, skill, prompt, theme");
  });

  it("requires an early evaluation step", () => {
    expect(lowerPrompt).toContain("start with an evaluation");
    expect(lowerPrompt).toContain("scope: small, medium, or large");
    expect(lowerPrompt).toContain("risk: low, medium, or high");
    expect(lowerPrompt).toContain("unknowns");
    expect(lowerPrompt).toContain("plan depth");
  });

  it("supports lightweight and full planning paths", () => {
    expect(lowerPrompt).toContain("use a lightweight plan");
    expect(lowerPrompt).toContain("small, localized, and low-risk");
    expect(lowerPrompt).toContain("use a full plan");
    expect(lowerPrompt).toContain("cross-cutting");
  });

  it("requires refinement and explicit approval before implementation", () => {
    expect(lowerPrompt).toContain("ask for feedback");
    expect(lowerPrompt).toContain("refine the plan until the user explicitly accepts it");
    expect(lowerPrompt).toContain("do not start implementation until");
    expect(prompt).toContain('"approved"');
    expect(prompt).toContain('"implement"');
  });
});
