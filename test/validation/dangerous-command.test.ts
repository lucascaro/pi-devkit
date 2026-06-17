import { describe, expect, it } from "vitest";
import { dangerousCommandReason, isDangerousCommand } from "../../src/lib/dangerous-command.ts";

describe("dangerous command detection", () => {
  it.each([
    "rm -rf /tmp/example",
    "sudo make install",
    "git reset --hard HEAD~1",
    "git push origin main --force-with-lease",
    "chmod -R 777 .",
    "kubectl delete namespace prod",
    "psql -c 'DROP TABLE users'"
  ])("flags %s", (command) => {
    expect(isDangerousCommand(command)).toBe(true);
  });

  it.each([
    "rm file.txt",
    "git status",
    "npm test",
    "kubectl get pods",
    "psql -c 'select * from users limit 1'"
  ])("allows %s", (command) => {
    expect(isDangerousCommand(command)).toBe(false);
  });

  it("returns a useful reason", () => {
    expect(dangerousCommandReason("sudo true")).toContain("guardrails");
  });
});
