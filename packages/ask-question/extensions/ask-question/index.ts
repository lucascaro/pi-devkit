/**
 * Ask Question tool — Claude Code's AskUserQuestion for pi.
 *
 * Presents a numbered options list with an inline "Type something…" editor.
 * Escape in the editor returns to the options; Escape in the options cancels.
 *
 * Schema matches Claude Code's AskUserQuestion:
 *   question: string
 *   options: [{ label, description?, buttonText? }]
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  Editor,
  type EditorTheme,
  Key,
  matchesKey,
  Text,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { Type } from "typebox";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OptionWithDesc {
  label: string;
  description?: string;
  buttonText?: string;
}

type DisplayOption = OptionWithDesc & { isOther?: boolean };

interface AskQuestionResult {
  question: string;
  options: string[];
  answer: string | null;
  wasCustom: boolean;
  index?: number;
}

// ---------------------------------------------------------------------------
// Schema (matches Claude Code's AskUserQuestion)
// ---------------------------------------------------------------------------

const OptionSchema = Type.Object({
  label: Type.String({ description: "The label for the option" }),
  description: Type.Optional(
    Type.String({ description: "Optional description shown below the label" }),
  ),
  buttonText: Type.Optional(
    Type.String({
      description:
        "Text for the action button (e.g. 'Confirm', 'Approve'). Shown when this option is selected.",
    }),
  ),
});

const AskQuestionParams = Type.Object({
  question: Type.String({ description: "The question to ask the user" }),
  options: Type.Array(OptionSchema, {
    description: "Available options for the user to choose from",
  }),
});

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function askQuestionExtension(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ask_question",
    label: "Ask Question",
    description:
      "Ask the user a question with numbered options. Use when you need the user to confirm, choose between alternatives, or provide input to proceed. Press Esc to cancel.",
    promptSnippet:
      "Ask the user a question with numbered options. Use when you need user input or confirmation to proceed.",
    promptGuidelines: [
      "Use ask_question when you need the user to confirm a decision or choose between alternatives.",
      "Provide clear, distinct option labels. Add descriptions when the option meaning is not obvious.",
      "Include a 'Type something…' option (as the last option) when the user might want to write a custom answer.",
    ],
    parameters: AskQuestionParams,
    executionMode: "sequential",

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      // Non-interactive mode: return the question text as-is.
      if (ctx.mode !== "tui") {
        return {
          content: [
            {
              type: "text",
              text: "Error: UI not available (running in non-interactive mode)",
            },
          ],
          details: {
            question: params.question,
            options: params.options.map((o) => o.label),
            answer: null,
            wasCustom: false,
          } as AskQuestionResult,
        };
      }

      if (params.options.length === 0) {
        return {
          content: [{ type: "text", text: "Error: No options provided" }],
          details: {
            question: params.question,
            options: [],
            answer: null,
            wasCustom: false,
          } as AskQuestionResult,
        };
      }

      // Build the display list — always append "Type something…" as the last option.
      const allOptions: DisplayOption[] = [
        ...params.options,
        { label: "Type something.", isOther: true },
      ];

      const result = await ctx.ui.custom<
        { answer: string; wasCustom: boolean; index?: number } | null
      >((tui, theme, _kb, done) => {
        let optionIndex = 0;
        let editMode = false;
        let cachedLines: string[] | undefined;

        const editorTheme: EditorTheme = {
          borderColor: (s) => theme.fg("accent", s),
          selectList: {
            selectedPrefix: (t) => theme.fg("accent", t),
            selectedText: (t) => theme.fg("accent", t),
            description: (t) => theme.fg("muted", t),
            scrollInfo: (t) => theme.fg("dim", t),
            noMatch: (t) => theme.fg("warning", t),
          },
        };
        const editor = new Editor(tui, editorTheme);

        editor.onSubmit = (value) => {
          const trimmed = value.trim();
          if (trimmed) {
            done({ answer: trimmed, wasCustom: true });
          } else {
            editMode = false;
            editor.setText("");
            refresh();
          }
        };

        function refresh() {
          cachedLines = undefined;
          tui.requestRender();
        }

        function handleInput(data: string) {
          // ── Editor mode ──────────────────────────────────────────────
          if (editMode) {
            if (matchesKey(data, Key.escape)) {
              editMode = false;
              editor.setText("");
              refresh();
              return;
            }
            editor.handleInput(data);
            refresh();
            return;
          }

          // ── Option navigation ────────────────────────────────────────
          if (matchesKey(data, Key.up)) {
            optionIndex = Math.max(0, optionIndex - 1);
            refresh();
            return;
          }
          if (matchesKey(data, Key.down)) {
            optionIndex = Math.min(allOptions.length - 1, optionIndex + 1);
            refresh();
            return;
          }

          // ── Confirm / enter ──────────────────────────────────────────
          if (matchesKey(data, Key.enter)) {
            const selected = allOptions[optionIndex]!;
            if (selected.isOther) {
              editMode = true;
              refresh();
            } else {
              done({
                answer: selected.label,
                wasCustom: false,
                index: optionIndex + 1,
              });
            }
            return;
          }

          // ── Cancel ───────────────────────────────────────────────────
          if (matchesKey(data, Key.escape)) {
            done(null);
          }
        }

        // ── Render ───────────────────────────────────────────────────
        function render(width: number): string[] {
          if (cachedLines) return cachedLines;

          const lines: string[] = [];
          const renderWidth = Math.max(1, width);

          function addWrapped(text: string) {
            lines.push(...wrapTextWithAnsi(text, renderWidth));
          }

          function addWrappedWithPrefix(prefix: string, text: string) {
            const prefixWidth = visibleWidth(prefix);
            if (prefixWidth >= renderWidth) {
              addWrapped(prefix + text);
              return;
            }
            const wrapped = wrapTextWithAnsi(text, renderWidth - prefixWidth);
            const continuationPrefix = " ".repeat(prefixWidth);
            for (let i = 0; i < wrapped.length; i++) {
              lines.push(`${i === 0 ? prefix : continuationPrefix}${wrapped[i]}`);
            }
          }

          // Header
          lines.push(theme.fg("accent", "─".repeat(renderWidth)));
          addWrappedWithPrefix(" ", theme.fg("text", params.question));
          lines.push("");

          // Options
          for (let i = 0; i < allOptions.length; i++) {
            const opt = allOptions[i]!;
            const selected = i === optionIndex;
            const isOther = opt.isOther === true;
            const prefix = selected ? theme.fg("accent", "> ") : "  ";
            const label = `${i + 1}. ${opt.label}${isOther && editMode ? " ✎" : ""}`;
            const color = selected || (isOther && editMode) ? "accent" : "text";

            addWrappedWithPrefix(prefix, theme.fg(color, label));

            // Description
            if (opt.description) {
              addWrappedWithPrefix("     ", theme.fg("muted", opt.description));
            }

            // Button text (shown when selected)
            if (opt.buttonText && selected) {
              addWrappedWithPrefix("     ", theme.fg("success", `[${opt.buttonText}]`));
            }
          }

          // Editor area
          if (editMode) {
            lines.push("");
            addWrappedWithPrefix(" ", theme.fg("muted", "Your answer:"));
            for (const line of editor.render(Math.max(1, renderWidth - 2))) {
              lines.push(` ${line}`);
            }
          }

          // Footer
          lines.push("");
          if (editMode) {
            addWrappedWithPrefix(
              " ",
              theme.fg("dim", "Enter to submit • Esc to go back"),
            );
          } else {
            addWrappedWithPrefix(
              " ",
              theme.fg("dim", "↑↓ navigate • Enter to select • Esc to cancel"),
            );
          }
          lines.push(theme.fg("accent", "─".repeat(renderWidth)));

          cachedLines = lines;
          return lines;
        }

        return {
          render,
          invalidate: () => {
            cachedLines = undefined;
          },
          handleInput,
        };
      });

      // ── Build result ───────────────────────────────────────────────
      const simpleOptions = params.options.map((o) => o.label);

      if (!result) {
        return {
          content: [{ type: "text", text: "User cancelled the selection" }],
          details: {
            question: params.question,
            options: simpleOptions,
            answer: null,
            wasCustom: false,
          } as AskQuestionResult,
        };
      }

      if (result.wasCustom) {
        return {
          content: [{ type: "text", text: `User wrote: ${result.answer}` }],
          details: {
            question: params.question,
            options: simpleOptions,
            answer: result.answer,
            wasCustom: true,
          } as AskQuestionResult,
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `User selected: ${result.index}. ${result.answer}`,
          },
        ],
        details: {
          question: params.question,
          options: simpleOptions,
          answer: result.answer,
          wasCustom: false,
        } as AskQuestionResult,
      };
    },

    // ── Tool call rendering ──────────────────────────────────────────
    renderCall(args, theme, _context) {
      const typedArgs = args as { question: string; options: OptionWithDesc[] };
      let text =
        theme.fg("toolTitle", theme.bold("ask_question ")) +
        theme.fg("muted", typedArgs.question);
      const opts = Array.isArray(typedArgs.options) ? typedArgs.options : [];
      if (opts.length) {
        const labels = opts.map((o: OptionWithDesc) => o.label);
        const numbered = [...labels, "Type something."].map((o, i) => `${i + 1}. ${o}`);
        text += `\n${theme.fg("dim", `  Options: ${numbered.join(", ")}`)}`;
      }
      return new Text(text, 0, 0);
    },

    // ── Tool result rendering ────────────────────────────────────────
    renderResult(result, _options, theme, _context) {
      const details = result.details as AskQuestionResult | undefined;
      if (!details) {
        const text = result.content[0];
        return new Text(
          text?.type === "text" ? text.text : "",
          0,
          0,
        );
      }

      if (details.answer === null) {
        return new Text(theme.fg("warning", "Cancelled"), 0, 0);
      }

      if (details.wasCustom) {
        return new Text(
          theme.fg("success", "✓ ") +
            theme.fg("muted", "(wrote) ") +
            theme.fg("accent", details.answer),
          0,
          0,
        );
      }

      const idx = details.options.indexOf(details.answer) + 1;
      const display = idx > 0 ? `${idx}. ${details.answer}` : details.answer;
      return new Text(
        theme.fg("success", "✓ ") + theme.fg("accent", display),
        0,
        0,
      );
    },
  });
}
