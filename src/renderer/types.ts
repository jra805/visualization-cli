export interface RenderOptions {
  outputDir: string;
  verbose?: boolean;
  format?: OutputFormat;
}

export type OutputFormat = "mermaid" | "interactive" | "terminal";
