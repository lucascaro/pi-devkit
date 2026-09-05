import { describe, expect, it, vi } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import helloExtension from "../../extensions/hello/index.ts";
import guardrailsExtension from "../../extensions/guardrails/index.ts";
import inputBellExtension from "../../extensions/input-bell/index.ts";

function mockPi(): ExtensionAPI & { registerTool: ReturnType<typeof vi.fn>; registerCommand: ReturnType<typeof vi.fn>; on: ReturnType<typeof vi.fn> } {
  return {
    registerTool: vi.fn(),
    registerCommand: vi.fn(),
    on: vi.fn()
  } as unknown as ExtensionAPI & { registerTool: ReturnType<typeof vi.fn>; registerCommand: ReturnType<typeof vi.fn>; on: ReturnType<typeof vi.fn> };
}

describe("extension registration", () => {
  it("registers the hello tool", () => {
    const pi = mockPi();
    helloExtension(pi);
    expect(pi.registerTool).toHaveBeenCalledTimes(1);
    expect(pi.registerTool.mock.calls[0]?.[0]).toMatchObject({ name: "hello", label: "Hello" });
  });

  it("registers guardrail hook and command", () => {
    const pi = mockPi();
    guardrailsExtension(pi);
    expect(pi.on).toHaveBeenCalledWith("tool_call", expect.any(Function));
    expect(pi.registerCommand).toHaveBeenCalledWith("guardrails", expect.objectContaining({ description: expect.any(String) }));
  });

  it("registers input-bell event handlers and status command", () => {
    const pi = mockPi();
    inputBellExtension(pi);
    expect(pi.on).toHaveBeenCalledWith("agent_settled", expect.any(Function));
    expect(pi.on).toHaveBeenCalledWith("ui_prompt_start", expect.any(Function));
    expect(pi.registerCommand).toHaveBeenCalledWith("input-bell", expect.objectContaining({ description: expect.any(String) }));
  });
});
