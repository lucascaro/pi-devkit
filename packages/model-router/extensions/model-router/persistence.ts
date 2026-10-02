import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

const PERSISTENCE_FILE = "router-widget-state.json";

const getPersistencePath = (): string => {
  const agentDir = getAgentDir();
  const dir = join(agentDir, "extensions");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return join(dir, PERSISTENCE_FILE);
};

export interface WidgetState {
  widgetEnabled: boolean;
}

export const loadWidgetState = (): WidgetState => {
  const path = getPersistencePath();
  if (!existsSync(path)) {
    return { widgetEnabled: false };
  }
  try {
    const data = JSON.parse(readFileSync(path, "utf-8")) as WidgetState;
    if (typeof data.widgetEnabled === "boolean") {
      return data;
    }
  } catch {
    // ignore corrupt file
  }
  return { widgetEnabled: false };
};

export const saveWidgetState = (state: WidgetState): void => {
  const path = getPersistencePath();
  try {
    writeFileSync(path, JSON.stringify(state, null, 2), "utf-8");
  } catch {
    // ignore write errors
  }
};
