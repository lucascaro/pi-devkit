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

  it("requires understanding and clarification before planning", () => {
    expect(lowerPrompt).toContain("understand the request before planning");
    expect(lowerPrompt).toContain("restate what the user is asking for");
    expect(lowerPrompt).toContain("identify ambiguities, missing facts, and assumptions");
    expect(lowerPrompt).toContain("call out anything that is not clear");
    expect(lowerPrompt).toContain("assumptions as risky until validated");
  });

  it("stops to clarify material ambiguities before showing a plan", () => {
    expect(lowerPrompt).toContain("could materially change scope");
    expect(lowerPrompt).toContain("implementation approach");
    expect(lowerPrompt).toContain("acceptance criteria");
    expect(lowerPrompt).toContain("stop before showing a plan");
    expect(lowerPrompt).toContain("ask targeted clarifying questions");
    expect(lowerPrompt).toContain("remaining assumptions are low-risk");
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

  it("asks for an explicit next action after showing the plan", () => {
    expect(lowerPrompt).toContain("ask what the user wants to do next");
    expect(lowerPrompt).toContain("accept and implement the plan");
    expect(lowerPrompt).toContain("edit or refine part of the plan");
    expect(lowerPrompt).toContain("continue discussing or chatting without implementing");
  });

  it("requires refinement and explicit approval before implementation", () => {
    expect(lowerPrompt).toContain("if the user chooses to edit or refine, update the plan and ask again");
    expect(lowerPrompt).toContain("keep the implementation gate closed");
    expect(lowerPrompt).toContain("do not start implementation until");
    expect(prompt).toContain('"approved"');
    expect(prompt).toContain('"accept"');
    expect(prompt).toContain('"implement"');
  });
});
