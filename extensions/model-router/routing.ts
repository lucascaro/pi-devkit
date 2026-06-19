import { streamSimple, type Context, type Message } from "@earendil-works/pi-ai";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type {
  RouterTier,
  RouterPhase,
  RouterProfile,
  RoutingDecision,
  RoutingRule,
  RouterThinkingByTier,
} from "./types.js";
import { parseCanonicalModelRef, isRouterTier } from "./config.js";

export const extractTextFromContent = (
  content: string | Message["content"],
): string => {
  if (typeof content === "string") {
    return content;
  }
  return content
    .map((part) => {
      if (part.type === "text") return part.text;
      if (part.type === "thinking") return part.thinking;
      if (part.type === "toolCall")
        return `${part.name} ${JSON.stringify(part.arguments)}`;
      return "";
    })
    .filter(Boolean)
    .join("\n");
};

export const getLastUserText = (context: Context): string => {
  for (let i = context.messages.length - 1; i >= 0; i--) {
    const message = context.messages[i];
    if (message && message.role === "user") {
      return extractTextFromContent(message.content).trim();
    }
  }
  return "";
};

export const getRecentConversationText = (
  context: Context,
  limit = 6,
): string => {
  return context.messages
    .slice(-limit)
    .map((message) => extractTextFromContent(message.content).trim())
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
};

export const countToolResults = (context: Context): number => {
  return context.messages.filter((message) => message.role === "toolResult")
    .length;
};

export const countWords = (text: string): number => {
  return text.split(/\s+/).filter(Boolean).length;
};

export const hasImageAttachment = (context: Context): boolean => {
  return context.messages.some(
    (message) =>
      Array.isArray(message.content) &&
      message.content.some((part) => part.type === "image"),
  );
};

export const containsAny = (text: string, keywords: string[]): boolean => {
  return keywords.some((keyword) => {
    // Word-boundary, case-insensitive matching to avoid false positives
    // e.g., "changelog" won't match "unchangelogable"
    const escaped = escapeRegex(keyword);
    const regex = new RegExp(`\\b${escaped}\\b`, "i");
    return regex.test(text);
  });
};

// Pre-compiled regex cache for common keyword lists to avoid recompiling
// on every routing decision. Keys are the keyword list name, values are
// arrays of pre-compiled RegExp objects.
const regexCache = new Map<string, RegExp[]>();

export const containsAnyCached = (
  text: string,
  keywordListName: string,
): boolean => {
  let compiled = regexCache.get(keywordListName);
  if (!compiled) {
    compiled = keywordsToRegexes(keywordListName);
    regexCache.set(keywordListName, compiled);
  }
  return compiled.some((regex) => regex.test(text));
};

const keywordsToRegexes = (keywordListName: string): RegExp[] => {
  const keywords = getKeywordsForList(keywordListName);
  return keywords.map((kw) => {
    const escaped = escapeRegex(kw);
    return new RegExp(`\\b${escaped}\\b`, "i");
  });
};

const getKeywordsForList = (keywordListName: string): string[] => {
  switch (keywordListName) {
    case "explicitHighHints":
      return [
        "best",
        "deep",
        "deeply",
        "carefully",
        "thoroughly",
        "robust",
        "comprehensive",
        "step by step",
        "think hard",
        "highest quality",
        "ultrathink",
      ];
    case "explicitLowHints":
      return [
        "fast",
        "cheap",
        "quick",
        "quickly",
        "brief",
        "briefly",
        "one sentence",
        "one line",
        "tiny",
        "small",
      ];
    case "summaryKeywords":
      return [
        "summarize",
        "summary",
        "changelog",
        "rewrite",
        "reformat",
        "format",
        "rename",
        "explain briefly",
        "recap",
        "tl;dr",
      ];
    case "planningKeywords":
      return [
        "plan",
        "planning",
        "architecture",
        "architect",
        "design",
        "tradeoff",
        "trade-off",
        "research",
        "investigate",
        "root cause",
        "analyze",
        "analysis",
        "migration",
        "strategy",
        "compare",
        "options",
        "approach",
      ];
    case "implementationKeywords":
      return [
        "implement",
        "code",
        "fix",
        "update",
        "edit",
        "write",
        "refactor",
        "add tests",
        "patch",
        "change",
        "apply",
        "continue",
        "resume",
        "make the changes",
        "go ahead",
      ];
    case "lookupKeywords":
      return [
        "where is",
        "which file",
        "show me",
        "list",
        "what files",
        "find",
        "grep",
      ];
    default:
      return [];
  }
};

const escapeRegex = (str: string): string => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

