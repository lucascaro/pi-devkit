import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";

function runValidate(): { stdout: string; exitCode: number } {
  try {
    const out = execSync("npx tsx scripts/validate-pi-manifest.ts", {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"]
    });
    return { stdout: out, exitCode: 0 };
  } catch (e: unknown) {
    const err = e as { stdout?: Buffer; stderr?: Buffer; code?: number };
    return {
      stdout: err.stdout?.toString() ?? "",
      exitCode: err.code ?? 1
    };
  }
}

describe("validate-pi-manifest", () => {
  it("passes when all pi paths exist and are non-empty", () => {
    const result = runValidate();
    expect(result.exitCode).toBe(0);
  });
});
