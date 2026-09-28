import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/publish-plugin.yml", "utf8");

describe("standalone plugin publish workflow", () => {
  it("requires manual dispatch and explicit publication approval", () => {
    const triggerSection = workflow.match(/^on:\n([\s\S]*?)^permissions:/m)?.[1] ?? "";
    expect(triggerSection).toMatch(/^  workflow_dispatch:/m);
    expect(triggerSection).not.toMatch(/^  (push|pull_request):/m);
    expect(triggerSection).toMatch(/confirm_publish:[\s\S]*?default: false/);
    expect(workflow).toContain("if: ${{ !inputs.confirm_publish }}");
    expect([...workflow.matchAll(/if: \$\{\{ inputs\.confirm_publish && github\.ref == 'refs\/heads\/main' \}\}/g)]).toHaveLength(2);
  });

  it("fails closed on non-main refs and checks out the validated event SHA", () => {
    expect(workflow).toMatch(/require-trusted-ref:[\s\S]*?github\.ref != 'refs\/heads\/main'/);
    expect([...workflow.matchAll(/ref: \$\{\{ github\.sha \}\}/g)]).toHaveLength(2);
  });

  it("limits publication to approved public workspaces and the protected npm environment", () => {
    const pluginOptions = workflow.match(/^        options:\n((?:          - [\w-]+\n)+)/m)?.[1] ?? "";
    expect([...pluginOptions.matchAll(/^          - ([\w-]+)$/gm)].map((match) => match[1])).toEqual([
      "guardrails",
      "input-bell",
      "model-router",
      "subagent",
    ]);
    expect([...workflow.matchAll(/guardrails\|input-bell\|model-router\|subagent/g)]).toHaveLength(2);
    expect(workflow).toMatch(/environment:\n\s+name: npm-publish/);
    expect(workflow).toMatch(/NODE_AUTH_TOKEN:\s+\$\{\{ secrets\.NPM_TOKEN \}\}/);
    expect(workflow).toContain("npm publish --access public --provenance");
  });

  it("skips an already-published version before requiring the publish token", () => {
    const registryCheck = 'npm view "$PACKAGE_NAME@$PACKAGE_VERSION" version --silent';
    const tokenCheck = 'if [ -z "${NODE_AUTH_TOKEN:-}" ]';

    expect(workflow).toContain(registryCheck);
    expect(workflow).toContain('is already published; skipping.');
    expect(workflow.indexOf(registryCheck)).toBeLessThan(workflow.indexOf(tokenCheck));
  });
});
