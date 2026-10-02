/**
 * TUI rendering helpers + renderCall for the subagent tool.
 * renderResult lives in render-result.ts.
 */

import * as os from "node:os";
import { type ThemeColor } from "@earendil-works/pi-coding-agent";
import { Text, type Component } from "@earendil-works/pi-tui";
import type { Message } from "./types.ts";

const COLLAPSED_ITEM_COUNT = 10;

export function formatTokens(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  return `${(count / 1000000).toFixed(1)}M`;
}

export function formatUsageStats(
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number; cost: number; contextTokens?: number; turns?: number },
  model?: string,
): string {
  const parts: string[] = [];
  if (usage.turns) parts.push(`${usage.turns} turn${usage.turns > 1 ? "s" : ""}`);
  if (usage.input) parts.push(`↑${formatTokens(usage.input)}`);
  if (usage.output) parts.push(`↓${formatTokens(usage.output)}`);
  if (usage.cacheRead) parts.push(`R${formatTokens(usage.cacheRead)}`);
  if (usage.cacheWrite) parts.push(`W${formatTokens(usage.cacheWrite)}`);
  if (usage.cost) parts.push(`$${usage.cost.toFixed(4)}`);
  if (usage.contextTokens && usage.contextTokens > 0) parts.push(`ctx:${formatTokens(usage.contextTokens)}`);
  if (model) parts.push(model);
  return parts.join(" ");
}

function shortenPath(p: string): string {
  const home = os.homedir();
  return p.startsWith(home) ? `~${p.slice(home.length)}` : p;
}

export type ThemeFg = (color: ThemeColor, text: string) => string;

export interface ThemeLike {
  fg: ThemeFg;
  bold: (text: string) => string;
}

export function formatToolCall(toolName: string, args: Record<string, unknown>, fg: ThemeFg): string {
  switch (toolName) {
    case "bash": {
      const command = (args.command as string) || "...";
      const preview = command.length > 60 ? `${command.slice(0, 60)}...` : command;
      return fg("muted", "$ ") + fg("toolOutput", preview);
    }
    case "read": {
      const rawPath = (args.file_path || args.path || "...") as string;
      let text = fg("accent", shortenPath(rawPath));
      const offset = args.offset as number | undefined;
      const limit = args.limit as number | undefined;
      if (offset !== undefined || limit !== undefined) {
        const startLine = offset ?? 1;
        const endLine = limit !== undefined ? startLine + limit - 1 : "";
        text += fg("warning", `:${startLine}${endLine ? `-${endLine}` : ""}`);
      }
      return fg("muted", "read ") + text;
    }
    case "write":
    case "edit": {
      const rawPath = (args.file_path || args.path || "...") as string;
      return fg("muted", `${toolName} `) + fg("accent", shortenPath(rawPath));
    }
    case "ls": {
      const rawPath = (args.path || ".") as string;
      return fg("muted", "ls ") + fg("accent", shortenPath(rawPath));
    }
    case "find":
    case "grep": {
      const pattern = (args.pattern || "") as string;
      const rawPath = (args.path || ".") as string;
      return fg("muted", `${toolName} `) + fg("accent", `/${pattern}/`) + fg("dim", ` in ${shortenPath(rawPath)}`);
    }
    default: {
      const argsStr = JSON.stringify(args);
      const preview = argsStr.length > 50 ? `${argsStr.slice(0, 50)}...` : argsStr;
      return fg("accent", toolName) + fg("dim", ` ${preview}`);
    }
  }
}

export type DisplayItem =
  | { type: "text"; text: string }
  | { type: "toolCall"; name: string; args: Record<string, any> };

export function getDisplayItems(messages: Message[]): DisplayItem[] {
  const items: DisplayItem[] = [];
  for (const msg of messages) {
    if (msg.role !== "assistant") continue;
    for (const part of msg.content) {
      if (part.type === "text") items.push({ type: "text", text: part.text });
      else if (part.type === "toolCall") items.push({ type: "toolCall", name: part.name, args: part.arguments });
    }
  }
  return items;
}

export { COLLAPSED_ITEM_COUNT };

// ---------------------------------------------------------------------------
// renderCall
// ---------------------------------------------------------------------------

export function renderSubagentCall(
  args: {
    agent?: string;
    task?: string;
    tasks?: Array<{ agent: string; task: string }>;
    chain?: Array<{ agent: string; task: string }>;
  },
  theme: ThemeLike,
): Component {
  if (args.chain && args.chain.length > 0) {
    let text = theme.fg("toolTitle", theme.bold("subagent ")) + theme.fg("accent", `chain (${args.chain.length} steps)`);
    for (let i = 0; i < Math.min(args.chain.length, 3); i++) {
      const step = args.chain[i];
      if (!step) continue;
      const cleanTask = step.task.replace(/\{previous\}/g, "").trim();
      const preview = cleanTask.length > 40 ? `${cleanTask.slice(0, 40)}...` : cleanTask;
      text += `\n  ${theme.fg("muted", `${i + 1}.`)} ${theme.fg("accent", step.agent)}${theme.fg("dim", ` ${preview}`)}`;
    }
    if (args.chain.length > 3) text += `\n  ${theme.fg("muted", `... +${args.chain.length - 3} more`)}`;
    return new Text(text, 0, 0);
  }

  if (args.tasks && args.tasks.length > 0) {
    let text = theme.fg("toolTitle", theme.bold("subagent ")) + theme.fg("accent", `parallel (${args.tasks.length} tasks)`);
    for (const t of args.tasks.slice(0, 3)) {
      const preview = t.task.length > 40 ? `${t.task.slice(0, 40)}...` : t.task;
      text += `\n  ${theme.fg("accent", t.agent)}${theme.fg("dim", ` ${preview}`)}`;
    }
    if (args.tasks.length > 3) text += `\n  ${theme.fg("muted", `... +${args.tasks.length - 3} more`)}`;
    return new Text(text, 0, 0);
  }

  const agentName = args.agent || "...";
  const preview = args.task ? (args.task.length > 60 ? `${args.task.slice(0, 60)}...` : args.task) : "...";
  const text =
    theme.fg("toolTitle", theme.bold("subagent ")) +
    theme.fg("accent", agentName) +
    `\n  ${theme.fg("dim", preview)}`;
  return new Text(text, 0, 0);
}
