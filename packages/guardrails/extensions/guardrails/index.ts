import { isToolCallEventType, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { dangerousCommandReason, isDangerousCommand } from "../../src/lib/dangerous-command.ts";

export default function guardrailsExtension(pi: ExtensionAPI): void {
  pi.on("tool_call", async (event, ctx) => {
    if (!isToolCallEventType("bash", event)) return;

    const command = event.input.command;
    if (typeof command !== "string" || !isDangerousCommand(command)) return;

    const reason = dangerousCommandReason(command);
    if (!ctx.hasUI) {
      return { block: true, reason };
    }

    const allowed = await ctx.ui.confirm("Dangerous command", `${reason}\n\n${command}`);
    if (!allowed) return { block: true, reason: "Blocked by pi-devkit guardrails." };
  });

  pi.registerCommand("guardrails", {
    description: "Show pi-devkit guardrail status",
    handler: async (_args, ctx) => {
      ctx.ui.notify("pi-devkit guardrails are active for dangerous bash commands.", "info");
    }
  });
}
