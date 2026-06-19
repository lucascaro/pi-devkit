import { describe, expect, it } from "vitest";
import {
  isObjectRecord,
  isThinkingLevel,
  isRouterTier,
  parseConfigFile,
  mergeConfig,
  normalizeConfig,
  parseCanonicalModelRef,
  normalizeTierConfig,
  normalizeModelsMap,
  resolveProfileName,
  profileNames,
  getUnsupportedTiers,
  collectProfileThinkingLevels,
} from "../../extensions/model-router/config.js";
import {
  extractTextFromContent,
  getLastUserText,
  getRecentConversationText,
  countToolResults,
  countWords,
  containsAny,
  containsAnyCached,
  phaseForTier,
  resolveAvailableTier,
  decideRouting,
  buildRoutingDecision,
} from "../../extensions/model-router/routing.js";
import {
  isRouterPersistedState,
  buildPersistedState,
} from "../../extensions/model-router/state.js";
import type {
  RouterConfig,
  RouterProfile,
  RouterTier,
  RoutingRule,
  RoutingDecision,
  RouterPersistedState,
} from "../../extensions/model-router/types.js";
import type { Context } from "@earendil-works/pi-ai";

// ── config.ts tests ──────────────────────────────────────────────

describe("isObjectRecord", () => {
  it("returns true for plain objects", () => {
    expect(isObjectRecord({})).toBe(true);
    expect(isObjectRecord({ a: 1 })).toBe(true);
  });
  it("returns false for null, arrays, primitives", () => {
    expect(isObjectRecord(null)).toBe(false);
    expect(isObjectRecord([])).toBe(false);
    expect(isObjectRecord("str")).toBe(false);
    expect(isObjectRecord(42)).toBe(false);
  });
});

describe("isThinkingLevel", () => {
  it("recognizes valid levels", () => {
    expect(isThinkingLevel("off")).toBe(true);
    expect(isThinkingLevel("minimal")).toBe(true);
    expect(isThinkingLevel("low")).toBe(true);
    expect(isThinkingLevel("medium")).toBe(true);
    expect(isThinkingLevel("high")).toBe(true);
    expect(isThinkingLevel("xhigh")).toBe(true);
  });
  it("rejects invalid levels", () => {
    expect(isThinkingLevel("turbo")).toBe(false);
    expect(isThinkingLevel("")).toBe(false);
  });
});

describe("isRouterTier", () => {
  it("recognizes valid tiers", () => {
    expect(isRouterTier("high")).toBe(true);
    expect(isRouterTier("medium")).toBe(true);
    expect(isRouterTier("low")).toBe(true);
  });
  it("rejects invalid tiers", () => {
    expect(isRouterTier("extreme")).toBe(false);
  });
});

describe("parseCanonicalModelRef", () => {
  it("splits provider/model", () => {
    const result = parseCanonicalModelRef("openai/gpt-5.4");
    expect(result).toEqual({ provider: "openai", modelId: "gpt-5.4" });
  });
  it("throws on missing slash", () => {
    expect(() => parseCanonicalModelRef("gpt-5.4")).toThrow(
      'Invalid model reference "gpt-5.4"',
    );
  });
  it("throws on empty parts", () => {
    expect(() => parseCanonicalModelRef("/model")).toThrow();
    expect(() => parseCanonicalModelRef("provider/")).toThrow();
  });
});

describe("parseConfigFile", () => {
  it("returns empty config for missing file", () => {
    const result = parseConfigFile("/nonexistent/path.json");
    expect(result.config).toEqual({});
    expect(result.warnings).toEqual([]);
  });
});

describe("mergeConfig", () => {
  it("merges profiles", () => {
    const base: RouterConfig = {
      profiles: {
        balanced: {
          high: { model: "openai/gpt-5.4", thinking: "high" },
          medium: { model: "anthropic/claude-sonnet-4-6", thinking: "medium" },
          low: { model: "google/gemini-flash-latest", thinking: "low" },
        },
      },
    };
    const override: Partial<RouterConfig> = {
      profiles: {
        balanced: {
          high: { model: "openai/gpt-5.5", thinking: "xhigh" },
        },
      },
    };
    const merged = mergeConfig(base, override);
    const profile = merged.profiles.balanced;
    expect(profile?.high?.model).toBe("openai/gpt-5.5");
    expect(profile?.high?.thinking).toBe("xhigh");
    expect(profile?.medium?.model).toBe("anthropic/claude-sonnet-4-6");
  });
});

