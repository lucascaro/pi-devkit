import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const repositoryRoot = process.cwd();
const tsxBin = join(repositoryRoot, "node_modules", ".bin", "tsx");

export interface ScriptResult {
  status: number;
  stdout: string;
  stderr: string;
}

export function makeTempProject(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function writeText(root: string, relativePath: string, content: string): void {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

export function writeJson(root: string, relativePath: string, value: unknown): void {
  writeText(root, relativePath, JSON.stringify(value, null, 2));
}

export function writeExecutable(root: string, relativePath: string, content: string): string {
  const path = join(root, relativePath);
  writeText(root, relativePath, content);
  chmodSync(path, 0o755);
  return path;
}

export function runTypeScriptScript(
  scriptPath: string,
  cwd: string,
  env: NodeJS.ProcessEnv = {},
): ScriptResult {
  const result = spawnSync(tsxBin, [join(repositoryRoot, scriptPath)], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  if (result.error) throw result.error;
  return {
    status: result.status ?? 1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

export function createWorkspaceFixture(root: string, files = ["extensions", "README.md", "LICENSE"]): void {
  writeJson(root, "package.json", {
    name: "fixture-root",
    version: "1.0.0",
    private: true,
    workspaces: ["packages/*"],
    files: ["packages"],
    pi: { extensions: ["./packages/demo/extensions"] },
  });
  writeJson(root, "packages/demo/package.json", {
    name: "@fixture/demo",
    version: "1.0.0",
    description: "Fixture package",
    keywords: ["pi-package"],
    files,
    pi: { extensions: ["./extensions"] },
  });
  writeText(root, "packages/demo/README.md", "# Fixture package\n");
  writeText(root, "packages/demo/LICENSE", "Fixture license\n");
  writeText(root, "packages/demo/extensions/demo/index.ts", "export {};\n");
}
