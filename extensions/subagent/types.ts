/**
 * Subagent types — shared across backends, coordinator, and the extension entry.
 */

import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { Message, Model } from "@earendil-works/pi-ai";
import { Type, type Static } from "typebox";

// Re-export for consumers (backends, coordinator).
export type { Message } from "@earendil-works/pi-ai";

// ---------------------------------------------------------------------------
// Agent definition
// ---------------------------------------------------------------------------

/** Which execution backend an agent uses. */
export type AgentBackend = "sdk" | "subprocess";

/** Isolation level for an agent. */
export type AgentIsolation = "none" | "session" | "process";

/** Where an agent definition was loaded from. */
export type AgentSource = "user" | "project";

/**
 * Agent definition. Loaded from YAML (markdown) files or TypeScript modules.
 *
 * `systemPrompt` is the agent's system prompt. For YAML agents it's the markdown
 * body. For dynamic TS agents it may be a function (see DynamicAgentDefinition).
 */
export interface AgentDefinition {
  name: string;
  description: string;
  /** Model override — e.g. "claude-haiku-4-5" or "anthropic/claude-haiku-4-5". Inherits from parent if unset. */
  model?: string | undefined;
  /** Thinking level override. Inherits from parent if unset. */
  thinkingLevel?: ThinkingLevel | undefined;
  /** Tool allowlist. Empty or undefined = default tools. */
  tools?: string[] | undefined;
  /** System prompt for the agent. */
  systemPrompt: string;
  /** Backend to use. Defaults to the coordinator's default. */
  backend?: AgentBackend | undefined;
  /** Isolation level. "process" forces the subprocess backend. */
  isolation?: AgentIsolation | undefined;
  /** Where this agent was loaded from. */
  source: AgentSource;
  /** File path where the agent was defined. */
  filePath: string;
}

/**
 * Dynamic agent definition — allows runtime system prompt generation and
 * lifecycle hooks. Loaded from TypeScript modules.
 */
export interface DynamicAgentDefinition {
  name: string;
  description: string;
  model?: string | undefined;
  thinkingLevel?: ThinkingLevel | undefined;
  tools?: string[] | undefined;
  /** Generate the system prompt at execution time. */
  systemPrompt: (ctx: AgentContext) => string | Promise<string>;
  /** Called before the agent starts executing. */
  init?: ((ctx: AgentContext) => Promise<void>) | undefined;
  /** Called after the agent finishes (success or failure). */
  teardown?: ((ctx: AgentContext) => Promise<void>) | undefined;
  backend?: AgentBackend | undefined;
  isolation?: AgentIsolation | undefined;
  source: AgentSource;
  filePath: string;
}

/** Context passed to dynamic agent hooks. */
export interface AgentContext {
  cwd: string;
  /** Arbitrary project data loaded during init. */
  projectData?: Record<string, unknown> | undefined;
}

/** Resolve a definition's system prompt to a string. */
export async function resolveSystemPrompt(
  def: AgentDefinition | DynamicAgentDefinition,
  ctx: AgentContext,
): Promise<string> {
  if (typeof def.systemPrompt === "function") {
    return def.systemPrompt(ctx);
  }
  return def.systemPrompt;
}

/** True if the definition is a dynamic (TS) agent. */
export function isDynamicAgent(def: AgentDefinition | DynamicAgentDefinition): def is DynamicAgentDefinition {
  return typeof def.systemPrompt === "function";
}

// ---------------------------------------------------------------------------
// Task & execution
// ---------------------------------------------------------------------------

/** A single task to delegate to an agent. */
export interface AgentTask {
  agent: string;
  task: string;
  cwd?: string | undefined;
  /** Backend override for this specific task. */
  backend?: AgentBackend | undefined;
}

/** Usage statistics from a subagent execution. */
export interface UsageStats {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  contextTokens: number;
  turns: number;
}

export function emptyUsage(): UsageStats {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 };
}

/** Result from a single subagent execution. */
export interface AgentResult {
  agent: string;
  task: string;
  exitCode: number;
  messages: Message[];
  usage: UsageStats;
  model?: string | undefined;
  stopReason?: string | undefined;
  errorMessage?: string | undefined;
  backend: AgentBackend;
  /** Which step this was in a chain (1-indexed). Undefined for single/parallel. */
  step?: number | undefined;
}