describe("normalizeConfig", () => {
  it("normalizes a valid config", () => {
    const config: RouterConfig = {
      profiles: {
        test: {
          high: {
            model: "openai/gpt-5.4",
            thinking: "high",
            contextWindow: 256000,
            maxOutputTokens: 64000,
          },
          medium: { model: "anthropic/claude-sonnet-4-6", thinking: "medium" },
          low: { model: "google/gemini-flash-latest", thinking: "low" },
        },
      },
    };
    const result = normalizeConfig(config);
    expect(result.warnings).toEqual([]);
    expect(result.config.profiles.test).toBeDefined();
    expect(result.config.profiles.test!.high!.model).toBe("openai/gpt-5.4");
    expect(result.config.profiles.test!.high!.resolvedContextWindow).toBe(256000);
  });

  it("warns on missing model in tier", () => {
    const config: RouterConfig = {
      profiles: {
        bad: {
          high: { model: "", thinking: "high" },
          medium: { model: "openai/gpt-5.4", thinking: "medium" },
          low: { model: "google/gemini-flash-latest", thinking: "low" },
        },
      },
    };
    const result = normalizeConfig(config);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.config.profiles.bad!.high).toBeUndefined();
  });

  it("normalizes model aliases", () => {
    const config: RouterConfig = {
      models: {
        fast: { model: "google/gemini-flash-latest", contextWindow: 1048576 },
      },
      profiles: {
        test: {
          high: { model: "fast", thinking: "low" },
          medium: { model: "fast", thinking: "off" },
          low: { model: "fast", thinking: "off" },
        },
      },
    };
    const result = normalizeConfig(config);
    expect(result.warnings).toEqual([]);
    const models = result.config.models;
    const profiles = result.config.profiles;
    expect(models).toBeDefined();
    expect(models?.fast?.model).toBe("google/gemini-flash-latest");
    expect(profiles?.test?.high?.model).toBe("google/gemini-flash-latest");
  });

  it("normalizes classifier model", () => {
    const config: RouterConfig = {
      classifierModel: "google/gemini-flash-latest",
      profiles: {
        test: {
          high: { model: "openai/gpt-5.4", thinking: "high" },
          medium: { model: "google/gemini-flash-latest", thinking: "medium" },
          low: { model: "google/gemini-flash-latest", thinking: "low" },
        },
      },
    };
    const result = normalizeConfig(config);
    expect(result.config.classifierModel).toEqual({
      model: "google/gemini-flash-latest",
    });
  });

  it("normalizes rules", () => {
    const inputRules: RoutingRule[] = [
      { matches: "deploy", tier: "high", reason: "Production safety" },
      { matches: ["changelog", "format"], tier: "low" },
    ];
    const config: RouterConfig = {
      rules: inputRules,
      profiles: {
        test: {
          high: { model: "openai/gpt-5.4", thinking: "high" },
          medium: { model: "google/gemini-flash-latest", thinking: "medium" },
          low: { model: "google/gemini-flash-latest", thinking: "low" },
        },
      },
    };
    const result = normalizeConfig(config);
    const normalizedRules = result.config.rules!;
    expect(normalizedRules.length).toBe(2);
    expect(normalizedRules[0]!.matches).toBe("deploy");
    expect(normalizedRules[0]!.tier).toBe("high");
    expect(normalizedRules[1]!.matches).toEqual(["changelog", "format"]);
  });

  it("warns on invalid rule", () => {
    const config: RouterConfig = {
      rules: [{ matches: "deploy", tier: "extreme" as RouterTier }],
      profiles: {
        test: {
          high: { model: "openai/gpt-5.4", thinking: "high" },
          medium: { model: "google/gemini-flash-latest", thinking: "medium" },
          low: { model: "google/gemini-flash-latest", thinking: "low" },
        },
      },
    };
    const result = normalizeConfig(config);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("clamps phaseBias to [0, 1]", () => {
    const config: RouterConfig = {
      phaseBias: 2.0,
      profiles: {
        test: {
          high: { model: "openai/gpt-5.4", thinking: "high" },
          medium: { model: "google/gemini-flash-latest", thinking: "medium" },
          low: { model: "google/gemini-flash-latest", thinking: "low" },
        },
      },
    };
    const result = normalizeConfig(config);
    expect(result.config.phaseBias).toBe(1);
  });

  it("skips profiles with no valid tiers", () => {
    const config: RouterConfig = {
      profiles: {
        empty: {},
        valid: {
          high: { model: "openai/gpt-5.4", thinking: "high" },
          medium: { model: "google/gemini-flash-latest", thinking: "medium" },
          low: { model: "google/gemini-flash-latest", thinking: "low" },
        },
      },
    };
    const result = normalizeConfig(config);
    expect(result.config.profiles.empty).toBeUndefined();
    expect(result.config.profiles.valid).toBeDefined();
  });
});

describe("resolveProfileName", () => {
  it("returns name if profile exists", () => {
    const config: RouterConfig = {
      profiles: { balanced: { high: { model: "a" } }, cheap: { high: { model: "b" } } },
    };
    expect(resolveProfileName(config, "balanced")).toBe("balanced");
  });
  it("returns undefined for unknown profile", () => {
    const config: RouterConfig = {
      profiles: { balanced: { high: { model: "a" } } },
    };
    expect(resolveProfileName(config, "nonexistent")).toBeUndefined();
  });
});

describe("profileNames", () => {
  it("returns sorted profile names", () => {
    const config: RouterConfig = {
      profiles: { zebra: { high: { model: "a" } }, apple: { high: { model: "a" } } },
    };
    expect(profileNames(config)).toEqual(["apple", "zebra"]);
  });
});

describe("getUnsupportedTiers", () => {
  it("returns tiers that don't support the level", () => {
    const profile: RouterProfile = {
      high: {
        model: "openai/gpt-5.4",
        thinking: "high",
        resolvedThinkingLevels: ["high", "medium", "low"],
      },
      low: {
        model: "google/gemini-flash-latest",
        thinking: "low",
        resolvedThinkingLevels: ["low"],
      },
    };
    const unsupported = getUnsupportedTiers(profile, "xhigh");
    expect(unsupported).toContain("high");
    expect(unsupported).toContain("low");
  });
});

describe("collectProfileThinkingLevels", () => {
  it("collects union of all tier levels", () => {
    const profile: RouterProfile = {
      high: {
        model: "openai/gpt-5.4",
        resolvedThinkingLevels: ["high", "medium", "low", "xhigh"],
      },
      medium: {
        model: "anthropic/claude-sonnet-4-6",
        resolvedThinkingLevels: ["medium", "low"],
      },
      low: {
        model: "google/gemini-flash-latest",
        resolvedThinkingLevels: ["low"],
      },
    };
    const levels = collectProfileThinkingLevels(profile);
    expect(levels).toContain("high");
    expect(levels).toContain("medium");
    expect(levels).toContain("low");
    expect(levels).toContain("xhigh");
    expect(levels.size).toBe(4);
  });
});

// ── routing.ts tests ─────────────────────────────────────────────

describe("extractTextFromContent", () => {
  it("returns string content as-is", () => {
    expect(extractTextFromContent("hello")).toBe("hello");
  });
  it("extracts text from content parts", () => {
    const content = [
      { type: "text", text: "Hello" },
      { type: "thinking", thinking: "Thinking..." },
      { type: "toolCall", name: "bash", arguments: { command: "ls" } },
    ] as any;
    const result = extractTextFromContent(content);
    expect(result).toContain("Hello");
    expect(result).toContain("Thinking...");
    expect(result).toContain('bash {"command":"ls"}');
  });
});

describe("getLastUserText", () => {
  it("returns the last user message text", () => {
    const context: Context = {
      messages: [
        { role: "user", content: "Hello", timestamp: 1 },
        { role: "assistant", content: "Hi!", timestamp: 2 },
        { role: "user", content: "How are you?", timestamp: 3 },
      ] as any,
    };
    expect(getLastUserText(context)).toBe("How are you?");
  });
});

describe("countWords", () => {
  it("counts words correctly", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("hello")).toBe(1);
    expect(countWords("hello world")).toBe(2);
    expect(countWords("  hello   world  ")).toBe(2);
  });
});

