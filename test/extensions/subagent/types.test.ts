import { describe, expect, it } from "vitest";
import {
  emptyUsage,
  getFinalOutput,
  isFailedResult,
  type AgentResult,
  type Message,
} from "../../../packages/subagent/extensions/subagent/types.ts";
import { formatTokens, formatUsageStats } from "../../../packages/subagent/extensions/subagent/render.ts";

function assistantMessage(text: string, overrides: Partial<Extract<Message, { role: "assistant" }>> = {}): Message {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "claude-test",
    usage: { input: 10, output: 20, cacheRead: 0, cacheWrite: 0, totalTokens: 30, cost: { input: 0.001, output: 0.002, cacheRead: 0, cacheWrite: 0, total: 0.003 } },
    stopReason: "end",
    timestamp: Date.now(),
    ...overrides,
  } as Message;
}

describe("getFinalOutput", () => {
  it("returns the last assistant text", () => {
    const messages: Message[] = [
      { role: "user", content: "hi", timestamp: 1 },
      assistantMessage("first"),
      { role: "user", content: "again", timestamp: 2 },
      assistantMessage("second"),
    ];
    expect(getFinalOutput(messages)).toBe("second");
  });

  it("returns empty string when no assistant messages", () => {
    expect(getFinalOutput([])).toBe("");
    expect(getFinalOutput([{ role: "user", content: "hi", timestamp: 1 }])).toBe("");
  });

  it("skips assistant messages with no text content", () => {
    const toolCallOnly = assistantMessage("", {
      content: [{ type: "toolCall", id: "1", name: "bash", arguments: { command: "ls" } }] as never,
    });
    expect(getFinalOutput([toolCallOnly])).toBe("");
  });
});

describe("isFailedResult", () => {
  const base: AgentResult = {
    agent: "test",
    task: "task",
    exitCode: 0,
    messages: [],
    usage: emptyUsage(),
    backend: "sdk",
  };

  it("is false for a clean result", () => {
    expect(isFailedResult(base)).toBe(false);
  });

  it("is true for non-zero exit code", () => {
    expect(isFailedResult({ ...base, exitCode: 1 })).toBe(true);
  });

  it("is true for error stop reason", () => {
    expect(isFailedResult({ ...base, stopReason: "error" })).toBe(true);
  });

  it("is true for aborted stop reason", () => {
    expect(isFailedResult({ ...base, stopReason: "aborted" })).toBe(true);
  });
});

describe("formatTokens", () => {
  it("formats small counts as-is", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(999)).toBe("999");
  });
  it("formats thousands with one decimal", () => {
    expect(formatTokens(1500)).toBe("1.5k");
  });
  it("formats large thousands rounded", () => {
    expect(formatTokens(12345)).toBe("12k");
  });
  it("formats millions", () => {
    expect(formatTokens(2_500_000)).toBe("2.5M");
  });
});

describe("formatUsageStats", () => {
  it("includes turns, tokens, cost, and model", () => {
    const s = formatUsageStats(
      { input: 100, output: 200, cacheRead: 0, cacheWrite: 0, cost: 0.0001, contextTokens: 300, turns: 2 },
      "claude-test",
    );
    expect(s).toContain("2 turns");
    expect(s).toContain("claude-test");
    expect(s).toContain("$0.0001");
  });

  it("omits zero fields", () => {
    const s = formatUsageStats({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 });
    expect(s).toBe("");
  });
});
