import { describe, expect, it } from "vitest";
import { truncateOutput } from "../../../packages/subagent/extensions/subagent/output.ts";
import { SubagentParamsSchema } from "../../../packages/subagent/extensions/subagent/types.ts";

describe("truncateOutput", () => {
  it("safely clamps a negative byte limit", () => {
    expect(truncateOutput("hello", -1)).toBe(
      "\n\n[Output truncated: 5 bytes omitted. Full output preserved in tool details.]",
    );
  });

  it("does not split a multibyte UTF-8 character", () => {
    const truncated = truncateOutput("💻x", 3);
    expect(truncated).not.toContain("�");
    expect(truncated).toContain("5 bytes omitted.");
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
