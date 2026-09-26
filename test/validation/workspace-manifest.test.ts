import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

interface PackageJson {
  name: string;
  private?: boolean;
  workspaces?: string[];
  pi?: { extensions?: string[] };
}

function readPackage(path: string): PackageJson {
  return JSON.parse(readFileSync(path, "utf8")) as PackageJson;
}

describe("npm workspace package manifests", () => {
  const root = readPackage("package.json");
  const packageDirs = readdirSync("packages").sort();

  it("keeps every plugin workspace in the umbrella package", () => {
    expect(root.workspaces).toContain("packages/*");
    for (const name of packageDirs) {
      expect(root.pi?.extensions).toContain(`./packages/${name}/extensions`);
      expect(readPackage(join("packages", name, "package.json")).pi?.extensions).toEqual(["./extensions"]);
    }
  });

  it("exposes only the selected initial release candidates", () => {
    const initiallyPublishable = new Set([
      "@lucascaro/pi-guardrails",
      "@lucascaro/pi-input-bell",
      "@lucascaro/pi-model-router",
      "@lucascaro/pi-subagent",
    ]);
    const packageNames = packageDirs.map((name) => {
      const pkg = readPackage(join("packages", name, "package.json"));
      expect(pkg.private === true).toBe(!initiallyPublishable.has(pkg.name));
      return pkg.name;
    });
    expect(new Set(packageNames).size).toBe(packageNames.length);
  });
});
