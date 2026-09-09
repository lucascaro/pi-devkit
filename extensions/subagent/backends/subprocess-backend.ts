/**
 * Subprocess backend — executes subagents by spawning a separate `pi` process.
 *
 * Provides full process isolation. Each subagent runs in its own `pi` process
 * with an isolated context window, its own model/auth resolution, and its own
 * tool sandbox. Output is captured via `--mode json` (JSONL events on stdout).
 *
 * Spawns:
 *   pi --mode json -p --no-session [--model X] [--tools Y] [--append-system-prompt Z] "task"
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type {
  AgentDefinition,
  AgentResult,
  Backend,
  DynamicAgentDefinition,
  ExecuteOptions,
  Message,
  UsageStats,
} from "../types.ts";
import { emptyUsage, resolveSystemPrompt } from "../types.ts";

// ---------------------------------------------------------------------------
// Process invocation
// ---------------------------------------------------------------------------

/**
 * Determine how to invoke `pi`. Prefers the current executable (so the subagent
 * uses the same pi installation/version), falling back to `pi` on PATH.
 */
function getPiInvocation(args: string[]): { command: string; args: string[] } {
  const currentScript = process.argv[1];
  const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");

  if (currentScript && !isBunVirtualScript && fs.existsSync(currentScript)) {
    return { command: process.execPath, args: [currentScript, ...args] };
  }

  const execName = path.basename(process.execPath).toLowerCase();
  const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
  if (!isGenericRuntime) {
    return { command: process.execPath, args };
  }

  return { command: "pi", args };
}

// ---------------------------------------------------------------------------
// Temp file for system prompt
// ---------------------------------------------------------------------------

async function writeTempPrompt(content: string): Promise<{ dir: string; filePath: string }> {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pi-subagent-"));
  const filePath = path.join(dir, `prompt-${Date.now()}-${Math.random().toString(36).slice(2)}.md`);
  await fs.promises.writeFile(filePath, content, { encoding: "utf-8", mode: 0o600 });
  return { dir, filePath };
}

