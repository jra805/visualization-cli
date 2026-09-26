export interface RenderOptions {
  outputDir: string;
  /** Display name for the city (defaults to the target folder's name). */
  projectName?: string;
  verbose?: boolean;
  format?: OutputFormat;
  targetDir?: string;
  fresh?: boolean;
  noPersist?: boolean;
}

export type OutputFormat =
  | "city"
  | "mermaid"
  | "interactive"
  | "terminal"
  | "game"
  | "treemap"
  | "svg";
