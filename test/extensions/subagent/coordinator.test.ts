import { describe, expect, it } from "vitest";
import { Coordinator } from "../../../packages/subagent/extensions/subagent/coordinator.ts";
import {
  emptyUsage,
  type AgentDefinition,
  type AgentResult,
  type Backend,
  type ExecuteOptions,
} from "../../../packages/subagent/extensions/subagent/types.ts";

function makeAgent(overrides: Partial<AgentDefinition> = {}): AgentDefinition {
  return {
    name: "test-agent",
    description: "test",
    systemPrompt: "You are a test agent.",
    source: "user",
    filePath: "/tmp/test.md",
    ...overrides,
  };
}

function makeResult(agent: string, overrides: Partial<AgentResult> = {}): AgentResult {
  return {
    agent,
    task: "task",
    exitCode: 0,
    messages: [],
    usage: emptyUsage(),
    backend: "sdk",
    ...overrides,
  };
}

/** A mock backend that records calls and returns a canned result. */
export type RecordingBackend = Backend & { calls: Array<{ agent: string; task: string }> };

function mockBackend(name: string, resultFor: (agent: string, task: string) => AgentResult): RecordingBackend {
  const calls: Array<{ agent: string; task: string }> = [];
  return {
    calls,
    async execute(def: AgentDefinition, task: string, _options: ExecuteOptions): Promise<AgentResult> {
      calls.push({ agent: def.name, task });
      return resultFor(def.name, task);
    },
  };
}

function makeCoordinator(opts: { sdk?: RecordingBackend; subprocess?: RecordingBackend; defaultBackend?: "sdk" | "subprocess" } = {}) {
  const sdk: RecordingBackend = opts.sdk ?? mockBackend("sdk", (a) => makeResult(a, { backend: "sdk" }));
  const subprocess: RecordingBackend = opts.subprocess ?? mockBackend("subprocess", (a) => makeResult(a, { backend: "subprocess" }));
  const coordinator = new Coordinator({
    defaultBackend: opts.defaultBackend ?? "sdk",
    sdk,
    subprocess,
  });
  return { coordinator, sdk, subprocess };
}

describe("Coordinator.single", () => {
  it("dispatches to the default (sdk) backend", async () => {
    const { coordinator, sdk } = makeCoordinator();
    const agents = new Map([["a", makeAgent({ name: "a" })]]);
    const results = await coordinator.dispatch({ mode: "single", agent: "a", task: "do it", agents, cwd: "/tmp" });
    expect(results).toHaveLength(1);
    expect(results[0]?.agent).toBe("a");
    expect(sdk.calls).toEqual([{ agent: "a", task: "do it" }]);
  });

  it("returns an error result for an unknown agent", async () => {
    const { coordinator } = makeCoordinator();
    const agents = new Map<string, AgentDefinition>([["a", makeAgent({ name: "a" })]]);
    const results = await coordinator.dispatch({ mode: "single", agent: "missing", task: "do it", agents, cwd: "/tmp" });
    expect(results[0]?.exitCode).toBe(1);
    expect(results[0]?.errorMessage).toContain("Unknown agent");
    expect(results[0]?.errorMessage).toContain('"a"');
  });
});

describe("Coordinator.backend selection", () => {
  it("uses subprocess when agent isolation is process", async () => {
    const { coordinator, sdk, subprocess } = makeCoordinator();
    const agents = new Map([["a", makeAgent({ name: "a", isolation: "process" })]]);
    await coordinator.dispatch({ mode: "single", agent: "a", task: "t", agents, cwd: "/tmp" });
    expect(sdk.calls).toHaveLength(0);
    expect(subprocess.calls).toHaveLength(1);
  });

  it("uses the agent's configured backend", async () => {
    const { coordinator, sdk, subprocess } = makeCoordinator();
    const agents = new Map([["a", makeAgent({ name: "a", backend: "subprocess" })]]);
    await coordinator.dispatch({ mode: "single", agent: "a", task: "t", agents, cwd: "/tmp" });
    expect(subprocess.calls).toHaveLength(1);
    expect(sdk.calls).toHaveLength(0);
  });

  it("honors a per-task backend override", async () => {
    const { coordinator, sdk, subprocess } = makeCoordinator();
    const agents = new Map([["a", makeAgent({ name: "a" })]]);
    await coordinator.dispatch({
      mode: "parallel",
      tasks: [{ agent: "a", task: "t", backend: "subprocess" }],
      agents,
      cwd: "/tmp",
    });
    expect(subprocess.calls).toHaveLength(1);
    expect(sdk.calls).toHaveLength(0);
  });

  it("passes project trust to the selected backend", async () => {
    let receivedTrust: boolean | undefined;
    const sdk: Backend = {
      async execute(def, _task, options) {
        receivedTrust = options.projectTrusted;
        return makeResult(def.name);
      },
    };
    const coordinator = new Coordinator({ sdk, subprocess: mockBackend("subprocess", (a) => makeResult(a)) });
    const agents = new Map([["a", makeAgent({ name: "a" })]]);

    await coordinator.dispatch({
      mode: "single",
      agent: "a",
      task: "t",
      agents,
      cwd: "/tmp",
      projectTrusted: false,
    });

    expect(receivedTrust).toBe(false);
  });
});

