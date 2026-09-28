/**
 * Subagent extension — delegate tasks to specialized subagents with isolated
 * context windows.
 *
 * Hybrid backends:
 *   - "sdk"        — in-process AgentSession (fast, shared ModelRuntime)
 *   - "subprocess" — separate `pi` process (full isolation)
 *
 * Agents are discovered from ~/.pi/agent/agents and .pi/agents (YAML + TS).
 * Project-local agents require a trusted project.
 *
 * Modes: single (agent + task), parallel (tasks[]), chain (chain[] with {previous}).
 */

import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { discoverAgents, formatAgentList } from "./agents.ts";
import { Coordinator } from "./coordinator.ts";
import { renderSubagentCall } from "./render.ts";
import { renderSubagentResult, type SubagentDetails } from "./render-result.ts";
import { truncateOutput } from "./output.ts";
import type {
  AgentDefinition,
  AgentResult,
  AgentScope,
  DynamicAgentDefinition,
  SubagentToolParams,
} from "./types.ts";
import { SubagentParamsSchema, emptyUsage, getFinalOutput, isFailedResult } from "./types.ts";

type AnyAgent = AgentDefinition | DynamicAgentDefinition;

const coordinator = new Coordinator({ defaultBackend: "sdk" });

/** The extension's bundled default agents directory (ships with the package). */
const BUNDLED_AGENTS_DIR = fileURLToPath(new URL("./agents", import.meta.url));

