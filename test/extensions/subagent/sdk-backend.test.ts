import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Model } from "@earendil-works/pi-ai";
import type { AgentSession, ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { AgentDefinition, Message } from "../../../packages/subagent/extensions/subagent/types.ts";

const mocks = vi.hoisted(() => ({
  createRuntime: vi.fn(),
  createAgentSession: vi.fn(),
  resolveCliModel: vi.fn(),
}));

vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@earendil-works/pi-coding-agent")>();
  return {
    ...actual,
    ModelRuntime: { create: mocks.createRuntime },
    createAgentSession: mocks.createAgentSession,
    resolveCliModel: mocks.resolveCliModel,
  };
});

import { SDKBackend } from "../../../packages/subagent/extensions/subagent/backends/sdk-backend.ts";

let tempDir: string;
let previousAgentDir: string | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  tempDir = mkdtempSync(join(tmpdir(), "sdk-backend-model-"));
  mkdirSync(join(tempDir, "project"), { recursive: true });
  previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = join(tempDir, "agent");

  mocks.createRuntime.mockResolvedValue({} as ModelRuntime);
  mocks.createAgentSession.mockRejectedValue(new Error("session creation sentinel"));
  mocks.resolveCliModel.mockReturnValue({ model: undefined, error: "no match" });
});

afterEach(() => {
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  rmSync(tempDir, { recursive: true, force: true });
});

function makeDefinition(overrides: Partial<AgentDefinition> = {}): AgentDefinition {
  return {
    name: "scout",
    description: "Scout",
    model: "router:low",
    systemPrompt: "You are a scout.",
    source: "user",
    filePath: join(tempDir, "scout.md"),
    ...overrides,
  };
}

function makeSession(messages: Message[]) {
  const listeners: Array<(event: { type: string; message: Message }) => void> = [];
  const unsubscribe = vi.fn(() => {
    listeners.length = 0;
  });
  const prompt = vi.fn(async () => {});
  const abort = vi.fn(async () => {});
  const dispose = vi.fn();
  const session = {
    messages,
    subscribe: vi.fn((listener: (event: { type: string; message: Message }) => void) => {
      listeners.push(listener);
      return unsubscribe;
    }),
    prompt,
    abort,
    dispose,
  } as unknown as AgentSession;

  return {
    session,
    prompt,
    abort,
    dispose,
    unsubscribe,
    emit(message: Message) {
      for (const listener of listeners) listener({ type: "message_end", message });
    },
  };
}

function makeAbortSignal(initiallyAborted = false) {
  let aborted = initiallyAborted;
  let handler: (() => void) | undefined;
  const addEventListener = vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
    handler = typeof listener === "function" ? listener as () => void : () => listener.handleEvent(new Event("abort"));
  });
  const removeEventListener = vi.fn();
  const signal = {
    get aborted() {
      return aborted;
    },
    addEventListener,
    removeEventListener,
  } as unknown as AbortSignal;

  return {
    signal,
    addEventListener,
    removeEventListener,
    abort() {
      aborted = true;
      handler?.();
    },
  };
}

