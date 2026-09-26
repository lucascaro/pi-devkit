import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fail } from "./validation-lib.ts";

interface PiManifest {
  extensions?: string[];
  skills?: string[];
  prompts?: string[];
  themes?: string[];
}

interface PackageManifest {
  name?: string;
  private?: boolean;
  workspaces?: string[];
  pi?: PiManifest;
}

interface PackFile {
  path: string;
}

interface PackResult {
  files?: PackFile[];
}

const rootPackage = JSON.parse(readFileSync("package.json", "utf8")) as PackageManifest;
const workspacePaths = (rootPackage.workspaces ?? []).flatMap((pattern) => {
  if (pattern !== "packages/*") return [];
  return readdirSync("packages")
    .map((name) => join("packages", name))
    .filter((path) => statSync(path).isDirectory());
});
const workspaces = [
  { path: ".", manifest: rootPackage },
  ...workspacePaths.map((path) => ({
    path,
    manifest: JSON.parse(readFileSync(join(path, "package.json"), "utf8")) as PackageManifest,
  })),
];

for (const workspace of workspaces) {
  const name = workspace.manifest.name;
  if (!name || workspace.manifest.private) continue;

  const args = ["pack", "--dry-run", "--json"];
  if (workspace.path !== ".") args.push("--workspace", name);

  let output: string;
  try {
    output = execFileSync("npm", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    fail(`npm pack dry-run failed for ${name}: ${details}`);
  }

  let result: PackResult;
  try {
    result = (JSON.parse(output) as PackResult[])[0] ?? {};
  } catch {
    fail(`npm pack returned invalid JSON for ${name}`);
  }

  const packedPaths = (result.files ?? []).map((file) => file.path);
  if (packedPaths.length === 0) fail(`${name}: npm pack produced no files`);
  for (const requiredFile of ["package.json", "README.md", "LICENSE"]) {
    if (!packedPaths.includes(requiredFile)) {
      fail(`${name}: required package file "${requiredFile}" is absent from the npm tarball`);
    }
  }

  for (const declaredPath of Object.values(workspace.manifest.pi ?? {}).flat()) {
    const resourceRoot = declaredPath.replace(/^\.\//, "").replace(/\/$/, "");
    if (!packedPaths.some((path) => path.startsWith(`${resourceRoot}/`))) {
      fail(`${name}: Pi resource path "${declaredPath}" is absent from the npm tarball`);
    }
  }

  for (const extensionPath of workspace.manifest.pi?.extensions ?? []) {
    const prefix = `${extensionPath.replace(/^\.\//, "").replace(/\/$/, "")}/`;
    if (!packedPaths.some((path) => path.startsWith(prefix) && path.endsWith("/index.ts"))) {
      fail(`${name}: packed extension "${extensionPath}" has no index.ts`);
    }
  }

  console.log(`  ✓ ${name} (${packedPaths.length} packed files)`);
}