export default function subagentExtension(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "subagent",
    label: "Subagent",
    description: [
      "Delegate tasks to specialized subagents with isolated context windows.",
      "Modes: single (agent + task), parallel (tasks array), chain (sequential with {previous} placeholder).",
      'Backends: "sdk" (in-process, default) or "subprocess" (isolated process).',
      'Agent scope defaults to "user" (~/.pi/agent/agents). Use agentScope "both" to include project-local agents (.pi/agents) in trusted projects.',
    ].join(" "),
    promptSnippet:
      "Delegate tasks to specialized subagents (scout, planner, reviewer, worker) with isolated context. Supports single, parallel, and chained execution.",
    parameters: SubagentParamsSchema,

    async execute(_toolCallId, params: SubagentToolParams, signal, onUpdate, ctx) {
      // --- Resolve agent scope with trust gate -----------------------------
      const requestedScope: AgentScope = params.agentScope ?? "user";
      const projectTrusted = ctx.isProjectTrusted();
      const wantsProjectAgents = requestedScope === "project" || requestedScope === "both";
      const effectiveScope: AgentScope = wantsProjectAgents && !projectTrusted ? "user" : requestedScope;

      const discovery = await discoverAgents(ctx.cwd, effectiveScope, [BUNDLED_AGENTS_DIR]);
      const agents = new Map<string, AnyAgent>(discovery.agents.map((a) => [a.name, a]));

      // --- Determine mode --------------------------------------------------
      const hasChain = (params.chain?.length ?? 0) > 0;
      const hasTasks = (params.tasks?.length ?? 0) > 0;
      const hasSingle = Boolean(params.agent && params.task);
      const modeCount = Number(hasChain) + Number(hasTasks) + Number(hasSingle);

      const makeDetails = (mode: "single" | "parallel" | "chain") => (results: AgentResult[]): SubagentDetails => ({
        mode,
        results,
      });

      if (modeCount !== 1) {
        const available = formatAgentList(discovery.agents, 10).text;
        return {
          content: [
            {
              type: "text",
              text: `Invalid parameters: provide exactly one of (agent+task), tasks[], or chain[]. Available agents: ${available}`,
            },
          ],
          details: makeDetails("single")([]),
        };
      }

      // Helpful error if a project agent was requested but the project isn't trusted.
      if (wantsProjectAgents && !projectTrusted) {
        const available = formatAgentList(discovery.agents, 10).text;
        return {
          content: [
            {
              type: "text",
              text: `Project-local agents are not available because the project is not trusted. Trust the project (e.g. /trust) to use agents from .pi/agents. Available user agents: ${available}`,
            },
          ],
          details: makeDetails("single")([]),
        };
      }

      // --- Live results for streaming --------------------------------------
      const mode = hasChain ? "chain" : hasTasks ? "parallel" : "single";
      const taskList: Array<{ agent: string; task: string }> = hasChain
        ? (params.chain ?? []).map((s) => ({ agent: s.agent, task: s.task }))
        : hasTasks
          ? (params.tasks ?? []).map((t) => ({ agent: t.agent, task: t.task }))
          : [{ agent: params.agent ?? "", task: params.task ?? "" }];

      const liveResults: AgentResult[] = taskList.map((t, i) => ({
        agent: t.agent,
        task: t.task,
        exitCode: -1,
        messages: [],
        usage: emptyUsage(),
        backend: "sdk",
        step: mode === "chain" ? i + 1 : undefined,
      }));

      const emitUpdate = () => {
        if (!onUpdate) return;
        const last = liveResults[liveResults.length - 1];
        const text =
          mode === "single"
            ? getFinalOutput(last?.messages ?? []) || "(running...)"
            : `Running: ${liveResults.filter((r) => r.exitCode !== -1).length}/${liveResults.length} done`;
        onUpdate({
          content: [{ type: "text", text }],
          details: makeDetails(mode)([...liveResults]),
        });
      };

      // --- Dispatch --------------------------------------------------------
      const results = await coordinator.dispatch({
        mode,
        agent: params.agent,
        task: params.task,
        tasks: params.tasks,
        chain: params.chain,
        agents,
        cwd: ctx.cwd,
        signal,
        projectTrusted,
        parentModel: ctx.model,
        parentThinkingLevel: ctx.thinkingLevel,
        maxTasks: params.maxTasks,
        concurrency: params.concurrency,
        onUpdate: (partial, index) => {
          if (index < liveResults.length) {
            liveResults[index] = { ...partial, step: mode === "chain" ? index + 1 : undefined };
          }
          emitUpdate();
        },
      });

      // --- Build model-visible content ------------------------------------
      const maxOutput = params.maxOutputPerTask ?? 50 * 1024;

      if (mode === "single") {
        const r = results[0];
        if (!r) {
          return { content: [{ type: "text", text: "(no output)" }], details: makeDetails("single")(results) };
        }
        if (isFailedResult(r)) {
          return {
            content: [{ type: "text", text: `Agent ${r.stopReason ?? "failed"}: ${r.errorMessage || getFinalOutput(r.messages) || "(no output)"}` }],
            details: makeDetails("single")(results),
            isError: true,
          };
        }
        return {
          content: [{ type: "text", text: getFinalOutput(r.messages) || "(no output)" }],
          details: makeDetails("single")(results),
        };
      }

      if (mode === "chain") {
        const failedIndex = results.findIndex(isFailedResult);
        if (failedIndex !== -1) {
          const r = results[failedIndex];
          return {
            content: [
              {
                type: "text",
                text: `Chain stopped at step ${failedIndex + 1} (${r?.agent ?? "unknown"}): ${r?.errorMessage || getFinalOutput(r?.messages ?? []) || "(no output)"}`,
              },
            ],
            details: makeDetails("chain")(results),
            isError: true,
          };
        }
        const last = results[results.length - 1];
        return {
          content: [{ type: "text", text: getFinalOutput(last?.messages ?? []) || "(no output)" }],
          details: makeDetails("chain")(results),
        };
      }

      // parallel
      const successCount = results.filter((r) => !isFailedResult(r)).length;
      const summaries = results.map((r) => {
        const output = truncateOutput(getResultOutput(r), maxOutput);
        const status = isFailedResult(r)
          ? `failed${r.stopReason && r.stopReason !== "end" ? ` (${r.stopReason})` : ""}`
          : "completed";
        return `### [${r.agent}] ${status}\n\n${output}`;
      });
      return {
        content: [
          {
            type: "text",
            text: `Parallel: ${successCount}/${results.length} succeeded\n\n${summaries.join("\n\n---\n\n")}`,
          },
        ],
        details: makeDetails("parallel")(results),
      };
    },

    renderCall: (args, theme) => renderSubagentCall(args, theme),
    renderResult: (result, { expanded }, theme) =>
      renderSubagentResult(result as { content: Array<{ type: string; text?: string }>; details?: unknown }, expanded, theme),
  });

  pi.registerCommand("subagent-list", {
    description: "List available subagents",
    handler: async (_args, ctx) => {
      const scope: AgentScope = ctx.isProjectTrusted() ? "both" : "user";
      const discovery = await discoverAgents(ctx.cwd, scope, [BUNDLED_AGENTS_DIR]);
      const { text, remaining } = formatAgentList(discovery.agents, 50);
      const line = remaining > 0 ? `${text} (+${remaining} more)` : text;
      ctx.ui.notify(`Subagents: ${line}`, "info");
    },
  });
}

function getResultOutput(result: AgentResult): string {
  if (isFailedResult(result)) {
    return result.errorMessage || getFinalOutput(result.messages) || "(no output)";
  }
  return getFinalOutput(result.messages) || "(no output)";
}
