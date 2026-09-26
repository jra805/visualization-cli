import type { CityGrade, IssueType, Severity } from "../../analyzer/types.js";
import type { IssueDescription } from "../../analyzer/issue-descriptions.js";

/**
 * Everything the browser needs to draw the city, serialized into the page.
 * Coordinates are tiles on an isometric grid: x grows to the lower right,
 * y to the lower left, so (0, 0) is the back corner of the map.
 */
export interface CityModel {
  name: string;
  /** Hamlet, Village, Town, City, Metropolis, Megalopolis */
  sizeName: string;
  grade: CityGrade;
  stats: {
    buildings: number;
    districts: number;
    lines: number;
    roads: number;
    languages: string[];
    problems: Record<Severity, number>;
  };
  /** Grid size in tiles, including the countryside around the city. */
  width: number;
  height: number;
  districts: CityDistrict[];
  /** Rectangles of ground where buildings stand (one per folder with files). */
  blocks: CityBlock[];
  buildings: CityBuilding[];
  /** Special places outside the blocks: landfill, rubble, containers… */
  lots: CityLot[];
  /** Import relationships between buildings (indices into `buildings`). */
  links: { from: number; to: number; typeOnly?: boolean }[];
  /** Circular imports as building indices in import order. */
  cycles: number[][];
  issues: CityIssue[];
  /** Plain-English descriptions for every issue type present. */
  catalog: Partial<Record<IssueType, IssueDescription>>;
  /** Where the welcome sign and the notice board stand. */
  landmarks: {
    welcomeSign: { x: number; y: number; state: "ok" | "missing" | "template" };
    noticeBoard: { x: number; y: number };
    cityHall: number | null;
  };
  generatedAt: string;
}

export interface CityDistrict {
  id: number;
  /** Folder path relative to the project root ("" for the root). */
  path: string;
  /** Display name: the last folder segment(s). */
  name: string;
  depth: number;
  parent: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Colour family for the ground, shared by a top-level district and its children. */
  tint: number;
  files: number;
  lines: number;
}

export interface CityBlock {
  district: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Building styles, one per kind of file. */
export type BuildingStyle =
  | "shop" // UI: components, pages, layouts
  | "office" // routes, controllers, handlers, middleware
  | "factory" // services and business logic
  | "warehouse" // models, repositories, schemas, migrations
  | "bank" // state: stores, contexts, hooks
  | "workshop" // utilities, config, types
  | "cityhall" // the entry point
  | "firestation" // tests
  | "house"; // everything else

export interface CityBuilding {
  id: number;
  path: string;
  name: string;
  district: number;
  x: number;
  y: number;
  /** Footprint in tiles (1 or 2). */
  size: number;
  floors: number;
  style: BuildingStyle;
  /** Human-readable role, e.g. "UI component". */
  role: string;
  moduleType: string;
  lines: number;
  language?: string;
  fanIn: number;
  fanOut: number;
  /** Indices into `issues`. */
  issues: number[];
  worst: Severity | null;
  /** Small per-building colour variation. */
  variant: number;
}

export type LotKind =
  | "landfill" // committed dependencies
  | "rubble" // committed build output
  | "containers" // large files and databases
  | "junkpile" // OS/editor junk
  | "vault" // committed .env / credentials
  | "firestation-site"; // no tests: an empty lot waiting for a fire station

export interface CityLot {
  id: number;
  kind: LotKind;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  issue: number;
}

export interface CityIssue {
  id: number;
  type: IssueType;
  severity: Severity;
  title: string;
  message: string;
  files: string[];
  line?: number;
  evidence?: string[];
  commands?: string[];
  buildings: number[];
  lot?: number;
}
