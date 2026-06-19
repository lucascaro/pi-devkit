import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type {
  RouterConfig,
  RouterPinByProfile,
  RouterThinkingByProfile,
  RoutingDecision,
  RouterTier,
} from "./types.js";
import { profileNames, getUnsupportedTiers } from "./config.js";
import { ROUTER_TIERS } from "./constants.js";

export const formatModelRef = (ref: string | undefined): string => {
  if (!ref) return "none";
  return ref;
};

export const formatPinSummary = (
  pins: RouterPinByProfile,
): string => {
  const entries = Object.entries(pins);
  if (entries.length === 0) return "none";
  return entries.map(([profile, tier]) => `${profile}: ${tier}`).join(", ");
};

export const formatThinkingSummary = (
  thinking: RouterThinkingByProfile,
): string => {
  const entries = Object.entries(thinking);
  if (entries.length === 0) return "none";
  return entries
    .map(([profile, tiers]) => {
      const parts = Object.entries(tiers).map(
        ([tier, level]) => `${tier}=${level}`,
      );
      return `${profile}(${parts.join(",")})`;
    })
    .join("; ");
};

export const formatDecision = (decision: RoutingDecision): string => {
  return `[${decision.tier}] ${decision.targetProvider}/${decision.targetModelId} (${decision.thinking}) — ${decision.reasoning}`;
};

const tierColor = (tier: string): string => {
  const colors: Record<string, string> = {
    high: "\x1b[32m",   // green
    medium: "\x1b[33m", // yellow
    low: "\x1b[36m",    // cyan
  };
  const reset = "\x1b[0m";
  const color = colors[tier] ?? "";
  return color ? `${color}${tier}${reset}` : tier;
};

export const updateStatus = (
  ctx: ExtensionContext,
  routerEnabled: boolean,
  selectedProfile: string | undefined,
  pinnedTierByProfile: RouterPinByProfile,
  thinkingByProfile: RouterThinkingByProfile,
  lastDecision: RoutingDecision | undefined,
  lastNonRouterModel: string | undefined,
  accumulatedCost: number,
  widgetEnabled: boolean,
  currentConfig: RouterConfig,
): void => {
  if (!widgetEnabled) {
    ctx.ui.setWidget("model-router", undefined);
    return;
  }

  const profile = selectedProfile
    ? currentConfig.profiles[selectedProfile]
    : undefined;
  const currentTier = lastDecision?.tier;
  const tierLabel = currentTier ? `[${currentTier}]` : "";
  const modelLabel = lastDecision
    ? `${lastDecision.targetProvider}/${lastDecision.targetModelId}`
    : "—";
  const costLabel = `$${accumulatedCost.toFixed(4)}`;
  const budgetLabel = currentConfig.maxSessionBudget
    ? ` / $${currentConfig.maxSessionBudget.toFixed(2)}`
    : "";

  const modelLine = routerEnabled
    ? `Model: ${modelLabel}`
    : `Model: ${lastNonRouterModel ?? "—"}`;

  const widgetText = [
    `Router: ${routerEnabled ? `${selectedProfile ?? "off"} ${tierColor(currentTier ?? "low")}` : "off"}  ${modelLine}  ${costLabel}${budgetLabel}`,
    ...(routerEnabled && lastDecision?.reasoning
      ? [lastDecision.reasoning]
      : []),
  ];

  ctx.ui.setWidget("model-router", widgetText);
};