describe("Coordinator.parallel", () => {
  it("dispatches all tasks", async () => {
    const { coordinator, sdk } = makeCoordinator();
    const agents = new Map([
      ["a", makeAgent({ name: "a" })],
      ["b", makeAgent({ name: "b" })],
    ]);
    const results = await coordinator.dispatch({
      mode: "parallel",
      tasks: [
        { agent: "a", task: "ta" },
        { agent: "b", task: "tb" },
      ],
      agents,
      cwd: "/tmp",
    });
    expect(results).toHaveLength(2);
    expect(sdk.calls).toHaveLength(2);
  });

  it("does not carry project trust to tasks in another working directory", async () => {
    const received: Array<{ cwd: string; projectTrusted: boolean | undefined }> = [];
    const sdk: Backend = {
      async execute(def, _task, options) {
        received.push({ cwd: options.cwd, projectTrusted: options.projectTrusted });
        return makeResult(def.name);
      },
    };
    const coordinator = new Coordinator({ sdk, subprocess: mockBackend("subprocess", (a) => makeResult(a)) });
    const agents = new Map([["a", makeAgent({ name: "a" })]]);

    await coordinator.dispatch({
      mode: "parallel",
      tasks: [
        { agent: "a", task: "same project", cwd: "/tmp/project" },
        { agent: "a", task: "other checkout", cwd: "/tmp/other" },
      ],
      agents,
      cwd: "/tmp/project",
      projectTrusted: true,
    });

    expect(received).toEqual([
      { cwd: "/tmp/project", projectTrusted: true },
      { cwd: "/tmp/other", projectTrusted: false },
    ]);
  });

  it("rejects too many tasks", async () => {
    const { coordinator } = makeCoordinator();
    const agents = new Map([["a", makeAgent({ name: "a" })]]);
    const results = await coordinator.dispatch({
      mode: "parallel",
      tasks: Array.from({ length: 10 }, (_, i) => ({ agent: "a", task: `t${i}` })),
      agents,
      cwd: "/tmp",
      maxTasks: 8,
    });
    expect(results).toHaveLength(1);
    expect(results[0]?.errorMessage).toContain("Too many parallel tasks");
  });
});

describe("Coordinator.chain", () => {
  it("substitutes {previous} with the prior step's output", async () => {
    const { coordinator, sdk } = makeCoordinator({
      sdk: mockBackend("sdk", (agent, task) =>
        makeResult(agent, {
          messages: [
            {
              role: "assistant",
              content: [{ type: "text", text: `output-from-${agent}` }],
              api: "anthropic-messages",
              provider: "anthropic",
              model: "m",
              usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
              stopReason: "end",
              timestamp: 1,
            } as never,
          ],
        }),
      ),
    });
    const agents = new Map([
      ["scout", makeAgent({ name: "scout" })],
      ["planner", makeAgent({ name: "planner" })],
    ]);
    const results = await coordinator.dispatch({
      mode: "chain",
      chain: [
        { agent: "scout", task: "find stuff" },
        { agent: "planner", task: "plan based on {previous}" },
      ],
      agents,
      cwd: "/tmp",
    });
    expect(results).toHaveLength(2);
    // The planner's task should have received the scout's output.
    const plannerCall = sdk.calls.find((c) => c.agent === "planner");
    expect(plannerCall?.task).toBe("plan based on output-from-scout");
    // Steps are 1-indexed.
    expect(results[0]?.step).toBe(1);
    expect(results[1]?.step).toBe(2);
  });

  it("stops at the first failing step", async () => {
    const { coordinator } = makeCoordinator({
      sdk: mockBackend("sdk", (agent) =>
        agent === "bad" ? makeResult(agent, { exitCode: 1, stopReason: "error", errorMessage: "boom" }) : makeResult(agent),
      ),
    });
    const agents = new Map([
      ["good", makeAgent({ name: "good" })],
      ["bad", makeAgent({ name: "bad" })],
      ["after", makeAgent({ name: "after" })],
    ]);
    const results = await coordinator.dispatch({
      mode: "chain",
      chain: [
        { agent: "good", task: "t1" },
        { agent: "bad", task: "t2" },
        { agent: "after", task: "t3" },
      ],
      agents,
      cwd: "/tmp",
    });
    // Should stop after "bad" — "after" never runs.
    expect(results.map((r) => r.agent)).toEqual(["good", "bad"]);
  });
});
