import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { execSync } from "node:child_process";

function runValidate(): { stdout: string; exitCode: number } {
  try {
    const out = execSync("npx tsx scripts/validate-extensions.ts", {
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

describe("validate-extensions", () => {
  it("passes when all extensions have valid structure", () => {
    const result = runValidate();
    expect(result.exitCode).toBe(0);
  });
});
