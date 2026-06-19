import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type {
  RouterConfig,
  RouterProfile,
  RoutedTierConfig,
  ConfigLoadResult,
  ParsedConfigFile,
  RouterTier,
  RoutingRule,
  ModelDefinition,
  ClassifierConfig,
} from "./types.js";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_MAX_OUTPUT_TOKENS,
  THINKING_LEVELS,
  ROUTER_TIERS,
  DEFAULT_THINKING_LEVELS,
} from "./constants.js";

export { ROUTER_TIERS, THINKING_LEVELS };

export const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isThinkingLevel = (value: unknown): value is ThinkingLevel =>
  typeof value === "string" && THINKING_LEVELS.includes(value as ThinkingLevel);

export const isRouterTier = (value: unknown): value is RouterTier =>
  value === "high" || value === "medium" || value === "low";

export const parseConfigFile = (path: string): ParsedConfigFile => {
  if (!existsSync(path)) {
    return { config: {}, warnings: [], found: false };
  }

  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
    if (!isObjectRecord(parsed)) {
      return {
        config: {},
        warnings: [`Ignored router config at ${path}: expected a JSON object.`],
        found: true,
      };
    }
    return { config: parsed as Partial<RouterConfig>, warnings: [], found: true };
  } catch (error) {
    return {
      config: {},
      warnings: [
        `Failed to parse router config at ${path}: ${error instanceof Error ? error.message : String(error)}`,
      ],
      found: true,
    };
  }
};

export const mergeConfig = (
  base: RouterConfig,
  override: Partial<RouterConfig>,
): RouterConfig => {
  const mergedProfiles: Record<string, RouterProfile> = { ...base.profiles };
  for (const [name, profile] of Object.entries(override.profiles ?? {})) {
    const existing = mergedProfiles[name];
    const nextProfile = profile as Partial<RouterProfile>;
    mergedProfiles[name] = {
      high: mergeTier(existing?.high, nextProfile.high),
      medium: mergeTier(existing?.medium, nextProfile.medium),
      low: mergeTier(existing?.low, nextProfile.low),
    };
  }

  const mergedModels: Record<string, ModelDefinition> = {
    ...(base.models ?? {}),
    ...(override.models ?? {}),
  };

  return {
    debug: override.debug ?? base.debug,
    classifierModel: override.classifierModel ?? base.classifierModel,
    phaseBias: override.phaseBias ?? base.phaseBias,
    maxSessionBudget: override.maxSessionBudget ?? base.maxSessionBudget,
    rules: override.rules ?? base.rules,
    profiles: mergedProfiles,
    models: Object.keys(mergedModels).length > 0 ? mergedModels : undefined,
  };
};

const mergeTier = (
  existing?: RoutedTierConfig,
  next?: Partial<RoutedTierConfig>,
): RoutedTierConfig | undefined => {
  if (!existing && !next) return undefined;
  if (!next) return existing;
  if (!existing) return next as RoutedTierConfig;
  return { ...existing, ...next };
};

export const resolveModelRef = (
  ref: string,
  models: Record<string, ModelDefinition> | undefined,
): { canonicalRef: string; definition?: ModelDefinition } => {
  const definition = models?.[ref];
  if (definition) {
    return { canonicalRef: definition.model, definition };
  }
  return { canonicalRef: ref };
};

export const parseCanonicalModelRef = (
  value: string,
): { provider: string; modelId: string } => {
  const slashIndex = value.indexOf("/");
  if (slashIndex === -1) {
    throw new Error(
      `Invalid model reference "${value}". Expected "provider/model".`,
    );
  }
  const provider = value.slice(0, slashIndex).trim();
  const modelId = value.slice(slashIndex + 1).trim();
  if (!provider || !modelId) {
    throw new Error(
      `Invalid model reference "${value}". Expected "provider/model".`,
    );
  }
  return { provider, modelId };
};

