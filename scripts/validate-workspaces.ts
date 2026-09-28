import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fail } from "./validation-lib.ts";

interface PiManifest {
  extensions?: string[];
  skills?: string[];
  prompts?: string[];
  themes?: string[];
}

interface PackageManifest {
  name?: string;
  version?: string;
  private?: boolean;
  files?: string[];
  keywords?: string[];
  peerDependencies?: Record<string, string>;
  dependencies?: Record<string, string>;
  pi?: PiManifest;
}

const root = JSON.parse(readFileSync("package.json", "utf8")) as PackageManifest & {
  workspaces?: string[];
};
const rootPi = root.pi ?? {};
const errors: string[] = [];

if (!root.workspaces?.includes("packages/*")) {
  errors.push("root package.json must declare the packages/* npm workspace");
}
if (!root.files?.includes("packages")) {
  errors.push("root package.json files must include packages for the umbrella tarball");
}

const packageRoot = "packages";
const packageDirs = readdirSync(packageRoot)
  .map((name) => join(packageRoot, name))
  .filter((path) => statSync(path).isDirectory());
const packageNames = new Set<string>();

for (const dir of packageDirs) {
  const manifestPath = join(dir, "package.json");
  if (!existsSync(manifestPath)) {
    errors.push(`${dir}: missing package.json`);
    continue;
  }

  const pkg = JSON.parse(readFileSync(manifestPath, "utf8")) as PackageManifest;
  if (!pkg.name || !pkg.version) {
    errors.push(`${manifestPath}: package name and version are required`);
  } else if (packageNames.has(pkg.name)) {
    errors.push(`${manifestPath}: duplicate workspace package name ${pkg.name}`);
  } else {
    packageNames.add(pkg.name);
  }

  if (pkg.private !== true && !pkg.keywords?.includes("pi-package")) {
    errors.push(`${manifestPath}: publishable Pi workspaces must include the pi-package keyword`);
  }
  if (!existsSync(join(dir, "LICENSE")) || !pkg.files?.includes("LICENSE")) {
    errors.push(`${manifestPath}: include a LICENSE file in the package and files allowlist`);
  }
  if (pkg.private !== true && (!existsSync(join(dir, "README.md")) || !pkg.files?.includes("README.md"))) {
    errors.push(`${manifestPath}: publishable workspaces must include README.md in the files allowlist`);
  }
  if (!Array.isArray(pkg.files) || pkg.files.length === 0) {
    errors.push(`${manifestPath}: declare an explicit non-empty files allowlist`);
  }
  if (!pkg.pi) {
    errors.push(`${manifestPath}: missing Pi package manifest`);
    continue;
  }

  let hasExtensions = false;
  for (const [resourceType, paths] of Object.entries(pkg.pi)) {
    if (!Array.isArray(paths)) {
      errors.push(`${manifestPath}: pi.${resourceType} must be an array`);
      continue;
    }

    for (const resourcePath of paths) {
      const normalizedPath = resourcePath.replace(/^\.\//, "");
      const absolutePath = join(dir, normalizedPath);
      if (!existsSync(absolutePath) || !statSync(absolutePath).isDirectory()) {
        errors.push(`${manifestPath}: pi.${resourceType} path "${resourcePath}" is not a directory`);
        continue;
      }
      if (readdirSync(absolutePath).length === 0) {
        errors.push(`${manifestPath}: pi.${resourceType} path "${resourcePath}" is empty`);
      }
      if (!pkg.files?.includes(normalizedPath.split("/")[0] ?? "")) {
        errors.push(`${manifestPath}: files must include the resource root for "${resourcePath}"`);
      }
      if (resourceType === "extensions") hasExtensions = true;
    }
  }

  if (hasExtensions && !rootPi.extensions?.includes(`./${dir}/extensions`)) {
    errors.push(`root package.json pi.extensions must include "./${dir}/extensions"`);
  }

  const declaredPeers = new Set([
    ...Object.keys(pkg.peerDependencies ?? {}),
    ...Object.keys(pkg.dependencies ?? {}),
  ]);
  for (const file of walkSourceFiles(dir)) {
    const source = readFileSync(file, "utf8");
    const importPattern = /(?:from\s*|import\s*)["']([^"']+)["']/g;
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1];
      if (!specifier) continue;
      if (specifier.startsWith(".")) {
        const basePath = resolve(dirname(file), specifier);
        const candidates = [
          basePath,
          `${basePath}.ts`,
          `${basePath}.tsx`,
          basePath.replace(/\.js$/, ".ts"),
          basePath.replace(/\.mjs$/, ".mts"),
          basePath.replace(/\.cjs$/, ".cts"),
          join(basePath, "index.ts"),
        ];
        const target = candidates.find((candidate) => existsSync(candidate));
        if (!target) errors.push(`${file}: relative import "${specifier}" does not resolve`);
        else if (relative(dir, target).startsWith("..")) {
          errors.push(`${file}: relative import "${specifier}" escapes the workspace package`);
        }
        continue;
      }
      if (!specifier.startsWith("@earendil-works/") && specifier !== "typebox") continue;
      const packageName = specifier.startsWith("@")
        ? specifier.split("/").slice(0, 2).join("/")
        : specifier.split("/")[0];
      if (!packageName || !declaredPeers.has(packageName)) {
        errors.push(`${file}: imported runtime package "${packageName ?? specifier}" is missing from peerDependencies`);
      }
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  fail("workspace package validation failed");
}

console.log(`Validated ${packageDirs.length} Pi workspace package(s)`);

function walkSourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkSourceFiles(path));
    else if (/\.[cm]?[jt]sx?$/.test(entry.name)) files.push(path);
  }
  return files;
}