describe("containsAny", () => {
  it("returns true if any keyword matches", () => {
    expect(containsAny("hello world", ["world", "foo"])).toBe(true);
    expect(containsAny("hello world", ["bar", "baz"])).toBe(false);
  });

  it("uses word boundaries and is case-insensitive", () => {
    expect(containsAny("unchangelogable", ["changelog"])).toBe(false);
    expect(containsAny("Changelog update", ["changelog"])).toBe(true);
    expect(containsAny("CHANGELOG", ["changelog"])).toBe(true);
    expect(containsAny("plan the changelog", ["changelog"])).toBe(true);
  });
});

describe("containsAnyCached", () => {
  it("matches explicit high hints", () => {
    expect(containsAnyCached("think hard about this", "explicitHighHints")).toBe(true);
    expect(containsAnyCached("step by step analysis", "explicitHighHints")).toBe(true);
    expect(containsAnyCached("hello world", "explicitHighHints")).toBe(false);
  });

  it("matches explicit low hints", () => {
    expect(containsAnyCached("fast quick answer", "explicitLowHints")).toBe(true);
    expect(containsAnyCached("one line summary", "explicitLowHints")).toBe(true);
    expect(containsAnyCached("hello world", "explicitLowHints")).toBe(false);
  });

  it("matches summary keywords", () => {
    expect(containsAnyCached("summarize the changelog", "summaryKeywords")).toBe(true);
    expect(containsAnyCached("tl;dr this", "summaryKeywords")).toBe(true);
    expect(containsAnyCached("hello world", "summaryKeywords")).toBe(false);
  });

  it("caches regexes for performance", () => {
    const start = Date.now();
    for (let i = 0; i < 100; i++) {
      containsAnyCached("implement the feature", "implementationKeywords");
    }
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(100); // Should be fast with caching
  });
});