export const phaseForTier = (tier: RouterTier): RouterPhase => {
  if (tier === "high") return "planning";
  if (tier === "medium") return "implementation";
  return "lightweight" as RouterPhase;
};

export const resolveAvailableTier = (
  profile: RouterProfile,
  preferred: RouterTier,
): RouterTier | undefined => {
  if (profile[preferred]) return preferred;
  const order: RouterTier[] = ["low", "medium", "high"];
  const startIdx = order.indexOf(preferred);
  for (let i = startIdx + 1; i < order.length; i++) {
    const tier = order[i];
    if (tier && profile[tier]) return tier;
  }
  for (let i = startIdx - 1; i >= 0; i--) {
    const tier = order[i];
    if (tier && profile[tier]) return tier;
  }
  return undefined;
};

export const buildRoutingDecision = (
  profileName: string,
  profile: RouterProfile,
  tier: RouterTier,
  phase: RouterPhase,
  reasoning: string,
  thinkingOverrides?: RouterThinkingByTier,
  isClassifier?: boolean,
): RoutingDecision => {
  const routed = profile[tier];
  if (!routed) {
    throw new Error(
      `Profile "${profileName}" has no configuration for the ${tier} tier.`,
    );
  }
  const { provider, modelId } = parseCanonicalModelRef(routed.model);
  const baseThinking =
    routed.thinking ??
    (tier === "high" ? "high" : tier === "low" ? "low" : "medium");
  const effectiveThinking =
    thinkingOverrides?.[tier] ?? baseThinking;

  return {
    profile: profileName,
    tier,
    phase,
    targetProvider: provider,
    targetModelId: modelId,
    targetLabel: routed.model,
    reasoning,
    thinking: effectiveThinking,
    timestamp: Date.now(),
    isClassifier,
  };
};

