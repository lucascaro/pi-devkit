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

  it("handles extra whitespace and tabs", () => {
    expect(isDangerousCommand("git  reset   --hard  HEAD~1")).toBe(true);
    expect(isDangerousCommand("rm\t-rf\t/tmp")).toBe(true);
    expect(isDangerousCommand("rm -rf /tmp")).toBe(true);
  });

  it("handles case-insensitive patterns", () => {
    expect(isDangerousCommand("SUDO true")).toBe(true);
    expect(isDangerousCommand("drop TABLE users")).toBe(true);
    expect(isDangerousCommand("TrUnCaTe TABLE users")).toBe(true);
  });

  it("handles multi-command chains", () => {
    expect(isDangerousCommand("git reset --hard && git push --force")).toBe(true);
    expect(isDangerousCommand("echo hello; sudo rm -rf /tmp")).toBe(true);
  });

  it("handles nested quotes and escaped chars", () => {
    expect(isDangerousCommand('rm -rf "my files"')).toBe(true);
    expect(isDangerousCommand("rm -rf 'tmp dir'")).toBe(true);
  });

  it("flags rm with flag permutations", () => {
    expect(isDangerousCommand("rm -fr /tmp")).toBe(true);
    expect(isDangerousCommand("rm -rfvf /tmp")).toBe(true);
  });

  it("flags docker system prune -a", () => {
    expect(isDangerousCommand("docker system prune -a")).toBe(true);
    expect(isDangerousCommand("docker system prune --all")).toBe(true);
  });

  it("does not flag harmless rm", () => {
    expect(isDangerousCommand("rm file.txt")).toBe(false);
    expect(isDangerousCommand("rm -v file.txt")).toBe(false);
    expect(isDangerousCommand("rm --preserve-root /tmp")).toBe(false);
  });
});
