/**
 * Agent discovery — loads agent definitions from YAML (markdown) files and
 * TypeScript modules in user-level and project-local directories.
 *
 * Locations:
 *   - ~/.pi/agent/agents/*.md   (user-level, always loaded)
 *   - .pi/agents/*.md           (project-local, only with scope "project"/"both")
 *   - *.ts / *.js modules       (dynamic agents, same directories)
 *
 * Project agents override user agents with the same name when scope is "both".
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  CONFIG_DIR_NAME,
  getAgentDir,
  parseFrontmatter,
} from "@earendil-works/pi-coding-agent";
import type {
  AgentDefinition,
  AgentDiscoveryResult,
  AgentScope,
  AgentSource,
  DynamicAgentDefinition,
} from "./types.ts";

// ---------------------------------------------------------------------------
// Frontmatter helpers
// ---------------------------------------------------------------------------

type AgentFrontmatter = {
  name?: unknown;
  description?: unknown;
  model?: unknown;
  tools?: unknown;
  backend?: unknown;
  isolation?: unknown;
  thinkingLevel?: unknown;
};

/**
 * Normalize a frontmatter `tools` value to a list of tool names.
 * Accepts both `tools: read, bash` and `tools: [read, bash]`.
 */
function parseToolList(value: unknown): string[] | undefined {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const tools = raw
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim())
    .filter(Boolean);
  return tools.length > 0 ? tools : undefined;
}

function parseBackend(value: unknown): "sdk" | "subprocess" | undefined {
  return value === "sdk" || value === "subprocess" ? value : undefined;
}

function parseIsolation(value: unknown): "none" | "session" | "process" | undefined {
  return value === "none" || value === "session" || value === "process" ? value : undefined;
}

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;
function parseThinkingLevel(value: unknown): AgentDefinition["thinkingLevel"] {
  return (THINKING_LEVELS as readonly string[]).includes(value as string)
    ? (value as AgentDefinition["thinkingLevel"])
    : undefined;
}

// ---------------------------------------------------------------------------
// YAML (markdown) agent loading
// ---------------------------------------------------------------------------

function loadYamlAgent(filePath: string, source: AgentSource): AgentDefinition | null {
  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }

  const { frontmatter, body } = parseFrontmatter<AgentFrontmatter>(content);

  const name = typeof frontmatter.name === "string" ? frontmatter.name : undefined;
  const description = typeof frontmatter.description === "string" ? frontmatter.description : undefined;
  if (!name || !description) return null;

  return {
    name,
    description,
    model: typeof frontmatter.model === "string" ? frontmatter.model : undefined,
    thinkingLevel: parseThinkingLevel(frontmatter.thinkingLevel),
    tools: parseToolList(frontmatter.tools),
    systemPrompt: body,
    backend: parseBackend(frontmatter.backend),
    isolation: parseIsolation(frontmatter.isolation),
    source,
    filePath,
  };
}

// ---------------------------------------------------------------------------
// TypeScript module agent loading
// ---------------------------------------------------------------------------

/**
 * Load dynamic agents from a TS/JS module. The module should export one or more
 * agent definition objects (either as named exports or a default export array).
 *
 * Uses dynamic import() which works in pi's jiti runtime and in vitest. Modules
 * that fail to load are skipped (a single bad file must not break discovery).
 */
async function loadTsAgentsFromModule(filePath: string, source: AgentSource): Promise<DynamicAgentDefinition[]> {
  const agents: DynamicAgentDefinition[] = [];

  let mod: Record<string, unknown>;
  try {
    mod = (await import(filePath)) as Record<string, unknown>;
  } catch {
    return agents;
  }

  const candidates: unknown[] = [];
  if (Array.isArray(mod.default)) {
    candidates.push(...mod.default);
  }
  for (const value of Object.values(mod)) {
    if (value !== mod.default) candidates.push(value);
  }

  for (const value of candidates) {
    if (!isAgentDefinitionShape(value)) continue;
    const def = value as DynamicAgentDefinition;
    def.source = source;
    def.filePath = filePath;
    agents.push(def);
  }

  return agents;
}

function isAgentDefinitionShape(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.name === "string" &&
    typeof v.description === "string" &&
    (typeof v.systemPrompt === "string" || typeof v.systemPrompt === "function")
  );
}