async function cleanupTemp(dir: string, filePath: string): Promise<void> {
  try {
    await fs.promises.unlink(filePath);
  } catch {
    /* ignore */
  }
  try {
    await fs.promises.rmdir(dir);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// JSONL event parsing
// ---------------------------------------------------------------------------

interface JsonlEvent {
  type: string;
  message?: Message;
  [key: string]: unknown;
}

function parseJsonlLine(line: string): JsonlEvent | null {
  if (!line.trim()) return null;
  try {
    return JSON.parse(line) as JsonlEvent;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Usage accumulation
// ---------------------------------------------------------------------------

function accumulateUsage(messages: Message[], usage: UsageStats): void {
  for (const msg of messages) {
    if (msg.role !== "assistant") continue;
    usage.turns++;
    const u = msg.usage;
    if (u) {
      usage.input += u.input || 0;
      usage.output += u.output || 0;
      usage.cacheRead += u.cacheRead || 0;
      usage.cacheWrite += u.cacheWrite || 0;
      usage.cost += u.cost?.total || 0;
      if (u.totalTokens) usage.contextTokens = u.totalTokens;
    }
  }
}

function modelToString(model: unknown): string | undefined {
  if (!model) return undefined;
  if (typeof model === "string") return model;
  const m = model as { provider?: string; id?: string };
  if (m.provider && m.id) return `${m.provider}/${m.id}`;
  return undefined;
}

// ---------------------------------------------------------------------------
// Subprocess backend
// ---------------------------------------------------------------------------

export class SubprocessBackend implements Backend {
  async execute(
    def: AgentDefinition | DynamicAgentDefinition,
    task: string,
    options: ExecuteOptions,
  ): Promise<AgentResult> {
    const args: string[] = ["--mode", "json", "-p", "--no-session"];

    // Resolve model: agent override, else inherit from parent.
    const model = def.model ?? (options.parentModel ? `${options.parentModel.provider}/${options.parentModel.id}` : undefined);
    if (model) args.push("--model", model);

    // Thinking level: agent override, else inherit.
    const thinkingLevel = def.thinkingLevel ?? options.parentThinkingLevel;
    if (thinkingLevel) args.push("--thinking", thinkingLevel);

    // Tool allowlist.
    if (def.tools && def.tools.length > 0) args.push("--tools", def.tools.join(","));

    // System prompt via temp file (appended to the default prompt).
    const systemPrompt = await resolveSystemPrompt(def, { cwd: options.cwd });
    let tmpDir: string | null = null;
    let tmpPath: string | null = null;
    if (systemPrompt.trim()) {
      const tmp = await writeTempPrompt(systemPrompt);
      tmpDir = tmp.dir;
      tmpPath = tmp.filePath;
      args.push("--append-system-prompt", tmpPath);
    }

    args.push(task);

    try {
      return await this.runProcess(def, task, args, options);
    } finally {
      if (tmpDir && tmpPath) {
        await cleanupTemp(tmpDir, tmpPath).catch(() => undefined);
      }
    }
  }

  private runProcess(
    def: AgentDefinition | DynamicAgentDefinition,
    task: string,
    args: string[],
    options: ExecuteOptions,
  ): Promise<AgentResult> {
    const messages: Message[] = [];
    let stderr = "";
    let stopReason: string | undefined;
    let errorMessage: string | undefined;
    let modelInfo: string | undefined;

    const emitUpdate = () => {
      if (!options.onUpdate) return;
      const usage = emptyUsage();
      accumulateUsage(messages, usage);
      options.onUpdate({
        agent: def.name,
        task,
        exitCode: -1, // still running
        messages: [...messages],
        usage,
        model: modelInfo,
        backend: "subprocess",
      });
    };

    return new Promise<AgentResult>((resolve) => {
      const invocation = getPiInvocation(args);
      const proc = spawn(invocation.command, invocation.args, {
        cwd: options.cwd,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let buffer = "";
      let wasAborted = false;

      const processLine = (line: string) => {
        const event = parseJsonlLine(line);
        if (!event) return;

        if (event.type === "message_end" && event.message) {
          messages.push(event.message);
          const msg = event.message;
          if (msg.role === "assistant") {
            stopReason = msg.stopReason;
            errorMessage = msg.errorMessage;
            const resolved = modelToString((msg as { model?: unknown }).model);
            if (resolved) modelInfo = resolved;
          }
          emitUpdate();
        }

        if (event.type === "tool_result_end" && event.message) {
          messages.push(event.message);
          emitUpdate();
        }
      };

      proc.stdout.on("data", (data: Buffer) => {
        buffer += data.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) processLine(line);
      });

      proc.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        if (buffer.trim()) processLine(buffer);
        const exitCode = code ?? 0;
        const usage = emptyUsage();
        accumulateUsage(messages, usage);

        // Determine error message.
        let finalError = errorMessage;
        if (!finalError && stderr.trim() && exitCode !== 0) {
          finalError = stderr.trim().split("\n").slice(-5).join("\n");
        }

        resolve({
          agent: def.name,
          task,
          exitCode,
          messages,
          usage,
          model: modelInfo,
          stopReason: wasAborted ? "aborted" : stopReason,
          errorMessage: finalError,
          backend: "subprocess",
        });
      });

      proc.on("error", (err) => {
        const usage = emptyUsage();
        accumulateUsage(messages, usage);
        resolve({
          agent: def.name,
          task,
          exitCode: 1,
          messages,
          usage,
          model: modelInfo,
          stopReason: "error",
          errorMessage: err.message,
          backend: "subprocess",
        });
      });

      // Handle abort.
      if (options.signal) {
        const killProc = () => {
          wasAborted = true;
          proc.kill("SIGTERM");
          setTimeout(() => {
            if (!proc.killed) proc.kill("SIGKILL");
          }, 5000);
        };
        if (options.signal.aborted) killProc();
        else options.signal.addEventListener("abort", killProc, { once: true });
      }
    });
  }
}
