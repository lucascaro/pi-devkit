/**
 * SDK backend — executes subagents in-process using the pi SDK.
 *
 * Uses createAgentSession() with SessionManager.inMemory() for ephemeral
 * sessions. Shares a single ModelRuntime across all SDK subagents for
 * resource efficiency (one provider/auth resolution, one model catalog).
 *
 * The agent's system prompt is injected via a DefaultResourceLoader with
 * appendSystemPrompt. User extensions/skills/prompts/themes are disabled to
 * avoid recursion and heavy I/O; a targeted inline guardrail still blocks
 * dangerous Bash calls because SDK subagents have no confirmation UI.
 */

import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRuntime,
  resolveCliModel,
  SessionManager,
  type AgentSession,
} from "@earendil-works/pi-coding-agent";
import type { Model } from "@earendil-works/pi-ai";
import type {
  AgentDefinition,
  AgentResult,
  Backend,
  DynamicAgentDefinition,
  ExecuteOptions,
  Message,
  UsageStats,
} from "../types.ts";
import { emptyUsage, resolveSystemPrompt } from "../types.ts";
import { resolveRouterModel } from "../router-model.ts";
import { sdkSubagentGuardrails } from "../sdk-guardrails.ts";

// ---------------------------------------------------------------------------
// Shared ModelRuntime (singleton)
// ---------------------------------------------------------------------------

let sharedRuntime: ModelRuntime | null = null;

