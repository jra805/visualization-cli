export interface ParsedModule {
  filePath: string;
  imports: string[];
  exports: string[];
  loc: number;
}

export interface ComponentInfo {
  name: string;
  filePath: string;
  props: PropInfo[];
  hooksUsed: string[];
  childComponents: string[];
  isDefaultExport: boolean;
}

export interface PropInfo {
  name: string;
  type: string;
  isRequired: boolean;
}

export type DataSourceType = "props" | "context" | "store" | "api" | "local-state";

export interface DataSource {
  type: DataSourceType;
  name: string;
  detail: string;
}

export interface ComponentDataFlow {
  componentName: string;
  filePath: string;
  dataSources: DataSource[];
}

export interface ParseResult {
  modules: ParsedModule[];
  components: ComponentInfo[];
  dataFlows: ComponentDataFlow[];
}
