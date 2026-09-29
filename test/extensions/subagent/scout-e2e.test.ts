import { describe, it, expect } from "vitest";
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
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "scout-router-project-"));
    const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), "scout-router-agent-"));
    const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = agentDir;

    try {
      fs.mkdirSync(path.join(cwd, ".pi"), { recursive: true });
      fs.writeFileSync(
        path.join(cwd, ".pi", "model-router.json"),
        JSON.stringify({ profiles: { test: { low: { model: "openai/scout-low" } } } }),
      );
      const resolved = await resolveRouterModel("router:low", cwd, true);
      expect(resolved).toBe("openai/scout-low");
    } finally {
      if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
      fs.rmSync(cwd, { recursive: true, force: true });
      fs.rmSync(agentDir, { recursive: true, force: true });
    }
  });

  it("discovers scout agent with router:low model", async () => {
    const discovery = await discoverAgents(
      process.cwd(),
      "user",
      [BUNDLED_AGENTS_DIR],
    );
    const scout = discovery.agents.find((a) => a.name === "scout");
    expect(scout).toBeDefined();
    expect(scout?.model).toBe("router:low");
    expect(scout?.description).toContain("recon");
  });
});