export const decideRouting = (
  context: Context,
  profileName: string,
  profile: RouterProfile,
  previousDecision: RoutingDecision | undefined,
  pinnedTier?: RouterTier,
  thinkingOverrides?: RouterThinkingByTier,
  phaseBias = 0.5,
  rules?: RoutingRule[],
  isBudgetExceeded = false,
): RoutingDecision => {
  const prompt = getLastUserText(context).toLowerCase();
  const recentConversation = getRecentConversationText(context);
  const toolResultCount = countToolResults(context);
  const wordCount = countWords(prompt);
  const multiLinePrompt = prompt.split("\n").length >= 4;

  const explicitHighHints = [
    "best",
    "deep",
    "deeply",
    "carefully",
    "thoroughly",
    "robust",
    "comprehensive",
    "step by step",
    "think hard",
    "highest quality",
    "ultrathink",
  ];
  const explicitLowHints = [
    "fast",
    "cheap",
    "quick",
    "quickly",
    "brief",
    "briefly",
    "one sentence",
    "one line",
    "tiny",
    "small",
  ];
  const planningKeywords = [
    "plan",
    "planning",
    "architecture",
    "architect",
    "design",
    "tradeoff",
    "trade-off",
    "research",
    "investigate",
    "root cause",
    "analyze",
    "analysis",
    "migration",
    "strategy",
    "compare",
    "options",
    "approach",
  ];
  const summaryKeywords = [
    "summarize",
    "summary",
    "changelog",
    "rewrite",
    "reformat",
    "format",
    "rename",
    "explain briefly",
    "recap",
    "tl;dr",
  ];
  const implementationKeywords = [
    "implement",
    "code",
    "fix",
    "update",
    "edit",
    "write",
    "refactor",
    "add tests",
    "patch",
    "change",
    "apply",
    "continue",
    "resume",
    "make the changes",
    "go ahead",
  ];
  const lookupKeywords = [
    "where is",
    "which file",
    "show me",
    "list",
    "what files",
    "find",
    "grep",
  ];

  let phase: RouterPhase = previousDecision?.phase ?? "implementation";
  let tier: RouterTier = "medium";
  let reasoning =
    "Defaulted to medium tier for general coding work.";
  let isRuleMatched = false;

  if (pinnedTier) {
    phase = phaseForTier(pinnedTier);
    tier = pinnedTier;
    reasoning = `Pinned to ${pinnedTier} tier via /router-pin.`;
  } else {
    // Only apply custom rules to short messages (< 100 words).
    // Long messages are complex tasks that should use heuristic/LLM classification.
    if (rules && wordCount < 100) {
      let highestTier: RouterTier | undefined;
      let winningRule: RoutingRule | undefined;
      const tierRank: Record<RouterTier, number> = {
        low: 1,
        medium: 2,
        high: 3,
      };

      for (const rule of rules) {
        const matches = Array.isArray(rule.matches)
          ? rule.matches
          : [rule.matches];
        const lowercaseMatches = matches.map((m) => m.toLowerCase());
        if (containsAny(prompt, lowercaseMatches)) {
          if (
            !highestTier ||
            tierRank[rule.tier] > tierRank[highestTier]
          ) {
            highestTier = rule.tier;
            winningRule = rule;
          }
        }
      }

      if (winningRule && highestTier) {
        tier = highestTier;
        phase = phaseForTier(tier);
        const matches = Array.isArray(winningRule.matches)
          ? winningRule.matches
          : [winningRule.matches];
        reasoning =
          winningRule.reason ??
          `Matched custom routing rule for: ${matches.join(", ")}`;
        isRuleMatched = true;
      }
    }

    if (!isRuleMatched) {
      // Phase bias scaling constants — tuned empirically for coding workflows.
      // highThreshold: words needed to trigger planning tier (default ~80 with bias 0.5).
      // lowThreshold: words below which we consider it a short/bounded request (default ~8).
      const HIGH_WORD_THRESHOLD_BASE = 120;
      const HIGH_PHASE_BIAS_SCALE = 80;
      const LOW_WORD_THRESHOLD_BASE = 12;
      const LOW_PHASE_BIAS_SCALE = 8;
      const HIGH_WORD_THRESHOLD_MIN = 40;
      const LOW_WORD_THRESHOLD_MIN = 4;

      const highThreshold = Math.max(
        HIGH_WORD_THRESHOLD_MIN,
        HIGH_WORD_THRESHOLD_BASE -
          (previousDecision?.phase === "planning" ? phaseBias * HIGH_PHASE_BIAS_SCALE : 0),
      );
      const lowThreshold = Math.max(
        LOW_WORD_THRESHOLD_MIN,
        LOW_WORD_THRESHOLD_BASE -
          (previousDecision?.phase === "implementation" ||
          previousDecision?.phase === "planning"
            ? phaseBias * LOW_PHASE_BIAS_SCALE
            : 0),
      );

      if (containsAnyCached(prompt, "explicitHighHints")) {
        phase = "planning";
        tier = "high";
        reasoning =
          "Detected an explicit request for deeper or higher-quality reasoning.";
      } else if (containsAnyCached(prompt, "explicitLowHints")) {
        phase = "lightweight";
        tier = "low";
        reasoning =
          "Detected an explicit request for a faster or lighter response.";
      } else if (containsAnyCached(prompt, "summaryKeywords")) {
        phase = "lightweight";
        tier = "low";
        reasoning =
          "Detected summary or lightweight transformation keywords.";
      } else if (
        containsAnyCached(prompt, "planningKeywords") ||
        prompt.startsWith("why ") ||
        wordCount >= highThreshold ||
        multiLinePrompt
      ) {
        phase = "planning";
        tier = "high";
        reasoning =
          previousDecision?.phase === "planning"
            ? "Continued planning phase based on complexity or keywords."
            : "Detected planning, broad analysis, or a high-complexity request.";
      } else if (containsAnyCached(prompt, "implementationKeywords")) {
        phase = "implementation";
        tier = "medium";
        reasoning =
          "Detected implementation-oriented work with bounded execution scope.";
      } else if (
        containsAnyCached(prompt, "lookupKeywords") &&
        wordCount <= 24 &&
        toolResultCount === 0
      ) {
        phase = "lightweight";
        tier = "low";
        reasoning = "Detected a short read-only lookup request.";
      } else if (
        previousDecision?.phase === "planning" &&
        toolResultCount === 0 &&
        wordCount > lowThreshold
      ) {
        phase = "planning";
        tier = "high";
        reasoning =
          "Kept the planning-phase bias because the conversation still looks exploratory.";
      } else if (
        toolResultCount > 0 ||
        previousDecision?.phase === "implementation" ||
        recentConversation.includes("plan:")
      ) {
        phase = "implementation";
        tier = "medium";
        reasoning =
          "Detected active implementation work from prior tools or recent plan execution context.";
      } else if (wordCount <= lowThreshold) {
        phase = "lightweight";
        tier = "low";
        reasoning = "Detected a short bounded request.";
      }
    }
  }

  // Budget cap always applies, even when tier is pinned (safety net).
  let isBudgetForced = false;
  if (isBudgetExceeded && tier === "high") {
    tier = "medium";
    phase = "implementation";
    reasoning = `Budget exceeded. Downgraded from high to medium tier. (Original: ${reasoning})`;
    isBudgetForced = true;
  }

  const resolvedTier = resolveAvailableTier(profile, tier);
  if (resolvedTier === undefined) {
    throw new Error(
      `Profile "${profileName}" has no configured tier for preferred "${tier}". ` +
        "This should not happen — the config normalizer skips profiles with no valid tiers.",
    );
  }
  if (resolvedTier !== tier) {
    reasoning = `Resolved from ${tier} to ${resolvedTier} tier (${tier} tier is not configured). Original: ${reasoning}`;
    phase = phaseForTier(resolvedTier);
    tier = resolvedTier;
  }

  const decision = buildRoutingDecision(
    profileName,
    profile,
    tier,
    phase,
    reasoning,
    thinkingOverrides,
    false,
  );
  decision.isRuleMatched = isRuleMatched;
  decision.isBudgetForced = isBudgetForced;
  return decision;
};

