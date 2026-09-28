import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

type JsonRecord = Record<string, unknown>;
type RouterTier = "high" | "medium" | "low";
const ROUTER_TIERS: readonly RouterTier[] = ["high", "medium", "low"];

function asRecord(value: unknown): JsonRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonRecord
    : undefined;
}

function readConfig(path: string): JsonRecord {
  try {
    return asRecord(JSON.parse(readFileSync(path, "utf8"))) ?? {};
  } catch {
    return {};
  }
}

function mergeRouterConfig(globalConfig: JsonRecord, projectConfig: JsonRecord): JsonRecord {
  const globalProfiles = asRecord(globalConfig.profiles) ?? {};
  const projectProfiles = asRecord(projectConfig.profiles) ?? {};
  const profiles: JsonRecord = { ...globalProfiles };

  for (const [name, projectProfileValue] of Object.entries(projectProfiles)) {
    const projectProfile = asRecord(projectProfileValue);
    if (!projectProfile) continue;

    const globalProfile = asRecord(profiles[name]) ?? {};
    const mergedProfile: JsonRecord = { ...globalProfile, ...projectProfile };
    for (const tier of ROUTER_TIERS) {
      const globalTier = asRecord(globalProfile[tier]);
      const projectTier = asRecord(projectProfile[tier]);
      if (globalTier && projectTier) {
        mergedProfile[tier] = { ...globalTier, ...projectTier };
      }
    }
    profiles[name] = mergedProfile;
  }

  return {
    profiles,
    models: {
      ...(asRecord(globalConfig.models) ?? {}),
      ...(asRecord(projectConfig.models) ?? {}),
    },
  };
}

/** Resolve router:<tier> or router:<profile>:<tier> from the router config files. */
export function resolveRouterModel(ref: string, cwd: string, projectTrusted = false): string | undefined {
  if (!ref.startsWith("router:")) return undefined;

  const parts = ref.slice("router:".length).trim().split(":");
  let profileName: string | undefined;
  let tierName: string | undefined;

  if (parts.length === 1 && ROUTER_TIERS.includes(parts[0] as RouterTier)) {
    tierName = parts[0];
  } else if (parts.length === 2 && ROUTER_TIERS.includes(parts[1] as RouterTier)) {
    profileName = parts[0];
    tierName = parts[1];
  } else {
    return undefined;
  }

  const config = mergeRouterConfig(
    readConfig(join(getAgentDir(), "model-router.json")),
    projectTrusted ? readConfig(join(cwd, ".pi", "model-router.json")) : {},
  );
  const profiles = asRecord(config.profiles) ?? {};
  const selectedProfileName = profileName ?? Object.keys(profiles)[0];
  if (!selectedProfileName) return undefined;

  const profile = asRecord(profiles[selectedProfileName]);
  const tier = asRecord(profile?.[tierName!]);
  const configuredModel = typeof tier?.model === "string" ? tier.model.trim() : "";
  if (!configuredModel) return undefined;

  const modelAliases = asRecord(config.models) ?? {};
  const alias = asRecord(modelAliases[configuredModel]);
  const aliasModel = typeof alias?.model === "string" ? alias.model.trim() : "";
  return aliasModel || configuredModel;
}
