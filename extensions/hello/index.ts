import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function helloExtension(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "hello",
    label: "Hello",
    description: "Greet a person by name. Use for testing that pi-devkit custom tools are loaded.",
    promptSnippet: "Greet a person by name for pi-devkit smoke tests.",
    parameters: Type.Object({
      name: Type.String({ description: "Name to greet" })
    }),
    async execute(_toolCallId, params: { name: string }) {
      return {
        content: [{ type: "text", text: `Hello, ${params.name}!` }],
        details: { greeted: params.name }
      };
    }
  });
}
