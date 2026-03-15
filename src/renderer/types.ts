export interface RenderOptions {
  outputDir: string;
  verbose?: boolean;
  format?: OutputFormat;
  targetDir?: string;
}

export type OutputFormat =
  | "mermaid"
  | "interactive"
  | "terminal"
  | "game"
  | "treemap"
  | "svg";
