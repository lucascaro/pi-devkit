import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { discoverAgents, findNearestProjectAgentsDir } from "../../../extensions/subagent/agents.ts";

let tmpRoot: string;
let userAgentDir: string; // $PI_CODING_AGENT_DIR
let projectCwd: string; // contains .pi/agents
let bundledDir: string; // extra user-level (bundled) agents

function write(p: string, content: string) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, "utf8");
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "subagent-test-"));
  userAgentDir = path.join(tmpRoot, "agent");
  projectCwd = path.join(tmpRoot, "project");
  bundledDir = path.join(tmpRoot, "bundled");
  fs.mkdirSync(userAgentDir, { recursive: true });
  fs.mkdirSync(projectCwd, { recursive: true });
  fs.mkdirSync(bundledDir, { recursive: true });
  process.env.PI_CODING_AGENT_DIR = userAgentDir;
});

afterEach(() => {
  delete process.env.PI_CODING_AGENT_DIR;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("findNearestProjectAgentsDir", () => {
  it("returns null when no .pi/agents exists", () => {
    expect(findNearestProjectAgentsDir(projectCwd)).toBeNull();
  });

  it("finds .pi/agents in cwd", () => {
    write(path.join(projectCwd, ".pi", "agents", "x.md"), "---\nname: x\ndescription: d\n---\nbody");
    expect(findNearestProjectAgentsDir(projectCwd)).toBe(path.join(projectCwd, ".pi", "agents"));
  });

  it("walks up to parent directories", () => {
    write(path.join(projectCwd, ".pi", "agents", "x.md"), "---\nname: x\ndescription: d\n---\nbody");
    const nested = path.join(projectCwd, "a", "b");
    fs.mkdirSync(nested, { recursive: true });
    expect(findNearestProjectAgentsDir(nested)).toBe(path.join(projectCwd, ".pi", "agents"));
  });
});

describe("discoverAgents", () => {
  it("loads user-level YAML agents", async () => {
    write(
      path.join(userAgentDir, "agents", "scout.md"),
      "---\nname: scout\ndescription: A scout agent\nmodel: claude-haiku-4-5\ntools: read, grep\n---\nYou are a scout.",
    );
    const result = await discoverAgents(projectCwd, "user");
    expect(result.agents).toHaveLength(1);
    const scout = result.agents[0];
    expect(scout?.name).toBe("scout");
    expect(scout?.description).toBe("A scout agent");
    expect(scout?.model).toBe("claude-haiku-4-5");
    expect(scout?.tools).toEqual(["read", "grep"]);
    expect(scout?.systemPrompt).toBe("You are a scout.");
    expect(scout?.source).toBe("user");
  });

  it("skips YAML files missing name or description", async () => {
    write(path.join(userAgentDir, "agents", "bad1.md"), "---\ndescription: no name\n---\nbody");
    write(path.join(userAgentDir, "agents", "bad2.md"), "---\nname: no-desc\n---\nbody");
    const result = await discoverAgents(projectCwd, "user");
    expect(result.agents).toHaveLength(0);
  });

  it("parses tools as an array", async () => {
    write(
      path.join(userAgentDir, "agents", "arr.md"),
      "---\nname: arr\ndescription: array tools\ntools: [read, bash]\n---\nbody",
    );
    const result = await discoverAgents(projectCwd, "user");
    expect(result.agents[0]?.tools).toEqual(["read", "bash"]);
  });

  it("parses backend and isolation", async () => {
    write(
      path.join(userAgentDir, "agents", "iso.md"),
      "---\nname: iso\ndescription: isolated\nbackend: subprocess\nisolation: process\n---\nbody",
    );
    const result = await discoverAgents(projectCwd, "user");
    expect(result.agents[0]?.backend).toBe("subprocess");
    expect(result.agents[0]?.isolation).toBe("process");
  });

  it("loads project agents only when scope includes project and dir exists", async () => {
    write(path.join(projectCwd, ".pi", "agents", "proj.md"), "---\nname: proj\ndescription: project agent\n---\nbody");

    const userOnly = await discoverAgents(projectCwd, "user");
    expect(userOnly.agents.map((a) => a.name)).not.toContain("proj");

    const both = await discoverAgents(projectCwd, "both");
    expect(both.agents.map((a) => a.name)).toContain("proj");
    const proj = both.agents.find((a) => a.name === "proj");
    expect(proj?.source).toBe("project");
  });

  it("project agents override user agents with the same name", async () => {
    write(path.join(userAgentDir, "agents", "dup.md"), "---\nname: dup\ndescription: user version\n---\nuser body");
    write(path.join(projectCwd, ".pi", "agents", "dup.md"), "---\nname: dup\ndescription: project version\n---\nproject body");

    const result = await discoverAgents(projectCwd, "both");
    const dup = result.agents.find((a) => a.name === "dup");
    expect(dup?.description).toBe("project version");
    expect(dup?.source).toBe("project");
  });

  it("bundled agents load and are overridden by user agents", async () => {
    write(path.join(bundledDir, "worker.md"), "---\nname: worker\ndescription: bundled worker\n---\nbundled body");
    write(path.join(userAgentDir, "agents", "worker.md"), "---\nname: worker\ndescription: user worker\n---\nuser body");

    const result = await discoverAgents(projectCwd, "user", [bundledDir]);
    const worker = result.agents.find((a) => a.name === "worker");
    expect(worker?.description).toBe("user worker");
  });

  it("includes bundled agents when no user override exists", async () => {
    write(path.join(bundledDir, "scout.md"), "---\nname: scout\ndescription: bundled scout\n---\nbody");
    const result = await discoverAgents(projectCwd, "user", [bundledDir]);
    expect(result.agents.map((a) => a.name)).toContain("scout");
  });
});