export const runClassifier = async (
  classifierModelRef: string,
  modelRegistry: ExtensionContext["modelRegistry"],
  context: Context,
  currentPhase?: RouterPhase,
  thinking?: ThinkingLevel,
): Promise<{ tier: RouterTier; reasoning: string } | undefined> => {
  try {
    const { provider, modelId } = parseCanonicalModelRef(classifierModelRef);
    const model = modelRegistry.find(provider, modelId);
    if (!model) return undefined;

    const auth = await modelRegistry.getApiKeyAndHeaders(model);
    if (!auth.ok || !auth.apiKey) return undefined;
    const apiKey = auth.apiKey;
    const headers = auth.headers;

    // Only send the last 300 chars of the prompt to the classifier.
    // Long prompts with templates/instructions confuse the classifier,
    // and the actual task intent is usually at the end.
    const fullPrompt = getLastUserText(context);
    const promptText =
      fullPrompt.length > 300
        ? "..." + fullPrompt.slice(-300)
        : fullPrompt;
    const historyText = getRecentConversationText(context, 4);

    const classifierPrompt = `You are a model router classifier. Your job is to categorize the user's latest request into one of three tiers: "high", "medium", or "low".

Tiers:
- high: Architecture, design, planning, tradeoff analysis, broad debugging, large refactors, codebase research.
- medium: Implementation of a known plan, multi-file edits, normal coding work, focused debugging, tests/fixes.
- low: Summaries, changelogs, formatting, quick explanations, small bounded transforms, simple read-only lookup.

${
  currentPhase
    ? `Current conversation phase: ${currentPhase}\n`
    : ""
}
Recent history:
${historyText}

Latest user message:
${promptText}

IMPORTANT: Focus on the actual task intent, not template instructions or formatting. A request to "create a plan" is always high tier, even if it mentions "lightweight" as a plan style.

Return your decision in exactly two lines:
Tier: [high|medium|low]
Reasoning: [one short sentence]`;

    // Add phase bias notes after the main prompt
    const phaseBiasNote =
      currentPhase === "planning"
        ? "\n\nConsider that the conversation is currently in a planning phase. Bias toward \"high\" unless the request is clearly a simple implementation or summary."
        : currentPhase === "implementation"
          ? "\n\nConsider that the conversation is currently in an implementation phase. Bias toward \"medium\" unless the request is clearly planning or a simple summary."
          : "";

    const classifierContext: Context = {
      ...context,
      messages: [
        {
          role: "user",
          content: classifierPrompt + phaseBiasNote,
          timestamp: Date.now(),
        },
      ],
    };

    const reasoningOption =
      model.reasoning && thinking && thinking !== "off"
        ? thinking
        : undefined;

    const streamOptions: Record<string, unknown> = {
      apiKey,
      ...(headers ? { headers } : {}),
      ...(reasoningOption ? { reasoning: reasoningOption } : {}),
    };
    const stream = streamSimple(model, classifierContext, streamOptions as any);
    let fullText = "";
    for await (const event of stream) {
      if (
        event.type === "text_delta" &&
        typeof (event as any).delta === "string"
      ) {
        fullText += (event as any).delta;
      }
    }

    const lines = fullText.trim().split("\n");
    const tierLine = lines.find((l) =>
      l.toLowerCase().startsWith("tier:"),
    );
    const reasoningLine = lines.find((l) =>
      l.toLowerCase().startsWith("reasoning:"),
    );

    if (tierLine) {
      const parts = tierLine.split(":");
      const tierValue = parts[1]?.trim().toLowerCase();
      if (tierValue && isRouterTier(tierValue)) {
        let reasoningText: string;
        if (reasoningLine) {
          const rlParts = reasoningLine.split(":");
          reasoningText = rlParts[1]?.trim() ?? "Classifier decision.";
        } else {
          reasoningText = "Classifier decision.";
        }
        return {
          tier: tierValue,
          reasoning: reasoningText,
        };
      }
    }
  } catch {
    /* Ignore classifier errors and fall back to heuristics */
  }
  return undefined;
};
