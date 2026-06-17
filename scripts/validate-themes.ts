import { existsSync, readFileSync } from "node:fs";
import { fail, walkFiles } from "./validation-lib.ts";

const REQUIRED_TOKENS = [
  "accent", "border", "borderAccent", "borderMuted", "success", "error", "warning", "muted", "dim", "text", "thinkingText",
  "selectedBg", "userMessageBg", "userMessageText", "customMessageBg", "customMessageText", "customMessageLabel", "toolPendingBg", "toolSuccessBg", "toolErrorBg", "toolTitle", "toolOutput",
  "mdHeading", "mdLink", "mdLinkUrl", "mdCode", "mdCodeBlock", "mdCodeBlockBorder", "mdQuote", "mdQuoteBorder", "mdHr", "mdListBullet",
  "toolDiffAdded", "toolDiffRemoved", "toolDiffContext",
  "syntaxComment", "syntaxKeyword", "syntaxFunction", "syntaxVariable", "syntaxString", "syntaxNumber", "syntaxType", "syntaxOperator", "syntaxPunctuation",
  "thinkingOff", "thinkingMinimal", "thinkingLow", "thinkingMedium", "thinkingHigh", "thinkingXhigh", "bashMode"
];

const root = "themes";
if (!existsSync(root)) fail("themes/ directory is missing");

const themeFiles = walkFiles(root, (path) => path.endsWith(".json"));
if (themeFiles.length === 0) fail("No themes found");

function validColor(value: unknown, vars: Record<string, unknown>): boolean {
  if (value === "") return true;
  if (typeof value === "number") return Number.isInteger(value) && value >= 0 && value <= 255;
  if (typeof value !== "string") return false;
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return true;
  return Object.prototype.hasOwnProperty.call(vars, value);
}

for (const file of themeFiles) {
  const theme = JSON.parse(readFileSync(file, "utf8")) as {
    name?: unknown;
    vars?: Record<string, unknown>;
    colors?: Record<string, unknown>;
  };
  if (typeof theme.name !== "string" || theme.name.length === 0) fail(`${file}: missing name`);
  if (!theme.colors) fail(`${file}: missing colors`);
  const vars = theme.vars ?? {};
  for (const token of REQUIRED_TOKENS) {
    if (!(token in theme.colors)) fail(`${file}: missing color token ${token}`);
    if (!validColor(theme.colors[token], vars)) fail(`${file}: invalid color for ${token}`);
  }
}

console.log(`Validated ${themeFiles.length} theme(s)`);
