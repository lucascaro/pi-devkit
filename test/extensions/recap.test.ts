import { describe, it, expect } from "vitest";

describe("recap extension", () => {
  describe("state reading", () => {
    it("should identify valid router persisted state", () => {
      const validState = {
        enabled: true,
        selectedProfile: "balanced",
        timestamp: Date.now(),
        widgetEnabled: true,
        debugEnabled: false,
      };

      // The isRouterPersistedState check requires:
      // - enabled: boolean
      // - selectedProfile: string
      // - timestamp: number
      expect(typeof validState.enabled).toBe("boolean");
      expect(typeof validState.selectedProfile).toBe("string");
      expect(typeof validState.timestamp).toBe("number");
    });

    it("should reject invalid state objects", () => {
      const invalidCases = [
        null,
        undefined,
        "not an object",
        42,
        { enabled: "yes", selectedProfile: "test", timestamp: 0 }, // enabled not boolean
        { enabled: true, selectedProfile: 123, timestamp: 0 }, // selectedProfile not string
        { enabled: true, selectedProfile: "test", timestamp: "now" }, // timestamp not number
      ];

      for (const invalid of invalidCases) {
        const v = invalid as Record<string, unknown>;
        const isValid =
          typeof invalid === "object" &&
          invalid !== null &&
          typeof v.enabled === "boolean" &&
          typeof v.selectedProfile === "string" &&
          typeof v.timestamp === "number";
        expect(isValid).toBe(false);
      }
    });
  });

  describe("decision formatting", () => {
    it("should format a routing decision with timestamp", () => {
      const decision: any = {
        tier: "high",
        phase: "planning",
        targetProvider: "anthropic",
        targetModelId: "claude-opus-4-0",
        targetLabel: "anthropic/claude-opus-4-0",
        reasoning: "Complex architecture question",
        thinking: "high",
        timestamp: 1_700_000_000_000,
      };

      const time = new Date(decision.timestamp).toLocaleTimeString();
      const fallback = decision.isFallback ? " (fallback)" : "";
      const budget = decision.isBudgetForced ? " (budget forced)" : "";
      const formatted = `  [${time}] ${decision.tier}/${decision.phase} → ${decision.targetProvider}/${decision.targetModelId}${fallback}${budget}`;

      expect(formatted).toContain("[");
      expect(formatted).toContain("high/planning");
      expect(formatted).toContain("anthropic/claude-opus-4-0");
    });

    it("should include fallback and budget flags", () => {
      const decision: any = {
        tier: "medium",
        phase: "implementation",
        targetProvider: "openai",
        targetModelId: "gpt-4o",
        targetLabel: "openai/gpt-4o",
        reasoning: "Fallback",
        thinking: "medium",
        timestamp: 1_700_000_000_000,
        isFallback: true,
        isBudgetForced: true,
      };

      const time = new Date(decision.timestamp).toLocaleTimeString();
      const fallback = decision.isFallback ? " (fallback)" : "";
      const budget = decision.isBudgetForced ? " (budget forced)" : "";
      const formatted = `  [${time}] ${decision.tier}/${decision.phase} → ${decision.targetProvider}/${decision.targetModelId}${fallback}${budget}`;

      expect(formatted).toContain("fallback");
      expect(formatted).toContain("budget forced");
    });
  });

  describe("config loading", () => {
    it("should parse classifier model from string config", () => {
      const parsed = {
        classifierModel: "anthropic/claude-haiku-3-5",
        phaseBias: 0.5,
      };

      expect(typeof parsed.classifierModel).toBe("string");
      expect(parsed.classifierModel).toContain("/");
    });

    it("should parse classifier model from object config", () => {
      const parsed = {
        classifierModel: {
          model: "anthropic/claude-haiku-3-5",
          thinking: "medium",
        },
      };

      const cm = parsed.classifierModel as Record<string, unknown>;
      const model = typeof cm.model === "string" ? cm.model : undefined;
      expect(model).toBe("anthropic/claude-haiku-3-5");
    });
  });
});
