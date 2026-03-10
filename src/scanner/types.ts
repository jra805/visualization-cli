export type FrameworkType = "react" | "nextjs" | "unknown";

export interface ScanResult {
  rootDir: string;
  framework: FrameworkType;
  files: string[];
  entryPoints: string[];
  hasTypeScript: boolean;
}
