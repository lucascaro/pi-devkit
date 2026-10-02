import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  createWorkspaceFixture,
  makeTempProject,
  runTypeScriptScript,
  writeExecutable,
  writeJson,
  writeText,
} from "./script-test-utils.ts";

let project: string;

beforeEach(() => {
  project = makeTempProject("package-pack-validator-");
  createWorkspaceFixture(project);
});

afterEach(() => {
  rmSync(project, { recursive: true, force: true });
});

describe("validate-package-packs CLI", () => {
  it("accepts a package whose tarball contains its manifest and Pi resources", () => {
    const result = runTypeScriptScript("scripts/validate-package-packs.ts", project);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("@fixture/demo");
    expect(result.stdout).toContain("packed files");
  });

  it("reports required package files missing from the tarball", () => {
    rmSync(join(project, "packages/demo/README.md"));

    const result = runTypeScriptScript("scripts/validate-package-packs.ts", project);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('required package file "README.md" is absent from the npm tarball');
  });

  it("reports an extension tarball without an index.ts entrypoint", () => {
    rmSync(join(project, "packages/demo/extensions/demo/index.ts"));
    writeText(project, "packages/demo/extensions/demo/extension.ts", "export {};\n");

    const result = runTypeScriptScript("scripts/validate-package-packs.ts", project);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('packed extension "./extensions" has no index.ts');
  });

  it("reports npm pack command failures and invalid JSON output", () => {
    const scenarios = [
      {
        file: "npm-fails",
        body: "#!/bin/sh\nexit 7\n",
        expected: "npm pack dry-run failed for @fixture/demo",
      },
      {
        file: "npm-invalid-json",
        body: "#!/bin/sh\nprintf 'not json\\n'\n",
        expected: "npm pack returned invalid JSON for @fixture/demo",
      },
    ];

    for (const scenario of scenarios) {
      writeExecutable(project, `${scenario.file}/npm`, scenario.body);
      const scenarioPath = `${join(project, scenario.file)}:${dirname(process.execPath)}:${process.env.PATH ?? ""}`;
      const result = runTypeScriptScript("scripts/validate-package-packs.ts", project, { PATH: scenarioPath });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(scenario.expected);
    }

  });

  it("reports a Pi resource excluded from the package tarball", () => {
    const manifestPath = join(project, "packages/demo/package.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { files: string[] };
    writeJson(project, "packages/demo/package.json", {
      ...manifest,
      files: ["README.md", "LICENSE"],
    });

    const result = runTypeScriptScript("scripts/validate-package-packs.ts", project);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Pi resource path "./extensions" is absent from the npm tarball');
  });
});
