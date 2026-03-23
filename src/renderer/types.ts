export interface RenderOptions {
  outputDir: string;
  verbose?: boolean;
  format?: OutputFormat;
  targetDir?: string;
  fresh?: boolean;
  noPersist?: boolean;
}

export type OutputFormat =
  | "mermaid"
  | "interactive"
  | "terminal"
  | "game"
  | "treemap"
  | "svg";