describe("phaseForTier", () => {
  it("maps tiers to phases", () => {
    expect(phaseForTier("high")).toBe("planning");
    expect(phaseForTier("medium")).toBe("implementation");
    expect(phaseForTier("low")).toBe("lightweight");
  });
});

describe("resolveAvailableTier", () => {
  it("returns preferred tier if available", () => {
    const profile: RouterProfile = {
      high: { model: "a" },
      medium: { model: "b" },
    };
    expect(resolveAvailableTier(profile, "medium")).toBe("medium");
  });
  it("falls up if preferred tier unavailable", () => {
    const profile: RouterProfile = {
      high: { model: "a" },
      low: { model: "c" },
    };
    expect(resolveAvailableTier(profile, "medium")).toBe("high");
  });
  it("falls down as last resort", () => {
    const profile: RouterProfile = {
      low: { model: "c" },
    };
    expect(resolveAvailableTier(profile, "medium")).toBe("low");
  });
  it("returns undefined when no tier is available", () => {
    const profile: RouterProfile = {};
    expect(resolveAvailableTier(profile, "high")).toBeUndefined();
  });
});

describe("decideRouting", () => {
  const makeContext = (prompt: string): Context => ({
    messages: [{ role: "user", content: prompt, timestamp: Date.now() }],
  });

  const makeProfile = (): RouterProfile => ({
    high: {
      model: "openai/gpt-5.4",
      thinking: "high",
      resolvedContextWindow: 256000,
      resolvedMaxOutputTokens: 64000,
      resolvedThinkingLevels: ["high", "medium", "low"],
    },
    medium: {
      model: "anthropic/claude-sonnet-4-6",
      thinking: "medium",
      resolvedContextWindow: 200000,
      resolvedMaxOutputTokens: 16384,
      resolvedThinkingLevels: ["medium", "low"],
    },
    low: {
      model: "google/gemini-flash-latest",
      thinking: "low",
      resolvedContextWindow: 1048576,
      resolvedMaxOutputTokens: 8192,
      resolvedThinkingLevels: ["low"],
    },
  });

  it("defaults to medium tier", () => {
    const decision = decideRouting(
      makeContext("write a function"),
      "test",
      makeProfile(),
      undefined,
    );
    expect(decision.tier).toBe("medium");
    expect(decision.phase).toBe("implementation");
  });

  it("routes to high for planning keywords", () => {
    const decision = decideRouting(
      makeContext("plan the architecture for this system"),
      "test",
      makeProfile(),
      undefined,
    );
    expect(decision.tier).toBe("high");
    expect(decision.phase).toBe("planning");
  });

  it("routes to low for summary keywords", () => {
    const decision = decideRouting(
      makeContext("summarize the changelog"),
      "test",
      makeProfile(),
      undefined,
    );
    expect(decision.tier).toBe("low");
    expect(decision.phase).toBe("lightweight");
  });

  it("routes to low for short prompts", () => {
    const decision = decideRouting(
      makeContext("hi"),
      "test",
      makeProfile(),
      undefined,
    );
    expect(decision.tier).toBe("low");
  });

  it("routes to high for explicit high hints", () => {
    const decision = decideRouting(
      makeContext("think hard about this step by step"),
      "test",
      makeProfile(),
      undefined,
    );
    expect(decision.tier).toBe("high");
  });

  it("routes to low for explicit low hints", () => {
    const decision = decideRouting(
      makeContext("fast quick one line answer"),
      "test",
      makeProfile(),
      undefined,
    );
    expect(decision.tier).toBe("low");
  });

  it("respects pinned tier", () => {
    const decision = decideRouting(
      makeContext("hi"),
      "test",
      makeProfile(),
      undefined,
      "high",
    );
    expect(decision.tier).toBe("high");
  });

  it("applies custom rules", () => {
    const rules: RoutingRule[] = [
      { matches: "deploy", tier: "high", reason: "Production safety" },
    ];
    const decision = decideRouting(
      makeContext("deploy to production"),
      "test",
      makeProfile(),
      undefined,
      undefined,
      undefined,
      0.5,
      rules,
    );
    expect(decision.tier).toBe("high");
    expect(decision.isRuleMatched).toBe(true);
  });

  it("enforces budget override", () => {
    const decision = decideRouting(
      makeContext("plan the architecture deeply"),
      "test",
      makeProfile(),
      undefined,
      undefined,
      undefined,
      0.5,
      undefined,
      true,
    );
    expect(decision.tier).toBe("medium");
    expect(decision.isBudgetForced).toBe(true);
  });

  it("maintains phase stickiness for planning", () => {
    const previousDecision: RoutingDecision = {
      profile: "test",
      tier: "high",
      phase: "planning",
      targetProvider: "openai",
      targetModelId: "gpt-5.4",
      targetLabel: "openai/gpt-5.4",
      reasoning: "planning",
      thinking: "high",
      timestamp: Date.now(),
    };
    const decision = decideRouting(
      makeContext("continue the analysis"),
      "test",
      makeProfile(),
      previousDecision,
    );
    expect(decision.phase).toBe("planning");
  });
});