export const normalizeModelsMap = (
  raw: Record<string, unknown> | undefined,
  warnings: string[],
): Record<string, ModelDefinition> => {
  const result: Record<string, ModelDefinition> = {};
  if (!raw || !isObjectRecord(raw)) return result;

  for (const [alias, entry] of Object.entries(raw)) {
    if (!isObjectRecord(entry)) {
      warnings.push(
        `Ignored invalid model definition "${alias}": expected an object.`,
      );
      continue;
    }

    const model = typeof entry.model === "string" ? entry.model.trim() : "";
    if (!model) {
      warnings.push(
        `Model definition "${alias}" is missing the "model" field. Skipped.`,
      );
      continue;
    }

    try {
      parseCanonicalModelRef(model);
    } catch (error) {
      warnings.push(
        `Model definition "${alias}": ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }

    const contextWindow =
      typeof entry.contextWindow === "number" && entry.contextWindow > 0
        ? entry.contextWindow
        : undefined;
    if (entry.contextWindow !== undefined && !contextWindow) {
      warnings.push(
        `Model definition "${alias}" has invalid contextWindow. Ignored.`,
      );
    }

    const maxOutputTokens =
      typeof entry.maxOutputTokens === "number" && entry.maxOutputTokens > 0
        ? entry.maxOutputTokens
        : undefined;
    if (entry.maxOutputTokens !== undefined && !maxOutputTokens) {
      warnings.push(
        `Model definition "${alias}" has invalid maxOutputTokens. Ignored.`,
      );
    }

    const reasoning =
      typeof entry.reasoning === "boolean" ? entry.reasoning : undefined;

    let thinkingLevels: ThinkingLevel[] | undefined;
    if (Array.isArray(entry.thinkingLevels)) {
      thinkingLevels = entry.thinkingLevels.filter(
        (l): l is ThinkingLevel => isThinkingLevel(l),
      );
      if (thinkingLevels.length === 0) thinkingLevels = undefined;
    }

    result[alias] = { model, contextWindow, maxOutputTokens, reasoning, thinkingLevels };
  }

  return result;
};

export const normalizeTierConfig = (
  value: unknown,
  profileName: string,
  tier: RouterTier,
  warnings: string[],
  models?: Record<string, ModelDefinition>,
): RoutedTierConfig | undefined => {
  if (!isObjectRecord(value)) {
    return undefined;
  }

  const rawModel = typeof value.model === "string" ? value.model.trim() : "";
  let aliasDefinition: ModelDefinition | undefined;

  if (!rawModel) {
    warnings.push(
      `Profile "${profileName}" ${tier} tier is missing a model. Tier disabled.`,
    );
    return undefined;
  }

  const resolved = resolveModelRef(rawModel, models);
  aliasDefinition = resolved.definition;
  let parsedModel: string;
  try {
    parseCanonicalModelRef(resolved.canonicalRef);
    parsedModel = resolved.canonicalRef;
  } catch (error) {
    warnings.push(
      `Profile "${profileName}" ${tier} tier: ${error instanceof Error ? error.message : String(error)}. Tier disabled.`,
    );
    return undefined;
  }

  const thinking = isThinkingLevel(value.thinking)
    ? value.thinking
    : "medium";
  if (value.thinking !== undefined && !isThinkingLevel(value.thinking)) {
    warnings.push(
      `Profile "${profileName}" ${tier} tier has invalid thinking level. Defaulting to medium.`,
    );
  }

  let fallbacks: string[] | undefined = undefined;
  if (Array.isArray(value.fallbacks)) {
    fallbacks = [];
    for (const f of value.fallbacks) {
      if (typeof f === "string") {
        const resolvedFallback = resolveModelRef(f, models);
        try {
          parseCanonicalModelRef(resolvedFallback.canonicalRef);
          fallbacks.push(resolvedFallback.canonicalRef);
        } catch (error) {
          warnings.push(
            `Invalid fallback model "${f}" in profile "${profileName}" ${tier} tier: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }
  }

  const tierContextWindow =
    typeof value.contextWindow === "number" && value.contextWindow > 0
      ? value.contextWindow
      : undefined;
  const resolvedContextWindow =
    tierContextWindow ?? aliasDefinition?.contextWindow ?? DEFAULT_CONTEXT_WINDOW;

  const tierMaxOutputTokens =
    typeof value.maxOutputTokens === "number" && value.maxOutputTokens > 0
      ? value.maxOutputTokens
      : undefined;
  const resolvedMaxOutputTokens =
    tierMaxOutputTokens ?? aliasDefinition?.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;

  const tierReasoning =
    typeof value.reasoning === "boolean" ? value.reasoning : undefined;
  const effectiveReasoning = tierReasoning ?? aliasDefinition?.reasoning;

  let tierThinkingLevels: ThinkingLevel[] | undefined;
  if (Array.isArray(value.thinkingLevels)) {
    tierThinkingLevels = (value.thinkingLevels as unknown[]).filter(
      (l): l is ThinkingLevel => isThinkingLevel(l),
    );
    if (tierThinkingLevels.length === 0) tierThinkingLevels = undefined;
  }

  const baseThinkingLevels: ThinkingLevel[] =
    tierThinkingLevels ??
    aliasDefinition?.thinkingLevels ??
    (effectiveReasoning === false ? [] : [...DEFAULT_THINKING_LEVELS]);

  const resolvedThinkingLevels: ThinkingLevel[] = [...baseThinkingLevels];
  if (thinking !== "off" && !resolvedThinkingLevels.includes(thinking)) {
    resolvedThinkingLevels.push(thinking);
  }

  return {
    model: parsedModel,
    thinking,
    fallbacks,
    contextWindow: tierContextWindow,
    maxOutputTokens: tierMaxOutputTokens,
    reasoning: tierReasoning,
    thinkingLevels: tierThinkingLevels,
    resolvedContextWindow,
    resolvedMaxOutputTokens,
    resolvedThinkingLevels,
  };
};

export const normalizeConfig = (raw: RouterConfig): ConfigLoadResult => {
  const warnings: string[] = [];

  const normalizedModels = normalizeModelsMap(
    raw.models as Record<string, unknown> | undefined,
    warnings,
  );
  const hasModels = Object.keys(normalizedModels).length > 0;

  const normalizedProfiles: Record<string, RouterProfile> = {};

  for (const [name, profile] of Object.entries(
    raw.profiles ?? {},
  )) {
    const typedProfile = profile as RouterProfile | undefined;
    const high = normalizeTierConfig(
      typedProfile?.high,
      name,
      "high",
      warnings,
      hasModels ? normalizedModels : undefined,
    );
    const medium = normalizeTierConfig(
      typedProfile?.medium,
      name,
      "medium",
      warnings,
      hasModels ? normalizedModels : undefined,
    );
    const low = normalizeTierConfig(
      typedProfile?.low,
      name,
      "low",
      warnings,
      hasModels ? normalizedModels : undefined,
    );

    if (!high && !medium && !low) {
      warnings.push(`Profile "${name}" has no valid tiers. Skipped.`);
      continue;
    }

    normalizedProfiles[name] = {
      high,
      medium,
      low,
    } as RouterProfile;
  }

  const phaseBias =
    typeof raw.phaseBias === "number"
      ? Math.max(0, Math.min(1, raw.phaseBias))
      : 0.5;

  const maxSessionBudget =
    typeof raw.maxSessionBudget === "number" && raw.maxSessionBudget > 0
      ? raw.maxSessionBudget
      : undefined;

  const rules: RoutingRule[] = [];
  if (Array.isArray(raw.rules)) {
    for (const rule of raw.rules) {
      if (isObjectRecord(rule)) {
        const matches = rule.matches;
        const tier = rule.tier;
        if (
          (typeof matches === "string" || Array.isArray(matches)) &&
          isRouterTier(tier)
        ) {
          rules.push({
            matches,
            tier,
            reason: typeof rule.reason === "string" ? rule.reason : undefined,
          });
        } else {
          warnings.push(`Ignored invalid routing rule: ${JSON.stringify(rule)}`);
        }
      }
    }
  }

  let classifierModel: ClassifierConfig | undefined;
  const rawClassifier = raw.classifierModel as unknown;
  if (typeof rawClassifier === "string" && rawClassifier.trim()) {
    const resolved = resolveModelRef(
      rawClassifier.trim(),
      hasModels ? normalizedModels : undefined,
    );
    try {
      parseCanonicalModelRef(resolved.canonicalRef);
      classifierModel = { model: resolved.canonicalRef };
    } catch (error) {
      warnings.push(
        `Invalid classifierModel: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  } else if (isObjectRecord(rawClassifier)) {
    const modelRef =
      typeof rawClassifier.model === "string" ? rawClassifier.model.trim() : "";
    if (modelRef) {
      const resolved = resolveModelRef(
        modelRef,
        hasModels ? normalizedModels : undefined,
      );
      try {
        parseCanonicalModelRef(resolved.canonicalRef);
        const thinking = isThinkingLevel(rawClassifier.thinking)
          ? rawClassifier.thinking
          : undefined;
        if (rawClassifier.thinking !== undefined && !thinking) {
          warnings.push(
            `classifierModel has invalid thinking level "${String(rawClassifier.thinking)}". Ignored.`,
          );
        }
        classifierModel = { model: resolved.canonicalRef, thinking };
      } catch (error) {
        warnings.push(
          `Invalid classifierModel: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } else {
      warnings.push(
        'classifierModel object is missing the "model" field. Ignored.',
      );
    }
  }

  return {
    config: {
      debug: typeof raw.debug === "boolean" ? raw.debug : false,
      classifierModel,
      phaseBias,
      maxSessionBudget,
      rules: rules.length > 0 ? rules : undefined,
      profiles: normalizedProfiles,
      models: hasModels ? normalizedModels : undefined,
    },
    warnings,
  };
};

export const loadRouterConfig = (cwd: string): ConfigLoadResult => {
  const globalPath = join(getAgentDir(), "model-router.json");
  const projectPath = join(cwd, ".pi", "model-router.json");
  const globalResult = parseConfigFile(globalPath);
  const projectResult = parseConfigFile(projectPath);
  const baseConfig: RouterConfig = { profiles: {} };
  const merged = mergeConfig(
    mergeConfig(baseConfig, globalResult.config),
    projectResult.config,
  );
  const normalized = normalizeConfig(merged);

  // Determine which config file was actually loaded
  let configPath: string | undefined;
  if (projectResult.found) {
    configPath = projectPath;
  } else if (globalResult.found) {
    configPath = globalPath;
  }

  // Warn if no config was found at all
  const warnings = [
    ...globalResult.warnings,
    ...projectResult.warnings,
    ...normalized.warnings,
  ];
  if (!projectResult.found && !globalResult.found) {
    warnings.push(
      "No router config found. Created a default empty config. " +
        "Run `/router init` to create a config from the example, or create one manually at:\n" +
        `  Global:  ${globalPath}\n` +
        `  Project: ${projectPath}`,
    );
  }

  const result: ConfigLoadResult = {
    config: normalized.config,
    warnings,
  };
  if (configPath !== undefined) {
    result.configPath = configPath;
  }
  return result;
};

export const profileNames = (config: RouterConfig): string[] => {
  return Object.keys(config.profiles).sort();
};

export const resolveProfileName = (
  config: RouterConfig,
  requested?: string,
): string | undefined => {
  if (requested && config.profiles[requested]) {
    return requested;
  }
  return undefined;
};

export const resolveContextWindow = (
  tier: RouterTier,
  profile: RouterProfile,
  modelRegistry: ExtensionContext["modelRegistry"] | undefined,
): number => {
  const tierConfig = profile[tier];
  if (!tierConfig) return DEFAULT_CONTEXT_WINDOW;

  if (modelRegistry) {
    try {
      const { provider, modelId } = parseCanonicalModelRef(tierConfig.model);
      const registryModel = modelRegistry.find(provider, modelId);
      if (registryModel?.contextWindow) return registryModel.contextWindow;
    } catch {
      /* ignore */
    }
  }

  return tierConfig.resolvedContextWindow ?? DEFAULT_CONTEXT_WINDOW;
};

export const resolveMaxOutputTokens = (
  tier: RouterTier,
  profile: RouterProfile,
  modelRegistry: ExtensionContext["modelRegistry"] | undefined,
): number => {
  const tierConfig = profile[tier];
  if (!tierConfig) return DEFAULT_MAX_OUTPUT_TOKENS;

  if (modelRegistry) {
    try {
      const { provider, modelId } = parseCanonicalModelRef(tierConfig.model);
      const registryModel = modelRegistry.find(provider, modelId);
      if (registryModel?.maxTokens) return registryModel.maxTokens;
    } catch {
      /* ignore */
    }
  }

  return tierConfig.resolvedMaxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
};

export const collectProfileThinkingLevels = (
  profile: RouterProfile,
): Set<ThinkingLevel> => {
  const levels = new Set<ThinkingLevel>();
  for (const tier of ROUTER_TIERS) {
    const tierConfig = profile[tier];
    if (!tierConfig?.resolvedThinkingLevels) continue;
    for (const level of tierConfig.resolvedThinkingLevels) {
      levels.add(level);
    }
  }
  return levels;
};

export const getUnsupportedTiers = (
  profile: RouterProfile,
  level: ThinkingLevel,
): string[] => {
  const unsupported: string[] = [];
  for (const tier of ROUTER_TIERS) {
    const tierConfig = profile[tier];
    if (!tierConfig) continue;
    if (!tierConfig.resolvedThinkingLevels?.includes(level)) {
      unsupported.push(tier);
    }
  }
  return unsupported;
};
