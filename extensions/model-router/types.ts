import type { ThinkingLevel } from "@earendil-works/pi-agent-core";

export type RouterTier = "high" | "medium" | "low";
export type RouterPin = RouterTier | "auto";
export type RouterPhase = "planning" | "implementation" | "lightweight";
export type RouterPinByProfile = Partial<Record<string, RouterTier>>;
export type RouterThinkingByTier = Partial<Record<RouterTier, ThinkingLevel>>;
export type RouterThinkingByProfile = Record<string, RouterThinkingByTier>;

export interface RoutingRule {
  matches: string | string[];
  tier: RouterTier;
  reason?: string | undefined;
}

export interface ModelDefinition {
  model: string;
  contextWindow?: number | undefined;
  maxOutputTokens?: number | undefined;
  reasoning?: boolean | undefined;
  thinkingLevels?: ThinkingLevel[] | undefined;
}

export interface ClassifierConfig {
  model: string;
  thinking?: ThinkingLevel | undefined;
}

export interface RoutedTierConfig {
  model: string;
  thinking?: ThinkingLevel | undefined;
  fallbacks?: string[] | undefined;
  contextWindow?: number | undefined;
  maxOutputTokens?: number | undefined;
  reasoning?: boolean | undefined;
  thinkingLevels?: ThinkingLevel[] | undefined;
  resolvedContextWindow?: number | undefined;
  resolvedMaxOutputTokens?: number | undefined;
  resolvedThinkingLevels?: ThinkingLevel[] | undefined;
}

export interface RouterProfile {
  high?: RoutedTierConfig | undefined;
  medium?: RoutedTierConfig | undefined;
  low?: RoutedTierConfig | undefined;
}

export interface RouterConfig {
  debug?: boolean | undefined;
  classifierModel?: ClassifierConfig | string | undefined;
  phaseBias?: number | undefined;
  maxSessionBudget?: number | undefined;
  rules?: RoutingRule[] | undefined;
  profiles: Record<string, RouterProfile>;
  models?: Record<string, ModelDefinition> | undefined;
}

export interface RoutingDecision {
  profile: string;
  tier: RouterTier;
  phase: RouterPhase;
  targetProvider: string;
  targetModelId: string;
  targetLabel: string;
  reasoning: string;
  thinking: ThinkingLevel;
  timestamp: number;
  isClassifier?: boolean | undefined;
  isFallback?: boolean | undefined;
  isBudgetForced?: boolean | undefined;
  isRuleMatched?: boolean | undefined;
}

export interface RouterPersistedState {
  enabled: boolean;
  selectedProfile: string;
  pinTier?: RouterTier | undefined;
  pinByProfile?: RouterPinByProfile | undefined;
  thinkingByProfile?: RouterThinkingByProfile | undefined;
  debugEnabled?: boolean | undefined;
  widgetEnabled?: boolean | undefined;
  debugHistory?: RoutingDecision[] | undefined;
  lastPhase?: RouterPhase | undefined;
  lastDecision?: RoutingDecision | undefined;
  lastNonRouterModel?: string | undefined;
  accumulatedCost?: number | undefined;
  timestamp: number;
}

export interface ConfigLoadResult {
  config: RouterConfig;
  warnings: string[];
  configPath?: string;
}

export interface ParsedConfigFile {
  config: Partial<RouterConfig>;
  warnings: string[];
  found: boolean;
}

export interface CustomSessionEntry {
  type: string;
  customType?: string;
  data?: unknown;
}
