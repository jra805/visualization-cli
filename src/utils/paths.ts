import path from "node:path";

export function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

export function relativeTo(base: string, filePath: string): string {
  return normalizePath(path.relative(base, filePath));
}

export function getModuleName(filePath: string): string {
  const parsed = path.parse(filePath);
  if (parsed.name === "index") {
    return path.basename(parsed.dir);
  }
  return parsed.name;
}
