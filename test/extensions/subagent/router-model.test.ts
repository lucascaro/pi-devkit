import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveRouterModel } from "../../../packages/subagent/extensions/subagent/router-model.ts";

let agentDir: string;
let cwd: string;
let previousAgentDir: string | undefined;

function writeConfig(path: string, value: unknown): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(value));
}

beforeEach(() => {
  agentDir = mkdtempSync(join(tmpdir(), "subagent-agent-"));
  cwd = mkdtempSync(join(tmpdir(), "subagent-project-"));
  previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
});

afterEach(() => {
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  rmSync(agentDir, { recursive: true, force: true });
  rmSync(cwd, { recursive: true, force: true });
});

describe("subagent router model resolution", () => {
  it("resolves a tier from the first profile and expands model aliases", () => {
    writeConfig(join(agentDir, "model-router.json"), {
      profiles: {
        default: { low: { model: "quick" } },
        alternate: { low: { model: "openai/alternate" } },
      },
      models: { quick: { model: "openai/fast" } },
    });

    expect(resolveRouterModel("router:low", cwd)).toBe("openai/fast");
  });

  it("merges project tiers over global settings without dropping other tiers", () => {
    writeConfig(join(agentDir, "model-router.json"), {
      profiles: {
        default: {
          low: { model: "openai/global-low" },
          medium: { model: "openai/global-medium" },
        },
      },
    });
    writeConfig(join(cwd, ".pi", "model-router.json"), {
      profiles: { default: { low: { model: "openai/project-low" } } },
    });

    expect(resolveRouterModel("router:default:low", cwd)).toBe("openai/project-low");
    expect(resolveRouterModel("router:medium", cwd)).toBe("openai/global-medium");
  });

  it("returns undefined for unknown tiers, profiles, or absent config", () => {
    writeConfig(join(agentDir, "model-router.json"), {
      profiles: { default: { low: { model: "openai/low" } } },
    });

    expect(resolveRouterModel("router:high", cwd)).toBeUndefined();
    expect(resolveRouterModel("router:missing:low", cwd)).toBeUndefined();
    expect(resolveRouterModel("router:unknown", cwd)).toBeUndefined();
    expect(resolveRouterModel("openai/gpt", cwd)).toBeUndefined();
  });
});
