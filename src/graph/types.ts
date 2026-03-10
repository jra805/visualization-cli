export type ModuleType =
  | "component"
  | "hook"
  | "util"
  | "page"
  | "api-route"
  | "store"
  | "test"
  | "layout"
  | "context"
  | "type"
  | "unknown";

export interface GraphNode {
  id: string;
  filePath: string;
  label: string;
  moduleType: ModuleType;
  loc: number;
  directory: string;
}

export interface Edge {
  source: string;
  target: string;
  type: "import" | "renders" | "data-flow";
}

export interface Graph {
  nodes: Map<string, GraphNode>;
  edges: Edge[];
}
