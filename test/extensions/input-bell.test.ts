import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CONFIG_DIR_NAME,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import inputBellExtension from "../../extensions/input-bell/index.ts";

const BEL = "\x07";

function mockPi(): ExtensionAPI & { on: ReturnType<typeof vi.fn>; registerCommand: ReturnType<typeof vi.fn> } {
  return {
    on: vi.fn(),
    registerCommand: vi.fn(),
  } as unknown as ExtensionAPI & { on: ReturnType<typeof vi.fn>; registerCommand: ReturnType<typeof vi.fn> };
}

function handlerFor(
  pi: ExtensionAPI & { on: ReturnType<typeof vi.fn> },
  event: string,
): (event: unknown, ctx: ExtensionContext) => void {
  const call = pi.on.mock.calls.find((c) => c[0] === event);
  if (!call) throw new Error(`no handler registered for ${event}`);
  return call[1] as (event: unknown, ctx: ExtensionContext) => void;
}

function makeCtx(overrides: Partial<ExtensionContext> = {}): ExtensionContext {
  return {
    mode: "tui",
    cwd: projectDir,
    isIdle: () => true,
    isProjectTrusted: () => true,
    ...overrides,
  } as unknown as ExtensionContext;
}

let agentDir: string;
let projectDir: string;
let writeSpy: ReturnType<typeof vi.spyOn>;

function writeGlobalSettings(value: unknown): void {
  writeFileSync(join(agentDir, "settings.json"), typeof value === "string" ? value : JSON.stringify(value));
}

function writeProjectSettings(value: unknown): void {
  const dir = join(projectDir, CONFIG_DIR_NAME);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "settings.json"), typeof value === "string" ? value : JSON.stringify(value));
}

describe("input-bell extension", () => {
  beforeEach(() => {
    agentDir = mkdtempSync(join(tmpdir(), "input-bell-agent-"));
    projectDir = mkdtempSync(join(tmpdir(), "input-bell-project-"));
    // Redirect getAgentDir() to the temp agent dir (pi's own test seam).
    process.env.PI_CODING_AGENT_DIR = agentDir;
    writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    writeSpy.mockRestore();
    delete process.env.PI_CODING_AGENT_DIR;
    rmSync(agentDir, { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
  });

  describe("agent_settled (turn end)", () => {
    it("rings the bell on agent_settled when idle in tui mode", () => {
      const pi = mockPi();
      inputBellExtension(pi);
      handlerFor(pi, "agent_settled")({}, makeCtx());
      expect(writeSpy).toHaveBeenCalledWith(BEL);
    });

    it("does not ring on agent_settled when another run is active", () => {
      const pi = mockPi();
      inputBellExtension(pi);
      handlerFor(pi, "agent_settled")({}, makeCtx({ isIdle: () => false }));
      expect(writeSpy).not.toHaveBeenCalled();
    });

    it("does not ring in non-tui modes", () => {
      const pi = mockPi();
      inputBellExtension(pi);
      const handler = handlerFor(pi, "agent_settled");
      for (const mode of ["print", "json", "rpc"] as const) {
        writeSpy.mockClear();
        handler({}, makeCtx({ mode }));
        expect(writeSpy).not.toHaveBeenCalled();
      }
    });
  });

  describe("ui_prompt_start (blocking dialog)", () => {
    it("rings the bell on ui_prompt_start in tui mode", () => {
      const pi = mockPi();
      inputBellExtension(pi);
      handlerFor(pi, "ui_prompt_start")({ type: "ui_prompt_start", reason: "ui_prompt", kind: "confirm" }, makeCtx());
      expect(writeSpy).toHaveBeenCalledWith(BEL);
    });

    it("does not ring on ui_prompt_start in non-tui modes", () => {
      const pi = mockPi();
      inputBellExtension(pi);
      handlerFor(pi, "ui_prompt_start")({ type: "ui_prompt_start", reason: "ui_prompt", kind: "select" }, makeCtx({ mode: "rpc" }));
      expect(writeSpy).not.toHaveBeenCalled();
    });
  });

  describe("inputBell setting", () => {
    it("respects inputBell false from global settings", () => {
      const pi = mockPi();
      inputBellExtension(pi);
      writeGlobalSettings({ inputBell: false });
      handlerFor(pi, "agent_settled")({}, makeCtx());
      expect(writeSpy).not.toHaveBeenCalled();
    });

    it("project settings override global (both directions)", () => {
      const pi = mockPi();
      inputBellExtension(pi);
      const handler = handlerFor(pi, "agent_settled");

      // Global on, project off -> no bell.
      writeGlobalSettings({ inputBell: true });
      writeProjectSettings({ inputBell: false });
      handler({}, makeCtx());
      expect(writeSpy).not.toHaveBeenCalled();

      // Global off, project on -> bell.
      writeSpy.mockClear();
      writeGlobalSettings({ inputBell: false });
      writeProjectSettings({ inputBell: true });
      handler({}, makeCtx());
      expect(writeSpy).toHaveBeenCalledWith(BEL);
    });

    it("ignores project settings when project is not trusted", () => {
      const pi = mockPi();
      inputBellExtension(pi);
      writeProjectSettings({ inputBell: false });
      handlerFor(pi, "agent_settled")({}, makeCtx({ isProjectTrusted: () => false }));
      expect(writeSpy).toHaveBeenCalledWith(BEL);
    });

    it("defaults to on when settings are absent or invalid", () => {
      const pi = mockPi();
      inputBellExtension(pi);
      const handler = handlerFor(pi, "agent_settled");

      // No settings files at all -> default on.
      handler({}, makeCtx());
      expect(writeSpy).toHaveBeenCalledWith(BEL);

      // Invalid JSON in both files -> default on.
      writeSpy.mockClear();
      writeGlobalSettings("not json {");
      writeProjectSettings("{{");
      handler({}, makeCtx());
      expect(writeSpy).toHaveBeenCalledWith(BEL);
    });
  });

  it("registers the input-bell status command", () => {
    const pi = mockPi();
    inputBellExtension(pi);
    expect(pi.registerCommand).toHaveBeenCalledWith(
      "input-bell",
      expect.objectContaining({ description: expect.any(String) }),
    );
  });
});
