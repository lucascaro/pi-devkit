import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Model } from "@earendil-works/pi-ai";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { AgentDefinition } from "../../../packages/subagent/extensions/subagent/types.ts";

const mocks = vi.hoisted(() => ({
  createRuntime: vi.fn(),
  createAgentSession: vi.fn(),
  resolveCliModel: vi.fn(),
}));

vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@earendil-works/pi-coding-agent")>();
  return {
    ...actual,
    ModelRuntime: { create: mocks.createRuntime },
    createAgentSession: mocks.createAgentSession,
    resolveCliModel: mocks.resolveCliModel,
  };
});

import { SDKBackend } from "../../../packages/subagent/extensions/subagent/backends/sdk-backend.ts";

let tempDir: string;
let previousAgentDir: string | undefined;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "sdk-backend-model-"));
  mkdirSync(join(tempDir, "project"), { recursive: true });
  previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = join(tempDir, "agent");

  mocks.createRuntime.mockResolvedValue({} as ModelRuntime);
  mocks.createAgentSession.mockRejectedValue(new Error("session creation sentinel"));
  mocks.resolveCliModel.mockReturnValue({ model: undefined, error: "no match" });
});

afterEach(() => {
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  rmSync(tempDir, { recursive: true, force: true });
});

describe("SDKBackend model resolution", () => {
  it("uses the parent model when router config is missing", async () => {
    const definition: AgentDefinition = {
      name: "scout",
      description: "Scout",
      model: "router:low",
      systemPrompt: "You are a scout.",
      source: "user",
      filePath: join(tempDir, "scout.md"),
    };
    const parentModel = { id: "parent-model", provider: "test" } as Model<any>;
    const backend = new SDKBackend();

    const result = await backend.execute(definition, "Inspect the project", {
      cwd: join(tempDir, "project"),
      parentModel,
      projectTrusted: false,
    });

    expect(mocks.resolveCliModel).not.toHaveBeenCalled();
    expect(mocks.createAgentSession).toHaveBeenCalledWith(
      expect.objectContaining({ model: parentModel }),
    );
    expect(result.errorMessage).toBe("Failed to create session: session creation sentinel");
  });
});
