/**
 * SDK backend — executes subagents in-process using the pi SDK.
 *
 * Uses createAgentSession() with SessionManager.inMemory() for ephemeral
 * sessions. Shares a single ModelRuntime across all SDK subagents for
 * resource efficiency (one provider/auth resolution, one model catalog).
 *
 * The agent's system prompt is injected via a DefaultResourceLoader with
 * appendSystemPrompt, and extension/skill/prompt/theme loading is disabled to
 * avoid recursion (loading the subagent extension itself) and heavy I/O.
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

// Lazy import to avoid loading the model-router extension unless needed.
let _loadRouterConfig: ((cwd: string) => any) | undefined;
async function getLoadRouterConfig() {
  if (_loadRouterConfig) return _loadRouterConfig;
  try {
    const mod = await import("../../model-router/config.js");
    _loadRouterConfig = mod.loadRouterConfig;
  } catch {
    _loadRouterConfig = undefined;
  }
  return _loadRouterConfig;
}

/**
 * Resolve a "router:" prefixed model reference against the router config.
 * Returns the canonical model string, or undefined if the router config
 * is unavailable or the reference is invalid.
 */
export async function resolveRouterModel(
  ref: string,
  cwd: string,
): Promise<string | undefined> {
  const loader = await getLoadRouterConfig();
  if (!loader) return undefined;

  const result = loader(cwd);
  if (!result?.config?.profiles) return undefined;

  // Parse "router:low" → tier = "low", default profile = first available
  const prefix = "router:";
  if (!ref.startsWith(prefix)) return undefined;
  const tierStr = ref.slice(prefix.length).trim();
  const validTiers = ["high", "medium", "low"] as const;
  const tier: "high" | "medium" | "low" | undefined = validTiers.includes(tierStr as typeof validTiers[number])
    ? (tierStr as "high" | "medium" | "low")
    : undefined;
  if (!tier) return undefined;
  // TypeScript doesn't narrow after the above if, so we assert.
  const tierSafe = tier!;

  const profiles = result.config.profiles;
  const profileNames = Object.keys(profiles);

  // Use first profile if no name specified, or try "router:<profile>:<tier>"
  if (profileNames.length === 0) return undefined;

  // Check for "router:<profile>:<tier>" format
  const parts = ref.slice(prefix.length).split(":");
  if (parts.length === 2) {
    const profileName = parts[0] as string;
    const profileTierStr = parts[1] as string;
    const profile = profiles[profileName];
    if (profile && Object.hasOwn(profile, profileTierStr)) {
      const tierConfig = profile[profileTierStr] as { model?: string } | undefined;
      if (tierConfig?.model) return tierConfig.model;
    }
  }

  // Default profile — use tier in a type-safe way
  const defaultProfileName = profileNames[0] as string;
  const defaultProfile = profiles[defaultProfileName] as Record<string, { model?: string } | undefined>;
  if (!defaultProfile) return undefined;
  const tierConfig = defaultProfile[tierSafe];
  if (tierConfig?.model) return tierConfig.model;
  return undefined;
}

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
      // Check for router: prefix — resolve against router config.
      let modelRef = def.model;
      if (def.model.startsWith("router:")) {
        const resolvedRouter = await resolveRouterModel(def.model, options.cwd);
        if (resolvedRouter) {
          modelRef = resolvedRouter;
        } else {
          // Router config unavailable or invalid — fall through to parent inheritance.
          model = options.parentModel;
        }
      }

      if (modelRef !== def.model) {
        // Router resolved to a concrete model — resolve it against the runtime.
        const resolved = resolveCliModel({ cliModel: modelRef, modelRuntime: runtime });
        if (resolved.model) {
          model = resolved.model;
          if (!def.thinkingLevel && resolved.thinkingLevel) thinkingLevel = resolved.thinkingLevel;
        } else {
          return errorResult(def.name, task, `Model "${modelRef}" not available: ${resolved.error ?? resolved.warning ?? "no match"}`);
        }
      } else {
        // Not a router ref — resolve as before.
        const resolved = resolveCliModel({ cliModel: def.model, modelRuntime: runtime });
        if (resolved.model) {
          model = resolved.model;
          if (!def.thinkingLevel && resolved.thinkingLevel) thinkingLevel = resolved.thinkingLevel;
        } else {
          return errorResult(def.name, task, `Model "${def.model}" not available: ${resolved.error ?? resolved.warning ?? "no match"}`);
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

    // Build a resource loader that appends the agent's system prompt and skips
    // extensions/skills/prompts/themes (avoids recursion + heavy I/O).
    const loaderOptions: ConstructorParameters<typeof DefaultResourceLoader>[0] = {
      cwd: options.cwd,
      agentDir: getAgentDir(),
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
    };
    if (systemPrompt.trim()) {
      loaderOptions.appendSystemPrompt = [systemPrompt];
    }
    const loader = new DefaultResourceLoader(loaderOptions);
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
