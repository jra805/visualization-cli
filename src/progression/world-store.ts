import fs from "node:fs";
import path from "node:path";
import type { WorldState } from "./types.js";

export function getCodescapeDir(targetDir: string): string {
  return path.join(targetDir, ".codescape");
}

export function loadWorldState(targetDir: string): WorldState | null {
  const filePath = path.join(getCodescapeDir(targetDir), "world.json");
  try {
    const data = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(data);
    if (parsed && parsed.version === 1 && parsed.nodes) {
      return parsed as WorldState;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveWorldState(targetDir: string, state: WorldState): void {
  const dir = getCodescapeDir(targetDir);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, "world.json");
  const tmpPath = filePath + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), "utf-8");
  fs.renameSync(tmpPath, filePath);
}
