import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isDangerousCommand } from "../../../packages/guardrails/src/lib/dangerous-command.ts";
import { createSdkSubagentResourceLoader } from "../../../packages/subagent/extensions/subagent/backends/sdk-backend.ts";
import { isSubagentDangerousCommand } from "../../../packages/subagent/extensions/subagent/sdk-guardrails.ts";

const dangerousCommands = [
  "rm -rf /tmp/example",
  "sudo make install",
  "git reset --hard HEAD~1",
  "git push origin main --force-with-lease",
  'git push origin "$(git branch --show-current)" --force',
  'git push origin "$(git branch --show-current || echo main)" --force',
  'git push origin "`git branch --show-current || echo main`" --force',
  "rm $(echo -rf) /tmp/example",
  "`rm -rf /tmp/example`",
  "\\rm -rf /tmp/example",
  "rm -- old.txt\nrm -rf important",
  "rm -r -f /tmp/example",
  "rm --recursive /tmp/example",
  "true;rm -rf /tmp/example",
  "true;git push -f origin main",
  "/usr/bin/sudo whoami",
  "chmod -R 777 .",
  "chown -R root /tmp",
  "dd if=/dev/zero of=/dev/sda",
  "mkfs.ext4 /dev/sda",
  "docker system prune --all",
  "kubectl delete namespace prod",
  "psql -c 'DROP TABLE users'",
  "psql -c 'TRUNCATE TABLE users'",
];

const safeCommands = [
  "rm file.txt",
  "rm -f file.txt",
  "git status",
  "npm test",
  "kubectl get pods",
  "psql -c 'select * from users limit 1'",
];

describe("SDK subagent guardrails", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  });

  it("keeps standalone command classification aligned with pi-devkit guardrails", () => {
    for (const command of [...dangerousCommands, ...safeCommands]) {
      expect(isSubagentDangerousCommand(command), command).toBe(isDangerousCommand(command));
    }
  });

  it("loads only the inline guardrail with recursive extension loading disabled", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "pi-subagent-guardrails-"));
    const cwd = join(tempDir, "project");
    const agentDir = join(tempDir, "agent");
    const loader = createSdkSubagentResourceLoader(cwd, agentDir, "Agent-specific instructions");

    await loader.reload();
    expect(loader.getAppendSystemPrompt()).toContain("Agent-specific instructions");

    const extensions = loader.getExtensions().extensions;
    expect(extensions).toHaveLength(1);
    const handler = extensions[0]?.handlers.get("tool_call")?.[0];
    expect(handler).toBeDefined();

    const blocked = await handler?.({
      type: "tool_call",
      toolName: "bash",
      toolCallId: "dangerous-call",
      input: { command: "true;rm -rf /tmp/example" },
    });
    expect(blocked).toMatchObject({ block: true });

    const allowed = await handler?.({
      type: "tool_call",
      toolName: "bash",
      toolCallId: "safe-call",
      input: { command: "npm test" },
    });
    expect(allowed).toBeUndefined();

    const readCall = await handler?.({
      type: "tool_call",
      toolName: "read",
      toolCallId: "read-call",
      input: { path: "/tmp/example" },
    });
    expect(readCall).toBeUndefined();
  });

  it("does not append a blank agent prompt", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "pi-subagent-blank-prompt-"));
    const loader = createSdkSubagentResourceLoader(tempDir, join(tempDir, "agent"), " \n ");

    await loader.reload();

    expect(loader.getAppendSystemPrompt()).toEqual([]);
  });
});
