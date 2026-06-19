import {
  createAssistantMessageEventStream,
  streamSimple,
  type Api,
  type AssistantMessage,
  type AssistantMessageEventStream,
  type Context,
  type Model,
  type SimpleStreamOptions,
  type Message,
} from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type {
  RouterConfig,
  RoutingDecision,
  RouterTier,
  RouterPinByProfile,
  RouterThinkingByProfile,
} from "./types.js";
import {
  profileNames,
  parseCanonicalModelRef,
  ROUTER_TIERS,
  resolveContextWindow,
  resolveMaxOutputTokens,
  collectProfileThinkingLevels,
} from "./config.js";
import {
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_MAX_OUTPUT_TOKENS,
  MAX_DEBUG_HISTORY,
} from "./constants.js";
import {
  phaseForTier,
  buildRoutingDecision,
  decideRouting,
  runClassifier,
  extractTextFromContent,
  hasImageAttachment,
} from "./routing.js";

const createErrorMessage = (
  model: Model<Api>,
  message: string,
): AssistantMessage => {
  return {
    role: "assistant",
    content: [],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "error",
    errorMessage: message,
    timestamp: Date.now(),
  };
};

// Rough token estimate: ~33% character-to-token ratio.
// This is a heuristic — not accurate for code-heavy prompts (lower ratio)
// or emoji-heavy prompts (higher ratio). Used only for context truncation.
const estimateTokens = (text: string): number =>
  Math.ceil(text.length / 3);

const truncateContext = (context: Context, limit: number): Context => {
  const messages = [...context.messages];
  if (messages.length <= 1) return context;

  const getSystemTokens = () =>
    context.systemPrompt ? estimateTokens(context.systemPrompt) : 0;

  const totalTokens =
    getSystemTokens() +
    messages.reduce(
      (sum, m) => sum + estimateTokens(extractTextFromContent(m.content)),
      0,
    );
  if (totalTokens <= limit) return context;

  const latestMessage = messages.pop();
  if (!latestMessage) return context;

  while (messages.length > 0) {
    const currentTokens =
      getSystemTokens() +
      estimateTokens(extractTextFromContent(latestMessage.content)) +
      messages.reduce(
        (sum, m) =>
          sum + estimateTokens(extractTextFromContent(m.content)),
        0,
      );

    if (currentTokens <= limit) break;
    messages.shift();
  }

  const finalMessages: Message[] = [];
  finalMessages.push(...messages);
  finalMessages.push(latestMessage);

  return { ...context, messages: finalMessages };
};

const supportsReasoning = (
  profile: RouterConfig["profiles"][string],
  modelRegistry: ExtensionContext["modelRegistry"] | undefined,
): boolean => {
  if (!modelRegistry) return false;

  for (const tier of ROUTER_TIERS) {
    const tierConfig = profile[tier];
    if (!tierConfig) continue;
    try {
      const { provider, modelId } = parseCanonicalModelRef(tierConfig.model);
      if (modelRegistry.find(provider, modelId)?.reasoning) {
        return true;
      }
    } catch {
      /* ignore */
    }
  }

  return false;
};

