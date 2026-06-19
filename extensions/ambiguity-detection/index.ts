import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const AMBIGUITY_GUIDELINES = `
## Ambiguity Guidelines

When the user's request is ambiguous, underspecified, or open to multiple interpretations:

1. **Ask clarifying questions before proceeding.** Never guess at critical details.
2. **State your understanding** of what the user wants, and ask them to confirm or correct.
3. **If multiple valid approaches exist**, ask which one they prefer before picking one.
4. **It's better to ask one question than to produce wrong results.**

Common ambiguity patterns to watch for:
- Vague verbs without targets: "fix it", "improve the code", "make it better"
- Missing scope: "add auth", "add tests", "refactor the login" (what file? what kind?)
- Overly broad requests: "build me an app", "make a website" (what kind? what features?)
- Conflicting requirements in a single prompt
- Missing decision points between multiple valid approaches

When in doubt, ask.
`;

export default function ambiguityDetection(pi: ExtensionAPI): void {
  pi.on("before_agent_start", async (event) => {
    return {
      systemPrompt: `${event.systemPrompt}${AMBIGUITY_GUIDELINES}`,
    };
  });
}