/** Whether a result represents a failure. */
export function isFailedResult(result: AgentResult): boolean {
  return result.exitCode !== 0 || result.stopReason === "error" || result.stopReason === "aborted";
}

/** Extract the final assistant text output from a result's messages. */
export function getFinalOutput(messages: Message[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (!msg || msg.role !== "assistant") continue;
    for (const part of msg.content) {
      if (part.type === "text") return part.text;
    }
  }
  return "";
}

// ---------------------------------------------------------------------------
// Execution modes
// ---------------------------------------------------------------------------

export type ExecutionMode = "single" | "parallel" | "chain";

// ---------------------------------------------------------------------------
// Tool parameter schema (TypeBox)
// ---------------------------------------------------------------------------

const BackendSchema = Type.Union([Type.Literal("sdk"), Type.Literal("subprocess")], {
  description: "Backend override: 'sdk' (in-process) or 'subprocess' (isolated process)",
});

const AgentScopeSchema = Type.Union(
  [Type.Literal("user"), Type.Literal("project"), Type.Literal("both")],
  {
    description:
      'Which agent directories to use. "user" (default) = ~/.pi/agent/agents only. "project" or "both" include .pi/agents (requires a trusted project).',
  },
);

const TaskItemSchema = Type.Object({
  agent: Type.String({ description: "Name of the agent to invoke" }),
  task: Type.String({ description: "Task to delegate to the agent" }),
  cwd: Type.Optional(Type.String({ description: "Working directory for the agent" })),
  backend: Type.Optional(BackendSchema),
});

const ChainItemSchema = Type.Object({
  agent: Type.String({ description: "Name of the agent to invoke" }),
  task: Type.String({
    description: "Task with optional {previous} placeholder for the prior step's output",
  }),
  cwd: Type.Optional(Type.String({ description: "Working directory for the agent" })),
  backend: Type.Optional(BackendSchema),
});

export const SubagentParamsSchema = Type.Object({
  agent: Type.Optional(Type.String({ description: "Agent name (single mode)" })),
  task: Type.Optional(Type.String({ description: "Task description (single mode)" })),
  tasks: Type.Optional(Type.Array(TaskItemSchema, { description: "Array of tasks for parallel execution" })),
  chain: Type.Optional(Type.Array(ChainItemSchema, { description: "Array of steps for sequential execution" })),
  agentScope: Type.Optional(AgentScopeSchema),
  maxTasks: Type.Optional(Type.Number({ description: "Max parallel tasks (default 8)", minimum: 1, maximum: 32 })),
  concurrency: Type.Optional(Type.Number({ description: "Max concurrent tasks (default 4)", minimum: 1, maximum: 16 })),
  maxOutputPerTask: Type.Optional(
    Type.Number({ description: "Max output bytes per task in model-visible content (default 51200)" }),
  ),
});

export type SubagentToolParams = Static<typeof SubagentParamsSchema>;

// ---------------------------------------------------------------------------
// Backend interface
// ---------------------------------------------------------------------------

/** Callback for streaming progress updates. */
export type ProgressCallback = (partial: AgentResult) => void;

/** Execute options shared across backends. */
export interface ExecuteOptions {
  cwd: string;
  signal?: AbortSignal | undefined;
  onUpdate?: ProgressCallback | undefined;
  /** Parent model (from the dispatching session). Used for inheritance. */
  parentModel?: Model<any> | undefined;
  /** Parent thinking level. Used for inheritance. */
  parentThinkingLevel?: ThinkingLevel | undefined;
}

/** Backend interface — both SDK and subprocess backends implement this. */
export interface Backend {
  execute(
    def: AgentDefinition | DynamicAgentDefinition,
    task: string,
    options: ExecuteOptions,
  ): Promise<AgentResult>;
}

// ---------------------------------------------------------------------------
// Registry / discovery
// ---------------------------------------------------------------------------

export type AgentScope = "user" | "project" | "both";

/** Result of agent discovery. */
export interface AgentDiscoveryResult {
  agents: Array<AgentDefinition | DynamicAgentDefinition>;
  /** Path to the project-local agents directory, if any. */
  projectAgentsDir: string | null;
}