export const registerRouterProvider = (
  pi: ExtensionAPI,
  state: {
    lastRegisteredModels: string;
    readonly currentConfig: RouterConfig;
    readonly currentModelRegistry:
      | ExtensionContext["modelRegistry"]
      | undefined;
    readonly lastExtensionContext: ExtensionContext | undefined;
    selectedProfile: string | undefined;
    routerEnabled: boolean;
    lastDecision: RoutingDecision | undefined;
    readonly thinkingByProfile: RouterThinkingByProfile;
    readonly pinnedTierByProfile: RouterPinByProfile;
    accumulatedCost: number;
  },
  actions: {
    persistState: () => void;
    recordDebugDecision: (decision: RoutingDecision) => void;
    getThinkingOverride: (
      profileName: string,
      tier: RouterTier,
    ) => ThinkingLevel | undefined;
    updateStatus: (ctx: ExtensionContext) => void;
    syncPiThinkingLevel: (level: ThinkingLevel) => void;
  },
) => {
  const profileList = profileNames(state.currentConfig);

  const modelDefinitions = profileList.map((name) => {
    const profile = state.currentConfig.profiles[name];
    if (!profile) {
      return {
        id: name,
        name: `Router ${name}`,
        reasoning: false,
        input: ["text", "image"] as ("text" | "image")[],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: DEFAULT_CONTEXT_WINDOW,
        maxTokens: DEFAULT_MAX_OUTPUT_TOKENS,
      };
    }

    let maxContextWindow = DEFAULT_CONTEXT_WINDOW;
    let maxMaxOutputTokens = DEFAULT_MAX_OUTPUT_TOKENS;
    for (const tier of ROUTER_TIERS) {
      if (!profile[tier]) continue;
      const cw = resolveContextWindow(
        tier,
        profile,
        state.currentModelRegistry,
      );
      const mot = resolveMaxOutputTokens(
        tier,
        profile,
        state.currentModelRegistry,
      );
      if (cw > maxContextWindow) maxContextWindow = cw;
      if (mot > maxMaxOutputTokens) maxMaxOutputTokens = mot;
    }

    const hasReasoning = supportsReasoning(
      profile,
      state.currentModelRegistry,
    );
    const profileLevels = collectProfileThinkingLevels(profile);
    const thinkingLevelMap =
      hasReasoning && profileLevels.has("xhigh")
        ? { xhigh: "xhigh" }
        : undefined;

    return {
      id: name,
      name: `Router ${name}`,
      reasoning: hasReasoning,
      ...(thinkingLevelMap ? { thinkingLevelMap } : {}),
      input: ["text", "image"] as ("text" | "image")[],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: maxContextWindow,
      maxTokens: maxMaxOutputTokens,
    };
  });

  const modelsKey = modelDefinitions
    .map((m) => `${m.id}:${m.contextWindow}:${m.maxTokens}:${m.reasoning}`)
    .join(",");
  if (state.lastRegisteredModels === modelsKey) return;

  pi.registerProvider("router", {
    baseUrl: "router://local",
    apiKey: "pi-model-router",
    api: "router-local-api" as Api,
    models: modelDefinitions,
    streamSimple(
      model: Model<Api>,
      context: Context,
      options?: SimpleStreamOptions,
    ): AssistantMessageEventStream {
      const stream = createAssistantMessageEventStream();

      (async () => {
        try {
          if (!state.currentModelRegistry) {
            throw new Error(
              "Router provider not initialized yet. Wait for session_start and retry.",
            );
          }
          const profile = state.currentConfig.profiles[model.id];
          if (!profile) {
            throw new Error(`Unknown router profile: ${model.id}`);
          }

          state.selectedProfile = model.id;
          state.routerEnabled = true;

          const pinnedTier = state.pinnedTierByProfile[model.id];
          const isBudgetExceeded =
            state.currentConfig.maxSessionBudget !== undefined &&
            state.accumulatedCost >= state.currentConfig.maxSessionBudget;

          let decision: RoutingDecision = decideRouting(
            context,
            model.id,
            profile,
            state.lastDecision,
            pinnedTier,
            state.thinkingByProfile[model.id],
            state.currentConfig.phaseBias,
            state.currentConfig.rules,
            isBudgetExceeded,
          );

          if (
            state.currentConfig.classifierModel &&
            !pinnedTier &&
            !decision.isRuleMatched
          ) {
            const classifierCfg = state.currentConfig.classifierModel;
            const classifierModelRef = typeof classifierCfg === "string" ? classifierCfg : classifierCfg.model;
            const classifierThinking = typeof classifierCfg === "object" ? classifierCfg.thinking : undefined;
            const classifierResult = await runClassifier(
              classifierModelRef,
              state.currentModelRegistry,
              context,
              state.lastDecision?.phase,
              classifierThinking,
            );
            if (classifierResult) {
              decision = buildRoutingDecision(
                model.id,
                profile,
                classifierResult.tier,
                phaseForTier(classifierResult.tier),
                `Classifier: ${classifierResult.reasoning}`,
                state.thinkingByProfile[model.id],
                true,
              );
              if (isBudgetExceeded && decision.tier === "high") {
                decision.tier = "medium";
                decision.phase = "implementation";
                decision.reasoning = `Budget exceeded. Downgraded classifier decision to medium. (Original: ${decision.reasoning})`;
                decision.isBudgetForced = true;
              }
            }
          }

          const lastMessage =
            context.messages[context.messages.length - 1];
          const previousDecision = state.lastDecision;
          const isGoogleThinkingToolContinuation =
            lastMessage?.role === "toolResult" &&
            previousDecision?.profile === model.id &&
            previousDecision.targetProvider === "google" &&
            previousDecision.thinking !== "off" &&
            decision.targetProvider === "google" &&
            decision.thinking !== "off" &&
            previousDecision.targetLabel !== decision.targetLabel;

          if (isGoogleThinkingToolContinuation) {
            decision = {
              ...decision,
              tier: previousDecision!.tier,
              phase: previousDecision!.phase,
              targetProvider: previousDecision!.targetProvider,
              targetModelId: previousDecision!.targetModelId,
              targetLabel: previousDecision!.targetLabel,
              thinking: previousDecision!.thinking,
              reasoning:
                `Preserved ${previousDecision!.targetLabel} for a Google tool-result continuation ` +
                `to avoid thought-signature replay errors. (Original: ${decision.reasoning})`,
            };
          }

          const imageAttached = hasImageAttachment(context);
          if (imageAttached) {
            const checkModelSupportsImage = (modelRef: string) => {
              try {
                const { provider, modelId } = parseCanonicalModelRef(modelRef);
                const m = state.currentModelRegistry?.find(
                  provider,
                  modelId,
                );
                return m?.input?.includes("image") ?? false;
              } catch {
                return false;
              }
            };

            const tierModels = [
              decision.targetLabel,
              ...(profile[decision.tier]?.fallbacks ?? []),
            ];
            if (!tierModels.some(checkModelSupportsImage)) {
              const tiersToTry: RouterTier[] =
                decision.tier === "low"
                  ? ["medium", "high"]
                  : decision.tier === "medium"
                    ? ["high"]
                    : [];

              let foundTier: RouterTier | undefined;
              for (const t of tiersToTry) {
                const tModels = [
                  profile[t]?.model,
                  ...(profile[t]?.fallbacks ?? []),
                ].filter(
                  (m): m is string => typeof m === "string",
                );
                if (tModels.some(checkModelSupportsImage)) {
                  foundTier = t;
                  break;
                }
              }

              if (foundTier) {
                decision = buildRoutingDecision(
                  model.id,
                  profile,
                  foundTier,
                  phaseForTier(foundTier),
                  `Forced ${foundTier} tier because the originally routed ${decision.tier} tier does not support image attachments.`,
                  state.thinkingByProfile[model.id],
                  false,
                );
              }
            }
          }

          state.lastDecision = decision;
          actions.recordDebugDecision(decision);

          const effectiveThinking =
            actions.getThinkingOverride(
              model.id,
              decision.tier,
            ) ?? decision.thinking;
          actions.syncPiThinkingLevel(effectiveThinking);

          if (state.lastExtensionContext) {
            actions.updateStatus(state.lastExtensionContext);
          }

          let modelsToTry = [
            decision.targetLabel,
            ...(profile[decision.tier]?.fallbacks ?? []),
          ];
          if (imageAttached) {
            modelsToTry = modelsToTry.filter((modelRef) => {
              try {
                const { provider, modelId } = parseCanonicalModelRef(
                  modelRef,
                );
                const m = state.currentModelRegistry?.find(
                  provider,
                  modelId,
                );
                return m?.input?.includes("image") ?? false;
              } catch {
                return false;
              }
            });
            if (modelsToTry.length === 0) {
              modelsToTry = [decision.targetLabel];
            }
          }
          let lastError: any;
          let success = false;

          for (let i = 0; i < modelsToTry.length; i++) {
            const modelRef = modelsToTry[i];
            if (!modelRef) continue;
            const {
              provider: targetProvider,
              modelId: targetModelId,
            } = parseCanonicalModelRef(modelRef);

            if (targetProvider === "router") continue;

            const targetModel = state.currentModelRegistry.find(
              targetProvider,
              targetModelId,
            );
            if (!targetModel) {
              lastError = new Error(
                `Routed model not found: ${targetProvider}/${targetModelId}`,
              );
              continue;
            }

            const auth =
              await state.currentModelRegistry.getApiKeyAndHeaders(
                targetModel,
              );
            if (!auth.ok || !auth.apiKey) {
              lastError = new Error(
                auth.ok
                  ? `No API key for routed model: ${targetProvider}/${targetModelId}`
                  : `Auth failed for routed model: ${targetProvider}/${targetModelId}: ${auth.error}`,
              );
              continue;
            }
            const apiKey = auth.apiKey;
            const headers = auth.headers;

            try {
              let effectiveContext = context;
              const targetLimit = resolveContextWindow(
                decision.tier,
                profile,
                state.currentModelRegistry,
              );
              if (targetLimit < model.contextWindow!) {
                effectiveContext = truncateContext(
                  context,
                  targetLimit,
                );
              }

              const thinkingOverride = actions.getThinkingOverride(
                model.id,
                decision.tier,
              );
              const delegatedReasoning =
                targetModel.reasoning &&
                (thinkingOverride ?? decision.thinking) !== "off"
                  ? thinkingOverride ?? decision.thinking
                  : undefined;

              if (state.lastExtensionContext) {
                if (delegatedReasoning) {
                  state.lastExtensionContext.ui.setHiddenThinkingLabel?.(
                    `Thinking (${targetProvider}/${targetModelId})...`,
                  );
                } else {
                  state.lastExtensionContext.ui.setHiddenThinkingLabel?.();
                }
              }

              const {
                reasoning: _piReasoning,
                ...delegationOptions
              } = options ?? {};

              const streamOpts: Record<string, unknown> = {
                ...delegationOptions,
                apiKey,
                ...(headers ? { headers } : {}),
                ...(delegatedReasoning
                  ? { reasoning: delegatedReasoning }
                  : {}),
              };
              const delegatedStream = streamSimple(
                targetModel,
                effectiveContext,
                streamOpts as any,
              );

              let contentReceived = false;
              for await (const event of delegatedStream) {
                if (event.type === "done") {
                  const cost =
                    event.message.usage?.cost?.total ?? 0;
                  state.accumulatedCost += cost;
                }
                if (event.type === "error" && !contentReceived) {
                  throw new Error(
                    (event as any).error?.errorMessage ||
                      "Model failed before sending content.",
                  );
                }
                const isContent =
                  event.type === "text_delta" ||
                  event.type === "thinking_delta" ||
                  event.type === "toolcall_delta" ||
                  event.type === "toolcall_end";
                if (isContent) contentReceived = true;
                stream.push(event);
              }
              success = true;
              if (i > 0) decision.isFallback = true;
              break;
            } catch (err) {
              lastError = err;
            }
          }

          if (!success) {
            throw (
              lastError ||
              new Error(
                "Failed to delegate to any model in the chain.",
              )
            );
          }

          stream.end();
        } catch (error) {
          stream.push({
            type: "error",
            reason: "error",
            error: createErrorMessage(
              model,
              error instanceof Error
                ? error.message
                : String(error),
            ),
          });
          stream.end();
        } finally {
          actions.persistState();
        }
      })();

      return stream;
    },
  } as unknown as Parameters<typeof pi.registerProvider>[1]);

  state.lastRegisteredModels = modelsKey;
};
