import { describe, expect, it } from "vitest";
import { truncateOutput } from "../../../packages/subagent/extensions/subagent/output.ts";
import { SubagentParamsSchema } from "../../../packages/subagent/extensions/subagent/types.ts";

describe("truncateOutput", () => {
  it("clamps a negative byte limit safely", () => {
    expect(truncateOutput("hello", -1)).toBe("");
  });

  it("keeps the complete result, including its marker, within the byte limit", () => {
    const truncated = truncateOutput("x".repeat(500), 100);
    expect(Buffer.byteLength(truncated, "utf8")).toBeLessThanOrEqual(100);
    expect(truncated).toContain("bytes omitted.");
  });

  it("does not split multibyte UTF-8 characters or exceed the byte limit", () => {
    const truncated = truncateOutput("💻x".repeat(80), 100);
    const content = truncated.split("\n\n[Output truncated:")[0] ?? "";
    expect(Buffer.byteLength(truncated, "utf8")).toBeLessThanOrEqual(100);
    expect(content).not.toContain("�");
  });

  it("returns output that fits within the byte limit unchanged", () => {
    expect(truncateOutput("hello", 5)).toBe("hello");
  });
});

describe("SubagentParamsSchema output limit", () => {
  it("rejects negative and fractional output limits at the tool boundary", () => {
    const schema = SubagentParamsSchema.properties.maxOutputPerTask as {
      minimum?: number;
      multipleOf?: number;
    };
    expect(schema.minimum).toBe(0);
    expect(schema.multipleOf).toBe(1);
  });
});
