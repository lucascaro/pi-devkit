import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { resolveRouterModel } from "../../../packages/subagent/extensions/subagent/router-model.ts";
import { discoverAgents } from "../../../packages/subagent/extensions/subagent/agents.ts";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const BUNDLED_AGENTS_DIR = path.join(
  import.meta.dirname,
  "../../../packages/subagent/extensions/subagent/agents",
);

describe("scout subagent end-to-end", () => {
  let tempRoot: string;
  let projectDir: string;
  let previousAgentDir: string | undefined;

  beforeEach(() => {
    previousAgentDir = process.env.PI_CODING_AGENT_DIR;
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "scout-router-test-"));
    const agentDir = path.join(tempRoot, "agent");
    projectDir = path.join(tempRoot, "project");
    fs.mkdirSync(agentDir, { recursive: true });
    fs.mkdirSync(path.join(projectDir, ".pi"), { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, ".pi", "model-router.json"),
      JSON.stringify({ profiles: { test: { low: { model: "openai/scout-low" } } } }),
    );
    process.env.PI_CODING_AGENT_DIR = agentDir;
  });

  afterEach(() => {
    if (previousAgentDir === undefined) {
      delete process.env.PI_CODING_AGENT_DIR;
    } else {
      process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });
  it("resolves scout's router:low to a real model", async () => {
    const scoutPath = path.join(BUNDLED_AGENTS_DIR, "scout.md");
    const { parseFrontmatter } = await import(
      "@earendil-works/pi-coding-agent"
    );
    const content = fs.readFileSync(scoutPath, "utf-8");
    const { frontmatter } = parseFrontmatter(content);
    expect(frontmatter.model).toBe("router:low");
  });

  it("resolves scout's router:low against a trusted project router config", async () => {
    const resolved = await resolveRouterModel("router:low", projectDir, true);
    expect(resolved).toBe("openai/scout-low");
  });

  it("discovers scout agent with router:low model", async () => {
    const discovery = await discoverAgents(
      projectDir,
      "user",
      [BUNDLED_AGENTS_DIR],
    );
    const scout = discovery.agents.find((a) => a.name === "scout");
    expect(scout).toBeDefined();
    expect(scout?.model).toBe("router:low");
    expect(scout?.description).toContain("recon");
  });
});
