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
    expect([...workflow.matchAll(/ref: \$\{\{ github\.sha \}\}/g)]).toHaveLength(1);
  });

  it("limits publication to approved public workspaces and the protected npm environment", () => {
    const pluginOptions = workflow.match(/^        options:\n((?:          - [\w-]+\n)+)/m)?.[1] ?? "";
    expect([...pluginOptions.matchAll(/^          - ([\w-]+)$/gm)].map((match) => match[1])).toEqual([
      "guardrails",
      "input-bell",
      "model-router",
      "subagent",
    ]);
    expect([...workflow.matchAll(/guardrails\|input-bell\|model-router\|subagent/g)]).toHaveLength(1);
    expect(workflow).toMatch(/environment:\n\s+name: npm-publish/);
    expect(workflow).toContain("id-token: write");
    expect(workflow).not.toContain("NPM_TOKEN");
    expect(workflow).toContain('npm publish "$TARBALL_PATH" --access public --ignore-scripts');
  });

  it("publishes the exact validated tarball without checking out source in the OIDC job", () => {
    const validateJob = workflow.match(/^  validate:[\s\S]*?^  publish:/m)?.[0] ?? "";
    const publishJob = workflow.match(/^  publish:[\s\S]*$/m)?.[0] ?? "";

    expect(validateJob).toContain('npm pack --workspace "$PACKAGE_NAME" --pack-destination "$PACK_DIR" --json');
    expect(validateJob).toContain("actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02");
    expect(validateJob).toMatch(/persist-credentials: false/);
    expect(validateJob).toContain("packedPaths");
    expect(validateJob).not.toContain("NPM_TOKEN");
    expect(publishJob).toContain("actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093");
    expect(publishJob).not.toContain("actions/checkout@");
    expect(publishJob).toContain("id-token: write");
    expect(publishJob).not.toContain("NODE_AUTH_TOKEN");
    expect(publishJob).not.toContain("NPM_TOKEN");
    expect(publishJob).toContain('npm publish "$TARBALL_PATH" --access public --ignore-scripts');
  });

  it("pins all actions to immutable commit SHAs", () => {
    const actionRefs = [...workflow.matchAll(/^\s+(?:- )?uses: (actions\/[^@\s]+)@([a-f0-9]{40})(?:\s+# v[\w.-]+)?$/gm)];
    expect(actionRefs).toHaveLength(5);
    expect(workflow).not.toMatch(/^\s+(?:- )?uses: actions\/[^@\s]+@v\d/m);
  });

  it("skips an already-published version before OIDC publication", () => {
    const registryCheck = 'npm view "$PACKAGE_NAME@$PACKAGE_VERSION" version --silent';
    const publishStep = "Publish validated package tarball with trusted publishing";

    expect(workflow).toContain(registryCheck);
    expect(workflow).toContain('is already published; skipping.');
    expect(workflow.indexOf(registryCheck)).toBeLessThan(workflow.indexOf(publishStep));
  });

  it("requires an npm CLI version that supports trusted publishing", () => {
    expect(workflow).toContain("Check npm trusted-publishing support");
    expect(workflow).toContain("npm >=11.5.1 is required for trusted publishing");
  });
});