describe("SDKBackend execution", () => {
  const parentModel = { id: "parent-model", provider: "test" } as Model<any>;

  it("uses the parent model when router config is missing", async () => {
    const backend = new SDKBackend();

    const result = await backend.execute(makeDefinition(), "Inspect the project", {
      cwd: join(tempDir, "project"),
      parentModel,
      projectTrusted: false,
    });

    expect(mocks.resolveCliModel).not.toHaveBeenCalled();
    expect(mocks.createAgentSession).toHaveBeenCalledWith(
      expect.objectContaining({ model: parentModel }),
    );
    expect(result.errorMessage).toBe("Failed to create session: session creation sentinel");
  });

  it("uses a configured router model before resolving it in the runtime", async () => {
    mkdirSync(join(tempDir, "agent"), { recursive: true });
    writeFileSync(
      join(tempDir, "agent", "model-router.json"),
      JSON.stringify({ profiles: { default: { low: { model: "provider/fast" } } } }),
    );
    mocks.resolveCliModel.mockReturnValue({ model: parentModel, thinkingLevel: "low" });

    const result = await new SDKBackend().execute(makeDefinition(), "Inspect the project", {
      cwd: join(tempDir, "project"),
      projectTrusted: false,
    });

    expect(mocks.resolveCliModel).toHaveBeenCalledWith({
      cliModel: "provider/fast",
      modelRuntime: expect.anything(),
    });
    expect(mocks.createAgentSession).toHaveBeenCalledWith(
      expect.objectContaining({ model: parentModel, thinkingLevel: "low" }),
    );
    expect(result.errorMessage).toBe("Failed to create session: session creation sentinel");
  });

  it("returns a model-resolution error for an unavailable explicit model", async () => {
    const result = await new SDKBackend().execute(
      makeDefinition({ model: "provider/missing" }),
      "Inspect the project",
      { cwd: join(tempDir, "project") },
    );

    expect(mocks.resolveCliModel).toHaveBeenCalledWith({
      cliModel: "provider/missing",
      modelRuntime: expect.anything(),
    });
    expect(result.exitCode).toBe(1);
    expect(result.errorMessage).toContain('Model "provider/missing" not available');
    expect(mocks.createAgentSession).not.toHaveBeenCalled();
  });

  it("returns a no-model error when neither a route nor parent model is available", async () => {
    const result = await new SDKBackend().execute(
      makeDefinition(),
      "Inspect the project",
      { cwd: join(tempDir, "project") },
    );

    expect(mocks.resolveCliModel).not.toHaveBeenCalled();
    expect(result.exitCode).toBe(1);
    expect(result.errorMessage).toContain("No model available");
    expect(mocks.createAgentSession).not.toHaveBeenCalled();
  });

  it("filters non-standard messages and accumulates assistant usage", async () => {
    const userMessage = {
      role: "user",
      content: [{ type: "text", text: "Inspect the project" }],
      timestamp: 1,
    } as Message;
    const assistantMessage = {
      role: "assistant",
      content: [{ type: "text", text: "Found the entry point." }],
      api: "test-api",
      provider: "test-provider",
      model: "parent-model",
      usage: {
        input: 4,
        output: 5,
        cacheRead: 1,
        cacheWrite: 2,
        totalTokens: 10,
        cost: { input: 0.1, output: 0.2, cacheRead: 0, cacheWrite: 0, total: 0.3 },
      },
      stopReason: "stop",
      timestamp: 2,
    } as Message;
    const customMessage = { role: "custom-agent-event", content: [] } as unknown as Message;
    const fake = makeSession([userMessage, assistantMessage, customMessage]);
    fake.prompt.mockImplementation(async () => {
      fake.emit(userMessage);
      fake.emit(assistantMessage);
      fake.emit(customMessage);
    });
    mocks.createAgentSession.mockResolvedValue({ session: fake.session });
    const onUpdate = vi.fn();

    const result = await new SDKBackend().execute(makeDefinition(), "Inspect the project", {
      cwd: join(tempDir, "project"),
      parentModel,
      onUpdate,
    });

    expect(result.exitCode).toBe(0);
    expect(result.messages).toEqual([userMessage, assistantMessage]);
    expect(result.usage).toEqual({
      input: 4,
      output: 5,
      cacheRead: 1,
      cacheWrite: 2,
      cost: 0.3,
      contextTokens: 10,
      turns: 1,
    });
    expect(onUpdate).toHaveBeenCalledTimes(2);
    expect(fake.unsubscribe).toHaveBeenCalledOnce();
    expect(fake.dispose).toHaveBeenCalledOnce();
  });

  it("reports prompt errors and still cleans up the session", async () => {
    const fake = makeSession([]);
    fake.prompt.mockRejectedValue(new Error("provider failed"));
    mocks.createAgentSession.mockResolvedValue({ session: fake.session });

    const result = await new SDKBackend().execute(makeDefinition(), "Inspect the project", {
      cwd: join(tempDir, "project"),
      parentModel,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stopReason).toBe("error");
    expect(result.errorMessage).toBe("provider failed");
    expect(fake.unsubscribe).toHaveBeenCalledOnce();
    expect(fake.dispose).toHaveBeenCalledOnce();
  });

  it("aborts an active session and removes the signal listener", async () => {
    const fake = makeSession([]);
    const control = makeAbortSignal();
    fake.prompt.mockImplementation(async () => {
      control.abort();
      throw new Error("prompt interrupted");
    });
    mocks.createAgentSession.mockResolvedValue({ session: fake.session });

    const result = await new SDKBackend().execute(makeDefinition(), "Inspect the project", {
      cwd: join(tempDir, "project"),
      parentModel,
      signal: control.signal,
    });

    expect(fake.abort).toHaveBeenCalledOnce();
    expect(control.addEventListener).toHaveBeenCalledOnce();
    expect(control.removeEventListener).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(fake.unsubscribe).toHaveBeenCalledOnce();
    expect(fake.dispose).toHaveBeenCalledOnce();
    expect(result.exitCode).toBe(1);
    expect(result.stopReason).toBe("aborted");
    expect(result.errorMessage).toBe("Subagent was aborted");
  });

  it("aborts a session when the signal is already aborted", async () => {
    const fake = makeSession([]);
    fake.prompt.mockRejectedValue(new Error("already aborted"));
    mocks.createAgentSession.mockResolvedValue({ session: fake.session });
    const control = makeAbortSignal(true);

    const result = await new SDKBackend().execute(makeDefinition(), "Inspect the project", {
      cwd: join(tempDir, "project"),
      parentModel,
      signal: control.signal,
    });

    expect(fake.abort).toHaveBeenCalledOnce();
    expect(control.addEventListener).not.toHaveBeenCalled();
    expect(control.removeEventListener).not.toHaveBeenCalled();
    expect(result.exitCode).toBe(1);
    expect(result.stopReason).toBe("aborted");
  });
});
