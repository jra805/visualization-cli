import type { Graph } from "../../graph/types.js";
import type { ArchReport } from "../../analyzer/types.js";
import { buildCityModel } from "./build-model.js";
import { buildCityHtml } from "./template.js";
import type { CityModel } from "./model.js";

export interface CityOptions {
  /** Shown as the city's name: usually the project folder's name. */
  name: string;
  now?: Date;
}

/** Render the project as a self-contained 8-bit city page. */
export function generateCityHtml(graph: Graph, report: ArchReport, options: CityOptions): string {
  return buildCityHtml(buildCityModel(graph, report, options));
}

export { buildCityModel };
export type { CityModel };