// ---------------------------------------------------------------------------
// Directory scanning
// ---------------------------------------------------------------------------

function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function listFiles(dir: string, exts: string[]): string[] {
  if (!fs.existsSync(dir)) return [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => (e.isFile() || e.isSymbolicLink()) && exts.some((ext) => e.name.endsWith(ext)))
    .map((e) => path.join(dir, e.name));
}

/** Find the nearest project-local agents directory walking up from cwd. */
export function findNearestProjectAgentsDir(cwd: string): string | null {
  let currentDir = cwd;
  while (true) {
    const candidate = path.join(currentDir, CONFIG_DIR_NAME, "agents");
    if (isDirectory(candidate)) return candidate;
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) return null;
    currentDir = parentDir;
  }
}

/**
 * Discover agents from bundled, user-level, and project-local directories.
 *
 * Search & override precedence (later overrides earlier for the same name):
 *   1. extraUserDirs (e.g. the extension's bundled default agents)
 *   2. ~/.pi/agent/agents (user-level)
 *   3. .pi/agents (project-local; only when scope includes "project")
 *
 * @param cwd           Working directory to search for project-local agents.
 * @param scope         Which scopes to include:
 *   - "user"    — bundled + user-level agents
 *   - "project" — only project-local agents
 *   - "both"    — bundled + user + project (project wins on name conflict)
 * @param extraUserDirs Additional user-level agent directories (e.g. the
 *   extension's own bundled agents). Treated as "user" source.
 */
export async function discoverAgents(
  cwd: string,
  scope: AgentScope,
  extraUserDirs: string[] = [],
): Promise<AgentDiscoveryResult> {
  const userDir = path.join(getAgentDir(), "agents");
  const projectAgentsDir = findNearestProjectAgentsDir(cwd);

  const includeUser = scope === "both" || scope === "user";
  const includeProject = (scope === "both" || scope === "project") && projectAgentsDir !== null;

  const extraYaml = includeUser ? loadYamlFromDirs(extraUserDirs, "user") : [];
  const extraTs = includeUser ? await loadTsFromDirs(extraUserDirs, "user") : [];

  const userYaml = includeUser ? loadYamlFromDirs([userDir], "user") : [];
  const userTs = includeUser ? await loadTsFromDirs([userDir], "user") : [];

  const projectDir = includeProject ? projectAgentsDir! : null;
  const projectYaml = projectDir ? loadYamlFromDirs([projectDir], "project") : [];
  const projectTs = projectDir ? await loadTsFromDirs([projectDir], "project") : [];

  const agentMap = new Map<string, AgentDefinition | DynamicAgentDefinition>();

  // Precedence (later overrides earlier): bundled < user < project.
  for (const agent of [...extraYaml, ...extraTs, ...userYaml, ...userTs]) agentMap.set(agent.name, agent);
  for (const agent of [...projectYaml, ...projectTs]) agentMap.set(agent.name, agent);

  return { agents: Array.from(agentMap.values()), projectAgentsDir };
}

function loadYamlFromDirs(dirs: string[], source: AgentSource): AgentDefinition[] {
  return dirs
    .flatMap((dir) => listFiles(dir, [".md"]))
    .map((f) => loadYamlAgent(f, source))
    .filter((a): a is AgentDefinition => a !== null);
}

async function loadTsFromDirs(dirs: string[], source: AgentSource): Promise<DynamicAgentDefinition[]> {
  const files = dirs.flatMap((dir) => listFiles(dir, [".ts", ".js"]));
  const loaded = await Promise.all(files.map((f) => loadTsAgentsFromModule(f, source)));
  return loaded.flat();
}

/** Format a list of agents for display (e.g. in error messages). */
export function formatAgentList(
  agents: Array<AgentDefinition | DynamicAgentDefinition>,
  maxItems: number,
): { text: string; remaining: number } {
  if (agents.length === 0) return { text: "none", remaining: 0 };
  const listed = agents.slice(0, maxItems);
  const remaining = agents.length - listed.length;
  return {
    text: listed.map((a) => `${a.name} (${a.source}): ${a.description}`).join("; "),
    remaining,
  };
}
