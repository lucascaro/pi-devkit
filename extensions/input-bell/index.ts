import {
  CONFIG_DIR_NAME,
  getAgentDir,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const BEL = "\x07";

/**
 * Read the `inputBell` setting (default: on).
 *
 * Global `~/.pi/agent/settings.json` is read first, then project
 * `.pi/settings.json` — consulted only for trusted projects, mirroring pi's
 * own settings trust model. Project overrides global. Missing files, invalid
 * JSON, or non-boolean values leave the current value untouched.
 */
function isInputBellEnabled(cwd: string, projectTrusted: boolean): boolean {
  let enabled = true;
  const sources: Array<{ path: string; allowed: boolean }> = [
    { path: join(getAgentDir(), "settings.json"), allowed: true },
    { path: join(cwd, CONFIG_DIR_NAME, "settings.json"), allowed: projectTrusted },
  ];
  for (const { path, allowed } of sources) {
    if (!allowed) continue;
    try {
      const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
      if (parsed !== null && typeof parsed === "object" && "inputBell" in parsed) {
        const value = (parsed as Record<string, unknown>).inputBell;
        if (typeof value === "boolean") enabled = value;
      }
    } catch {
      // Missing or invalid file — keep the current value.
    }
  }
  return enabled;
}

/**
 * Ring the terminal bell. TUI mode only: in print/JSON/RPC modes stdout is a
 * data channel and a BEL byte would corrupt the output. The write is guarded
 * so a broken pipe can never crash the session.
 */
function ringBell(ctx: ExtensionContext): void {
  if (ctx.mode !== "tui") return;
  if (!isInputBellEnabled(ctx.cwd, ctx.isProjectTrusted())) return;
  try {
    process.stdout.write(BEL);
  } catch {
    // Bell delivery is best-effort.
  }
}

export default function inputBellExtension(pi: ExtensionAPI): void {
  // A run has fully settled and pi will not continue automatically:
  // it is waiting for the operator's next message. Skipped when another
  // extension already started a new run.
  pi.on("agent_settled", (_event, ctx) => {
    if (!ctx.isIdle()) return;
    ringBell(ctx);
  });

  // Pi is blocked on a user-facing dialog (select/confirm/input/editor/custom).
  // Nested prompts coalesce into one span pi-side, so no double-bell.
  pi.on("ui_prompt_start", (_event, ctx) => {
    ringBell(ctx);
  });

  pi.registerCommand("input-bell", {
    description: "Show input-bell status",
    handler: async (_args, ctx) => {
      const enabled = isInputBellEnabled(ctx.cwd, ctx.isProjectTrusted());
      ctx.ui.notify(`input-bell: ${enabled ? "on" : "off"} (inputBell setting)`, "info");
    },
  });
}
