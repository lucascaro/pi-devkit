import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  createWorkspaceFixture,
  makeTempProject,
  runTypeScriptScript,
  writeJson,
  writeText,
} from "./script-test-utils.ts";

let project: string;

beforeEach(() => {
  project = makeTempProject("workspace-validator-");
  createWorkspaceFixture(project);
});

afterEach(() => {
  rmSync(project, { recursive: true, force: true });
});

describe("validate-workspaces CLI", () => {
  it("accepts a valid workspace layout", () => {
    const result = runTypeScriptScript("scripts/validate-workspaces.ts", project);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Validated 1 Pi workspace package(s)");
  });

  it("reports invalid root, package metadata, and resource paths", () => {
    const rootManifest = JSON.parse(readFileSync(join(project, "package.json"), "utf8")) as Record<string, unknown>;
    delete rootManifest.workspaces;
    delete rootManifest.files;
    rootManifest.pi = {};
    writeJson(project, "package.json", rootManifest);

    const packageManifest = JSON.parse(readFileSync(join(project, "packages/demo/package.json"), "utf8")) as Record<string, unknown>;
    packageManifest.keywords = [];
    packageManifest.files = [];
    packageManifest.pi = { extensions: ["./missing"] };
    writeJson(project, "packages/demo/package.json", packageManifest);
    rmSync(join(project, "packages/demo/README.md"));
    rmSync(join(project, "packages/demo/LICENSE"));

    const result = runTypeScriptScript("scripts/validate-workspaces.ts", project);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("root package.json must declare the packages/* npm workspace");
    expect(result.stderr).toContain("root package.json files must include packages for the umbrella tarball");
    expect(result.stderr).toContain("publishable Pi workspaces must include the pi-package keyword");
    expect(result.stderr).toContain("include a LICENSE file");
    expect(result.stderr).toContain("must include README.md");
    expect(result.stderr).toContain("declare an explicit non-empty files allowlist");
    expect(result.stderr).toContain('path "./missing" is not a directory');
  });

  it("rejects imports that escape a package and package directories without manifests", () => {
    writeText(
      project,
      "packages/demo/extensions/demo/index.ts",
      'import "../../../outside";\n',
    );
    writeText(project, "packages/outside.ts", "export {};\n");
    mkdirSync(join(project, "packages/stray"), { recursive: true });

    const result = runTypeScriptScript("scripts/validate-workspaces.ts", project);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("relative import \"../../../outside\" escapes the workspace package");
    expect(result.stderr).toContain("packages/stray: missing package.json");
  });

  it("reports runtime imports missing from workspace dependencies", () => {
    writeText(
      project,
      "packages/demo/extensions/demo/index.ts",
      'import "@earendil-works/missing-runtime";\n',
    );

    const result = runTypeScriptScript("scripts/validate-workspaces.ts", project);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('imported runtime package "@earendil-works/missing-runtime"');
    expect(result.stderr).toContain("workspace package validation failed");
  });
});