async function getRuntime(): Promise<ModelRuntime> {
  if (!sharedRuntime) {
    sharedRuntime = await ModelRuntime.create();
  }
  return sharedRuntime;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function accumulateUsage(messages: Message[], usage: UsageStats): void {
  for (const msg of messages) {
    if (msg.role !== "assistant") continue;
    usage.turns++;
    const u = msg.usage;
    if (u) {
      usage.input += u.input || 0;
      usage.output += u.output || 0;
      usage.cacheRead += u.cacheRead || 0;
      usage.cacheWrite += u.cacheWrite || 0;
      usage.cost += u.cost?.total || 0;
      if (u.totalTokens) usage.contextTokens = u.totalTokens;
    }
  }
}

/** Keep only standard LLM messages (drop any custom agent messages). */
function toStandardMessages(messages: Array<{ role: string }>): Message[] {
  return messages.filter(
    (m): m is Message => m.role === "user" || m.role === "assistant" || m.role === "toolResult",
  ) as Message[];
}

export function createSdkSubagentResourceLoader(
  cwd: string,
  agentDir: string,
  systemPrompt: string,
): DefaultResourceLoader {
  const loaderOptions: ConstructorParameters<typeof DefaultResourceLoader>[0] = {
    cwd,
    agentDir,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    extensionFactories: [sdkSubagentGuardrails],
  };
  if (systemPrompt.trim()) {
    loaderOptions.appendSystemPrompt = [systemPrompt];
  }
  return new DefaultResourceLoader(loaderOptions);
}

// ---------------------------------------------------------------------------
// SDK backend
// ---------------------------------------------------------------------------

export class SDKBackend implements Backend {
  async execute(
    def: AgentDefinition | DynamicAgentDefinition,
    task: string,
    options: ExecuteOptions,
  ): Promise<AgentResult> {
    const runtime = await getRuntime();

    // Resolve model: agent override, else inherit from parent.
    let model: Model<any> | undefined;
    let thinkingLevel = def.thinkingLevel ?? options.parentThinkingLevel;

    if (def.model) {
      // Check for router: prefix — resolve against trusted router config.
      let modelRef: string | undefined = def.model;
      if (def.model.startsWith("router:")) {
        modelRef = await resolveRouterModel(
          def.model,
          options.cwd,
          options.projectTrusted ?? false,
        );
        if (!modelRef) {
          // Router config unavailable or invalid — fall through to parent inheritance.
          model = options.parentModel;
        }
      }

      if (modelRef) {
        const resolved = resolveCliModel({ cliModel: modelRef, modelRuntime: runtime });
        if (resolved.model) {
          model = resolved.model;
          if (!def.thinkingLevel && resolved.thinkingLevel) thinkingLevel = resolved.thinkingLevel;
        } else {
          return errorResult(def.name, task, `Model "${modelRef}" not available: ${resolved.error ?? resolved.warning ?? "no match"}`);
        }
      }
    } else {
      model = options.parentModel;
    }

    if (!model) {
      return errorResult(def.name, task, "No model available. Set a model on the agent or select one in the parent session.");
    }

    // Resolve the system prompt (supports dynamic TS agents).
    const systemPrompt = await resolveSystemPrompt(def, { cwd: options.cwd });

    // Keep user resources disabled to avoid recursion and heavy I/O while
    // retaining the SDK-only dangerous-command guardrail.
    const loader = createSdkSubagentResourceLoader(options.cwd, getAgentDir(), systemPrompt);
    await loader.reload();

    const sessionManager = SessionManager.inMemory(options.cwd);

    let session: AgentSession;
    try {
      const sessionOptions: Parameters<typeof createAgentSession>[0] = {
        cwd: options.cwd,
        modelRuntime: runtime,
        model,
        sessionManager,
        resourceLoader: loader,
      };
      if (thinkingLevel) sessionOptions.thinkingLevel = thinkingLevel;
      if (def.tools && def.tools.length > 0) sessionOptions.tools = def.tools;

      const created = await createAgentSession(sessionOptions);
      session = created.session;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult(def.name, task, `Failed to create session: ${message}`);
    }

    // Collect messages and stream progress.
    const collected: Message[] = [];
    let stopReason: string | undefined;
    let errorMessage: string | undefined;

    const emitUpdate = () => {
      if (!options.onUpdate) return;
      const usage = emptyUsage();
      accumulateUsage(collected, usage);
      options.onUpdate({
        agent: def.name,
        task,
        exitCode: -1,
        messages: [...collected],
        usage,
        model: model!.id,
        stopReason,
        backend: "sdk",
      });
    };

    const unsubscribe = session.subscribe((event) => {
      if (event.type === "message_end") {
        const msg = event.message;
        if (msg.role === "user" || msg.role === "assistant" || msg.role === "toolResult") {
          collected.push(msg as Message);
          if (msg.role === "assistant") {
            stopReason = msg.stopReason;
            errorMessage = msg.errorMessage;
          }
          emitUpdate();
        }
      }
    });

    // Wire abort signal to session abort.
    let cleanupAbort: (() => void) | undefined;
    if (options.signal) {
      const onAbort = () => {
        void session.abort();
      };
      if (options.signal.aborted) {
        void session.abort();
      } else {
        options.signal.addEventListener("abort", onAbort, { once: true });
        cleanupAbort = () => options.signal?.removeEventListener("abort", onAbort);
      }
    }

    try {
      await session.prompt(task);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (options.signal?.aborted) {
        stopReason = "aborted";
        errorMessage = "Subagent was aborted";
      } else {
        stopReason = "error";
        errorMessage = message;
      }
    } finally {
      cleanupAbort?.();
      unsubscribe();
      session.dispose();
    }

    // Use the session's full message list as the source of truth.
    const finalMessages = toStandardMessages(session.messages);
    const usage = emptyUsage();
    accumulateUsage(finalMessages, usage);

    // Determine final stop reason / error from the last assistant message.
    let finalStopReason = stopReason;
    let finalError = errorMessage;
    for (let i = finalMessages.length - 1; i >= 0; i--) {
      const msg = finalMessages[i];
      if (msg && msg.role === "assistant") {
        finalStopReason = msg.stopReason;
        finalError = msg.errorMessage;
        break;
      }
    }

    const exitCode = finalStopReason === "error" || finalStopReason === "aborted" ? 1 : 0;

    return {
      agent: def.name,
      task,
      exitCode,
      messages: finalMessages,
      usage,
      model: model.id,
      stopReason: finalStopReason,
      errorMessage: finalError,
      backend: "sdk",
    };
  }
}

function errorResult(agent: string, task: string, errorMessage: string): AgentResult {
  return {
    agent,
    task,
    exitCode: 1,
    messages: [],
    usage: emptyUsage(),
    stopReason: "error",
    errorMessage,
    backend: "sdk",
  };
}
