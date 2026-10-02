/**
 * Coordinator — resolves agents, picks backends, and executes tasks in
 * single, parallel, or chain mode.
 */

import { resolve } from "node:path";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";
import { SDKBackend } from "./backends/sdk-backend.ts";
import { SubprocessBackend } from "./backends/subprocess-backend.ts";
import type {
  AgentBackend,
  AgentDefinition,
  AgentResult,
  AgentTask,
  Backend,
  DynamicAgentDefinition,
  ExecuteOptions,
} from "./types.ts";
import { emptyUsage, getFinalOutput, isFailedResult } from "./types.ts";

type AnyAgent = AgentDefinition | DynamicAgentDefinition;

export const DEFAULT_MAX_TASKS = 8;
export const DEFAULT_CONCURRENCY = 4;
export const DEFAULT_MAX_OUTPUT_PER_TASK = 50 * 1024; // 50 KB

// ---------------------------------------------------------------------------
// Concurrency-limited map
// ---------------------------------------------------------------------------

async function mapWithConcurrency<TIn, TOut>(
  items: TIn[],
  concurrency: number,
  fn: (item: TIn, index: number) => Promise<TOut>,
): Promise<TOut[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results: TOut[] = new Array(items.length);
  let nextIndex = 0;

  const workers = new Array(limit).fill(null).map(async () => {
    for (;;) {
      const current = nextIndex++;
      if (current >= items.length) return;
      const item = items[current];
      if (item === undefined) return;
      results[current] = await fn(item, current);
    }
  });

  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Coordinator
// ---------------------------------------------------------------------------

export interface CoordinatorOptions {
  /** Default backend for agents that don't specify one. */
  defaultBackend?: AgentBackend;
  /** Max parallel tasks. */
  maxTasks?: number;
  /** Max concurrency for parallel tasks. */
  concurrency?: number;
  /** Inject a custom SDK backend (for testing). */
  sdk?: Backend;
  /** Inject a custom subprocess backend (for testing). */
  subprocess?: Backend;
}

export interface DispatchParams {
  mode: "single" | "parallel" | "chain";
  agent?: string | undefined;
  task?: string | undefined;
  tasks?: AgentTask[] | undefined;
  chain?: AgentTask[] | undefined;
  /** Resolved agent definitions keyed by name. */
  agents: Map<string, AnyAgent>;
  cwd: string;
  signal?: AbortSignal | undefined;
  /** Progress callback. `index` is the 0-based task/step index (0 for single). */
  onUpdate?: ((partial: AgentResult, index: number) => void) | undefined;
  parentModel?: Model<any> | undefined;
  parentThinkingLevel?: ThinkingLevel | undefined;
  projectTrusted?: boolean | undefined;
  maxTasks?: number | undefined;
  concurrency?: number | undefined;
}

export class Coordinator {
  private defaultBackend: AgentBackend;
  private maxTasks: number;
  private concurrency: number;

  private sdk: Backend;
  private subprocess: Backend;

  constructor(options: CoordinatorOptions = {}) {
    this.defaultBackend = options.defaultBackend ?? "sdk";
    this.maxTasks = options.maxTasks ?? DEFAULT_MAX_TASKS;
    this.concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
    this.sdk = options.sdk ?? new SDKBackend();
    this.subprocess = options.subprocess ?? new SubprocessBackend();
  }

  async dispatch(params: DispatchParams): Promise<AgentResult[]> {
    switch (params.mode) {
      case "single":
        return this.dispatchSingle(params);
      case "parallel":
        return this.dispatchParallel(params);
      case "chain":
        return this.dispatchChain(params);
      default:
        return [];
    }
  }

  // ------------------------------------------------------------------------
  // Single
  // ------------------------------------------------------------------------

  private async dispatchSingle(p: DispatchParams): Promise<AgentResult[]> {
    const agentName = p.agent!;
    const task = p.task!;
    const agent = p.agents.get(agentName);

    if (!agent) {
      return [unknownAgentResult(agentName, task, this.availableAgents(p), this.defaultBackend)];
    }

    const backend = this.pickBackend(agent, undefined);
    const result = await this.runAgent(agent, task, p.cwd, backend, p, 0);
    return [result];
  }

  // ------------------------------------------------------------------------
  // Parallel
  // ------------------------------------------------------------------------

  private async dispatchParallel(p: DispatchParams): Promise<AgentResult[]> {
    const tasks = p.tasks!;
    const maxTasks = p.maxTasks ?? this.maxTasks;
    const concurrency = p.concurrency ?? this.concurrency;

    if (tasks.length > maxTasks) {
      return [
        {
          agent: "(parallel)",
          task: `${tasks.length} tasks`,
          exitCode: 1,
          messages: [],
          usage: emptyUsage(),
          errorMessage: `Too many parallel tasks (${tasks.length}). Max is ${maxTasks}.`,
          backend: this.defaultBackend,
        },
      ];
    }

    return mapWithConcurrency(tasks, concurrency, async (t, index) => {
      const agent = p.agents.get(t.agent);
      if (!agent) {
        const result = unknownAgentResult(t.agent, t.task, this.availableAgents(p), this.defaultBackend);
        p.onUpdate?.(result, index);
        return result;
      }

      const backend = this.pickBackend(agent, t.backend);
      const result = await this.runAgent(agent, t.task, t.cwd ?? p.cwd, backend, p, index);
      p.onUpdate?.(result, index);
      return result;
    });
  }

  // ------------------------------------------------------------------------
  // Chain
  // ------------------------------------------------------------------------

  private async dispatchChain(p: DispatchParams): Promise<AgentResult[]> {
    const chain = p.chain!;
    const results: AgentResult[] = [];
    let previousOutput = "";

    for (let i = 0; i < chain.length; i++) {
      const step = chain[i];
      if (!step) continue;
      const taskWithContext = step.task.replace(/\{previous\}/g, previousOutput);
      const agent = p.agents.get(step.agent);

      if (!agent) {
        const result = unknownAgentResult(step.agent, step.task, this.availableAgents(p), this.defaultBackend);
        result.step = i + 1;
        results.push(result);
        return results; // stop at first failure
      }

      const backend = this.pickBackend(agent, step.backend);
      const result = await this.runAgent(agent, taskWithContext, step.cwd ?? p.cwd, backend, p, i);
      result.step = i + 1;
      results.push(result);
      p.onUpdate?.(result, i);

      if (isFailedResult(result)) {
        return results; // stop at first failure
      }

      previousOutput = getFinalOutput(result.messages);
    }

    return results;
  }

  // ------------------------------------------------------------------------
  // Execution
  // ------------------------------------------------------------------------

  private async runAgent(
    agent: AnyAgent,
    task: string,
    cwd: string,
    backend: AgentBackend,
    p: DispatchParams,
    index: number,
  ): Promise<AgentResult> {
    const options: ExecuteOptions = {
      cwd,
      signal: p.signal,
      onUpdate: p.onUpdate ? (partial: AgentResult) => p.onUpdate!(partial, index) : undefined,
      parentModel: p.parentModel,
      parentThinkingLevel: p.parentThinkingLevel,
      projectTrusted: p.projectTrusted && resolve(cwd) === resolve(p.cwd),
    };

    try {
      if (backend === "sdk") {
        return await this.sdk.execute(agent, task, options);
      }
      return await this.subprocess.execute(agent, task, options);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        agent: agent.name,
        task,
        exitCode: 1,
        messages: [],
        usage: emptyUsage(),
        errorMessage: message,
        backend,
      };
    }
  }

  /**
   * Pick the backend for an agent + optional task override.
   * Priority: process isolation > task override > agent config > default.
   */
  private pickBackend(agent: AnyAgent, taskOverride?: AgentBackend): AgentBackend {
    if (agent.isolation === "process") return "subprocess";
    if (taskOverride) return taskOverride;
    if (agent.backend) return agent.backend;
    return this.defaultBackend;
  }

  private availableAgents(p: DispatchParams): string {
    return Array.from(p.agents.keys()).map((n) => `"${n}"`).join(", ") || "none";
  }
}

function unknownAgentResult(
  agentName: string,
  task: string,
  available: string,
  backend: AgentBackend,
): AgentResult {
  return {
    agent: agentName,
    task,
    exitCode: 1,
    messages: [],
    usage: emptyUsage(),
    errorMessage: `Unknown agent: "${agentName}". Available agents: ${available}.`,
    backend,
  };
}
