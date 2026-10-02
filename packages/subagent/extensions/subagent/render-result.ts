/**
 * renderResult for the subagent tool — collapsed and expanded views.
 */

import { getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import { Container, Markdown, Spacer, Text, type Component } from "@earendil-works/pi-tui";
import type { AgentResult } from "./types.ts";
import { getFinalOutput, isFailedResult } from "./types.ts";
import {
  COLLAPSED_ITEM_COUNT,
  formatToolCall,
  formatUsageStats,
  getDisplayItems,
  type ThemeLike,
} from "./render.ts";

export interface SubagentDetails {
  mode: "single" | "parallel" | "chain";
  results: AgentResult[];
}

export function renderSubagentResult(
  result: { content: Array<{ type: string; text?: string }>; details?: unknown },
  expanded: boolean,
  theme: ThemeLike,
): Component {
  const details = result.details as SubagentDetails | undefined;
  if (!details || details.results.length === 0) {
    const text = result.content[0];
    return new Text(text?.type === "text" ? (text.text ?? "(no output)") : "(no output)", 0, 0);
  }

  const mdTheme = getMarkdownTheme();

  const renderDisplayItems = (items: ReturnType<typeof getDisplayItems>, limit?: number): string => {
    const toShow = limit ? items.slice(-limit) : items;
    const skipped = limit && items.length > limit ? items.length - limit : 0;
    let text = "";
    if (skipped > 0) text += theme.fg("muted", `... ${skipped} earlier items\n`);
    for (const item of toShow) {
      if (item.type === "text") {
        const preview = expanded ? item.text : item.text.split("\n").slice(0, 3).join("\n");
        text += `${theme.fg("toolOutput", preview)}\n`;
      } else {
        text += `${theme.fg("muted", "→ ")}${formatToolCall(item.name, item.args, theme.fg)}\n`;
      }
    }
    return text.trimEnd();
  };

  // ----------------------------------------------------------------------
  // Single mode
  // ----------------------------------------------------------------------
  if (details.mode === "single" && details.results.length === 1) {
    const r = details.results[0];
    if (!r) {
      return new Text("(no output)", 0, 0);
    }
    const failed = isFailedResult(r);
    const icon = failed ? theme.fg("error", "✗") : theme.fg("success", "✓");
    const displayItems = getDisplayItems(r.messages);
    const finalOutput = getFinalOutput(r.messages);

    if (expanded) {
      const container = new Container();
      let header = `${icon} ${theme.fg("toolTitle", theme.bold(r.agent))}`;
      if (failed && r.stopReason) header += ` ${theme.fg("error", `[${r.stopReason}]`)}`;
      container.addChild(new Text(header, 0, 0));
      if (failed && r.errorMessage) container.addChild(new Text(theme.fg("error", `Error: ${r.errorMessage}`), 0, 0));
      container.addChild(new Spacer(1));
      container.addChild(new Text(theme.fg("muted", "─── Task ───"), 0, 0));
      container.addChild(new Text(theme.fg("dim", r.task), 0, 0));
      container.addChild(new Spacer(1));
      container.addChild(new Text(theme.fg("muted", "─── Output ───"), 0, 0));
      if (displayItems.length === 0 && !finalOutput) {
        container.addChild(new Text(theme.fg("muted", "(no output)"), 0, 0));
      } else {
        for (const item of displayItems) {
          if (item.type === "toolCall") {
            container.addChild(new Text(theme.fg("muted", "→ ") + formatToolCall(item.name, item.args, theme.fg), 0, 0));
          }
        }
        if (finalOutput) {
          container.addChild(new Spacer(1));
          container.addChild(new Markdown(finalOutput.trim(), 0, 0, mdTheme));
        }
      }
      const usageStr = formatUsageStats(r.usage, r.model);
      if (usageStr) {
        container.addChild(new Spacer(1));
        container.addChild(new Text(theme.fg("dim", usageStr), 0, 0));
      }
      return container;
    }

    let text = `${icon} ${theme.fg("toolTitle", theme.bold(r.agent))}`;
    if (failed && r.stopReason) text += ` ${theme.fg("error", `[${r.stopReason}]`)}`;
    if (failed && r.errorMessage) text += `\n${theme.fg("error", `Error: ${r.errorMessage}`)}`;
    else if (displayItems.length === 0) text += `\n${theme.fg("muted", "(no output)")}`;
    else {
      text += `\n${renderDisplayItems(displayItems, COLLAPSED_ITEM_COUNT)}`;
      if (displayItems.length > COLLAPSED_ITEM_COUNT) text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
    }
    const usageStr = formatUsageStats(r.usage, r.model);
    if (usageStr) text += `\n${theme.fg("dim", usageStr)}`;
    return new Text(text, 0, 0);
  }

  // ----------------------------------------------------------------------
  // Chain / parallel (aggregate)
  // ----------------------------------------------------------------------
  const aggregate = details.results.reduce(
    (acc, r) => {
      acc.input += r.usage.input;
      acc.output += r.usage.output;
      acc.cacheRead += r.usage.cacheRead;
      acc.cacheWrite += r.usage.cacheWrite;
      acc.cost += r.usage.cost;
      acc.turns += r.usage.turns;
      return acc;
    },
    { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 },
  );

  const running = details.results.filter((r) => r.exitCode === -1).length;
  const successCount = details.results.filter((r) => r.exitCode !== -1 && !isFailedResult(r)).length;
  const failCount = details.results.filter((r) => r.exitCode !== -1 && isFailedResult(r)).length;
  const isRunning = running > 0;
  const label = details.mode === "chain" ? "chain" : "parallel";
  const status = isRunning
    ? `${successCount + failCount}/${details.results.length} done, ${running} running`
    : details.mode === "chain"
      ? `${successCount}/${details.results.length} steps`
      : `${successCount}/${details.results.length} tasks`;
  const icon = isRunning
    ? theme.fg("warning", "⏳")
    : failCount > 0
      ? theme.fg("warning", "◐")
      : theme.fg("success", "✓");

  if (expanded && !isRunning) {
    const container = new Container();
    container.addChild(new Text(`${icon} ${theme.fg("toolTitle", theme.bold(`${label} `))}${theme.fg("accent", status)}`, 0, 0));

    for (const r of details.results) {
      const rIcon = isFailedResult(r) ? theme.fg("error", "✗") : theme.fg("success", "✓");
      const displayItems = getDisplayItems(r.messages);
      const finalOutput = getFinalOutput(r.messages);
      const stepLabel = r.step ? `Step ${r.step}: ` : "";

      container.addChild(new Spacer(1));
      container.addChild(new Text(`${theme.fg("muted", `─── ${stepLabel}`)}${theme.fg("accent", r.agent)} ${rIcon}`, 0, 0));
      container.addChild(new Text(theme.fg("muted", "Task: ") + theme.fg("dim", r.task), 0, 0));
      for (const item of displayItems) {
        if (item.type === "toolCall") {
          container.addChild(new Text(theme.fg("muted", "→ ") + formatToolCall(item.name, item.args, theme.fg), 0, 0));
        }
      }
      if (finalOutput) {
        container.addChild(new Spacer(1));
        container.addChild(new Markdown(finalOutput.trim(), 0, 0, mdTheme));
      }
      const stepUsage = formatUsageStats(r.usage, r.model);
      if (stepUsage) container.addChild(new Text(theme.fg("dim", stepUsage), 0, 0));
    }

    const usageStr = formatUsageStats(aggregate);
    if (usageStr) {
      container.addChild(new Spacer(1));
      container.addChild(new Text(theme.fg("dim", `Total: ${usageStr}`), 0, 0));
    }
    return container;
  }

  // Collapsed (or still running)
  let text = `${icon} ${theme.fg("toolTitle", theme.bold(`${label} `))}${theme.fg("accent", status)}`;
  for (const r of details.results) {
    const rIcon =
      r.exitCode === -1
        ? theme.fg("warning", "⏳")
        : isFailedResult(r)
          ? theme.fg("error", "✗")
          : theme.fg("success", "✓");
    const displayItems = getDisplayItems(r.messages);
    const stepLabel = r.step ? `Step ${r.step}: ` : "";
    text += `\n\n${theme.fg("muted", `─── ${stepLabel}`)}${theme.fg("accent", r.agent)} ${rIcon}`;
    if (displayItems.length === 0) {
      text += `\n${theme.fg("muted", r.exitCode === -1 ? "(running...)" : "(no output)")}`;
    } else {
      text += `\n${renderDisplayItems(displayItems, 5)}`;
    }
  }
  if (!isRunning) {
    const usageStr = formatUsageStats(aggregate);
    if (usageStr) text += `\n\n${theme.fg("dim", `Total: ${usageStr}`)}`;
  }
  if (!expanded) text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
  return new Text(text, 0, 0);
}
