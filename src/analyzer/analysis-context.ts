export interface AnalysisWarning {
  category: "git" | "parser" | "security" | "io";
  message: string;
}

export interface AnalysisContext {
  warnings: AnalysisWarning[];
  gitAvailable: boolean;
  componentsParsed: boolean;
  dataFlowParsed: boolean;
}

export function createAnalysisContext(): AnalysisContext {
  return {
    warnings: [],
    gitAvailable: true,
    componentsParsed: false,
    dataFlowParsed: false,
  };
}