describe("buildRoutingDecision", () => {
  it("creates a valid routing decision", () => {
    const decision = buildRoutingDecision(
      "test",
      {
        high: {
          model: "openai/gpt-5.4",
          thinking: "high",
          resolvedThinkingLevels: ["high", "medium", "low"],
        },
      },
      "high",
      "planning",
      "Test reasoning",
    );
    expect(decision.profile).toBe("test");
    expect(decision.tier).toBe("high");
    expect(decision.phase).toBe("planning");
    expect(decision.targetProvider).toBe("openai");
    expect(decision.targetModelId).toBe("gpt-5.4");
    expect(decision.thinking).toBe("high");
    expect(decision.reasoning).toBe("Test reasoning");
  });
});

// ── state.ts tests ───────────────────────────────────────────────

describe("isRouterPersistedState", () => {
  it("accepts valid state", () => {
    const state: RouterPersistedState = {
      enabled: true,
      selectedProfile: "balanced",
      timestamp: Date.now(),
    };
    expect(isRouterPersistedState(state)).toBe(true);
  });
  it("rejects invalid state", () => {
    expect(isRouterPersistedState(null)).toBe(false);
    expect(isRouterPersistedState({})).toBe(false);
    expect(isRouterPersistedState({ enabled: true })).toBe(false);
    expect(isRouterPersistedState("string")).toBe(false);
  });
});

describe("buildPersistedState", () => {
  it("builds a complete state object", () => {
    const state = buildPersistedState(
      true,
      "balanced",
      { balanced: "high" },
      { balanced: { high: "xhigh" } },
      true,
      true,
      [],
      undefined,
      "openai/gpt-5.4",
      0.5,
    );
    expect(state.enabled).toBe(true);
    expect(state.selectedProfile).toBe("balanced");
    expect(state.pinTier).toBe("high");
    expect(state.pinByProfile).toEqual({ balanced: "high" });
    expect(state.thinkingByProfile).toEqual({ balanced: { high: "xhigh" } });
    expect(state.debugEnabled).toBe(true);
    expect(state.widgetEnabled).toBe(true);
    expect(state.lastNonRouterModel).toBe("openai/gpt-5.4");
    expect(state.accumulatedCost).toBe(0.5);
    expect(typeof state.timestamp).toBe("number");
  });
});
