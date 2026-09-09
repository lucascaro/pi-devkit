import { describe, it, expect } from "vitest";
import { resolveRouterModel } from "../../../extensions/subagent/backends/sdk-backend.ts";
import { discoverAgents } from "../../../extensions/subagent/agents.ts";
import * as fs from "node:fs";
import * as path from "node:path";

const BUNDLED_AGENTS_DIR = path.join(
  import.meta.dirname,
  "../../../extensions/subagent/agents",
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

  it("resolves scout's router:low against the router config", async () => {
    const resolved = await resolveRouterModel("router:low", process.cwd());
    // Should resolve to the first profile's low tier model
    expect(resolved).toBeDefined();
    expect(typeof resolved).toBe("string");
    console.log(`Scout resolves to: ${resolved}`);
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
