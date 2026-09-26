import type { Language } from "../scanner/types.js";

export type ModuleType =
  // Frontend presentation
  | "component"
  | "page"
  | "layout"
  | "directive"
  | "view"
  | "template"
  // Frontend logic
  | "hook"
  | "composable"
  | "store"
  | "context"
  // Backend entry
  | "controller"
  | "api-route"
  | "route-config"
  | "handler"
  // Backend middleware
  | "middleware"
  | "guard"
  | "interceptor"
  | "validator"
  // Backend business
  | "service"
  // Data
  | "repository"
  | "model"
  | "entity"
  | "dto"
  | "migration"
  | "schema"
  // Infrastructure
  | "config"
  | "entry-point"
  // Cross-cutting
  | "type"
  | "util"
  | "decorator"
  | "serializer"
  // Test & fallback
  | "test"
  | "unknown";

export interface GraphNode {
  id: string;
  filePath: string;
  label: string;
  moduleType: ModuleType;
  loc: number;
  directory: string;
  language?: Language;
}

export interface Edge {
  source: string;
  target: string;
  type: "import" | "renders" | "data-flow";
  /** `import type` / `export type`: erased at runtime, so it can't form a real cycle. */
  typeOnly?: boolean;
  /** Loaded on first use (dynamic import(), an import inside a function): no import-time cycle. */
  lazy?: boolean;
}

export interface Graph {
  nodes: Map<string, GraphNode>;
  edges: Edge[];
}
