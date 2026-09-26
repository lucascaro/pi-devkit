import { describe, expect, it, vi } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import subagentExtension from "../../../packages/subagent/extensions/subagent/index.ts";

function mockPi() {
  return {
    registerTool: vi.fn(),
    registerCommand: vi.fn(),
    on: vi.fn(),
  } as unknown as ExtensionAPI & {
    registerTool: ReturnType<typeof vi.fn>;
    registerCommand: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
  };
}

describe("subagent extension registration", () => {
  it("registers the subagent tool", () => {
    const pi = mockPi();
    subagentExtension(pi);
    expect(pi.registerTool).toHaveBeenCalledTimes(1);
    const tool = pi.registerTool.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(tool.name).toBe("subagent");
    expect(tool.label).toBe("Subagent");
    expect(typeof tool.description).toBe("string");
    expect(tool.parameters).toBeDefined();
    expect(typeof tool.execute).toBe("function");
    expect(typeof tool.renderCall).toBe("function");
    expect(typeof tool.renderResult).toBe("function");
  });

  it("registers the subagent-list command", () => {
    const pi = mockPi();
    subagentExtension(pi);
    expect(pi.registerCommand).toHaveBeenCalledWith("subagent-list", expect.objectContaining({ description: expect.any(String) }));
  });
});
