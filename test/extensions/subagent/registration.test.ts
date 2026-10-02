import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import subagentExtension from "../../../packages/subagent/extensions/subagent/index.ts";

function mockPi() {
  return {
    registerTool: vi.fn(),
    registerCommand: vi.fn(),
    on: vi.fn(),
  } as unknown as ExtensionAPI & {
    registerTool: ReturnType<typeof vi.fn>;
    registerCommand: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
  };
}

describe("subagent extension registration", () => {
  it("registers the subagent tool", () => {
    const pi = mockPi();
    subagentExtension(pi);
    expect(pi.registerTool).toHaveBeenCalledTimes(1);
    const tool = pi.registerTool.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(tool.name).toBe("subagent");
    expect(tool.label).toBe("Subagent");
    expect(typeof tool.description).toBe("string");
    expect(tool.parameters).toBeDefined();
    expect(typeof tool.execute).toBe("function");
    expect(typeof tool.renderCall).toBe("function");
    expect(typeof tool.renderResult).toBe("function");
  });

  it("registers the subagent-list command", () => {
    const pi = mockPi();
    subagentExtension(pi);
    expect(pi.registerCommand).toHaveBeenCalledWith("subagent-list", expect.objectContaining({ description: expect.any(String) }));
  });

  it("does not import project TypeScript agents while listing an untrusted project", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "subagent-list-trust-"));
    const agentsDir = join(cwd, ".pi", "agents");
    const marker = join(cwd, "agent-imported.txt");
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(
      join(agentsDir, "project-agent.js"),
      `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(marker)}, "loaded");\nexport const agent = { name: "project-agent", description: "project agent", systemPrompt: "test" };\n`,
    );

    try {
      const pi = mockPi();
      subagentExtension(pi);
      const registration = pi.registerCommand.mock.calls.find(([name]) => name === "subagent-list");
      const command = registration?.[1] as { handler: (args: string, ctx: unknown) => Promise<void> };
      const notify = vi.fn();
      await command.handler("", {
        cwd,
        isProjectTrusted: () => false,
        ui: { notify },
      });

      expect(existsSync(marker)).toBe(false);
      expect(notify.mock.calls[0]?.[0]).not.toContain("project-agent");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
