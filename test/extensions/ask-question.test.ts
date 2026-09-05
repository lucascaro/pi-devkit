import { describe, expect, it, vi } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import askQuestionExtension from "../../extensions/ask-question/index.ts";

function mockPi(): ExtensionAPI & {
  registerTool: ReturnType<typeof vi.fn>;
} {
  return {
    registerTool: vi.fn(),
    registerCommand: vi.fn(),
    on: vi.fn(),
  } as unknown as ExtensionAPI & {
    registerTool: ReturnType<typeof vi.fn>;
  };
}

describe("ask-question extension", () => {
  it("registers the ask_question tool", () => {
    const pi = mockPi();
    askQuestionExtension(pi);
    expect(pi.registerTool).toHaveBeenCalledTimes(1);
    expect(pi.registerTool.mock.calls[0]?.[0]).toMatchObject({
      name: "ask_question",
      label: "Ask Question",
    });
  });

  it("registers with correct schema", () => {
    const pi = mockPi();
    askQuestionExtension(pi);
    const toolDef = pi.registerTool.mock.calls[0]?.[0] as Record<string, unknown>;

    expect(toolDef.name).toBe("ask_question");
    const params = toolDef.parameters as Record<string, unknown>;
    expect(params).toBeDefined();
    expect(params.type).toBe("object");
    expect((params.properties as Record<string, unknown>)?.question).toBeDefined();
    expect((params.properties as Record<string, unknown>)?.options).toBeDefined();
  });

  it("includes promptSnippet and promptGuidelines", () => {
    const pi = mockPi();
    askQuestionExtension(pi);
    const toolDef = pi.registerTool.mock.calls[0]?.[0] as Record<string, unknown>;

    expect(toolDef.promptSnippet).toBe(
      "Ask the user a question with numbered options. Use when you need user input or confirmation to proceed.",
    );
    const guidelines = toolDef.promptGuidelines as unknown[];
    expect(Array.isArray(guidelines)).toBe(true);
    expect(guidelines.length).toBeGreaterThan(0);
  });

  it("sets executionMode to sequential", () => {
    const pi = mockPi();
    askQuestionExtension(pi);
    const toolDef = pi.registerTool.mock.calls[0]?.[0] as Record<string, unknown>;

    expect(toolDef.executionMode).toBe("sequential");
  });

  it("includes renderCall and renderResult", () => {
    const pi = mockPi();
    askQuestionExtension(pi);
    const toolDef = pi.registerTool.mock.calls[0]?.[0] as Record<string, unknown>;

    expect(typeof toolDef.renderCall).toBe("function");
    expect(typeof toolDef.renderResult).toBe("function");
  });
});
