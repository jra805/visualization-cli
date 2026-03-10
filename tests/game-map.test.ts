import { describe, it, expect } from "vitest";
import { createGraph, addNode, addEdge } from "../src/graph/index.js";
import { mapNodesToLocations } from "../src/renderer/game-map/node-mapper.js";
import { layoutLocations } from "../src/renderer/game-map/layout-engine.js";
import {
  generateTerrain,
  routePaths,
  clearPathTerrain,
  TERRAIN,
} from "../src/renderer/game-map/world-builder.js";
import { generateGameMapHtml } from "../src/renderer/game-map/index.js";
import { serializeGraph } from "../src/renderer/serialize.js";
import type { ArchReport } from "../src/analyzer/types.js";
import type { ComponentInfo, ComponentDataFlow } from "../src/parser/types.js";

function makeReport(overrides: Partial<ArchReport> = {}): ArchReport {
  return {
    totalModules: 2,
    totalEdges: 1,
    issues: [],
    circularDeps: [],
    orphans: [],
    topCoupled: [],
    ...overrides,
  };
}

function makeTestGraph() {
  const graph = createGraph();
  addNode(graph, { id: "src/App.tsx", filePath: "src/App.tsx", label: "App", moduleType: "component", loc: 100, directory: "src" });
  addNode(graph, { id: "src/Header.tsx", filePath: "src/Header.tsx", label: "Header", moduleType: "component", loc: 30, directory: "src" });
  addNode(graph, { id: "src/useAuth.ts", filePath: "src/useAuth.ts", label: "useAuth", moduleType: "hook", loc: 40, directory: "src" });
  addNode(graph, { id: "src/api.ts", filePath: "src/api.ts", label: "api", moduleType: "api-route", loc: 20, directory: "src" });
  addNode(graph, { id: "src/types.ts", filePath: "src/types.ts", label: "types", moduleType: "type", loc: 10, directory: "src" });
  addEdge(graph, { source: "src/App.tsx", target: "src/Header.tsx", type: "renders" });
  addEdge(graph, { source: "src/App.tsx", target: "src/useAuth.ts", type: "import" });
  addEdge(graph, { source: "src/Header.tsx", target: "src/api.ts", type: "import" });
  addEdge(graph, { source: "src/api.ts", target: "src/types.ts", type: "import" });
  return graph;
}

describe("game-map", () => {
  describe("node-mapper", () => {
    it("maps nodes to game locations with correct types", () => {
      const graph = makeTestGraph();
      const report = makeReport();
      const serialized = serializeGraph(graph, report, [], []);
      const locations = mapNodesToLocations(serialized.nodes);

      expect(locations).toHaveLength(5);

      const app = locations.find((l) => l.label === "App")!;
      expect(app.moduleType).toBe("component");
      expect(app.sizeCategory).toBe("medium"); // loc=100, fan=3
      expect(app.colorMain).toBe("#4A7AE8");

      const hook = locations.find((l) => l.label === "useAuth")!;
      expect(hook.moduleType).toBe("hook");
      expect(hook.locationName).toBe("Magic Circle"); // small hook

      const api = locations.find((l) => l.label === "api")!;
      expect(api.moduleType).toBe("api-route");
    });

    it("assigns god modules as large", () => {
      const graph = createGraph();
      addNode(graph, { id: "big.ts", filePath: "big.ts", label: "big", moduleType: "component", loc: 500, directory: "" });
      const report = makeReport({
        issues: [{ type: "god-module", severity: "warning", message: "test", files: ["big.ts"] }],
      });
      const serialized = serializeGraph(graph, report, [], []);
      const locations = mapNodesToLocations(serialized.nodes);

      expect(locations[0].sizeCategory).toBe("large");
      expect(locations[0].isGodModule).toBe(true);
    });

    it("carries through component metadata", () => {
      const graph = createGraph();
      addNode(graph, { id: "x.tsx", filePath: "x.tsx", label: "X", moduleType: "component", loc: 10, directory: "" });
      const components: ComponentInfo[] = [
        { name: "X", filePath: "x.tsx", props: [{ name: "title", type: "string", isRequired: true }], hooksUsed: ["useState"], childComponents: [], isDefaultExport: true },
      ];
      const serialized = serializeGraph(graph, makeReport(), components, []);
      const locations = mapNodesToLocations(serialized.nodes);

      expect(locations[0].component).toBeDefined();
      expect(locations[0].component!.hooksUsed).toContain("useState");
    });
  });

  describe("layout-engine", () => {
    it("places all locations on grid without overlaps", () => {
      const graph = makeTestGraph();
      const serialized = serializeGraph(graph, makeReport(), [], []);
      const locations = mapNodesToLocations(serialized.nodes);
      const grid = layoutLocations(locations, serialized.edges);

      expect(grid.width).toBeGreaterThanOrEqual(20);
      expect(grid.height).toBeGreaterThanOrEqual(20);

      // All locations should be placed (gridX/gridY >= 0)
      for (const loc of locations) {
        expect(loc.gridX).toBeGreaterThanOrEqual(0);
        expect(loc.gridY).toBeGreaterThanOrEqual(0);
        expect(loc.gridX + loc.tileSize).toBeLessThanOrEqual(grid.width);
        expect(loc.gridY + loc.tileSize).toBeLessThanOrEqual(grid.height);
      }

      // No two locations should overlap
      for (let i = 0; i < locations.length; i++) {
        for (let j = i + 1; j < locations.length; j++) {
          const a = locations[i];
          const b = locations[j];
          const overlapX = a.gridX < b.gridX + b.tileSize + 1 && a.gridX + a.tileSize + 1 > b.gridX;
          const overlapY = a.gridY < b.gridY + b.tileSize + 1 && a.gridY + a.tileSize + 1 > b.gridY;
          expect(overlapX && overlapY).toBe(false);
        }
      }
    });

    it("handles empty locations list", () => {
      const grid = layoutLocations([], []);
      expect(grid.width).toBe(20);
      expect(grid.height).toBe(20);
    });

    it("highest importance node near center", () => {
      const graph = makeTestGraph();
      const serialized = serializeGraph(graph, makeReport(), [], []);
      const locations = mapNodesToLocations(serialized.nodes);
      layoutLocations(locations, serialized.edges);

      // Find highest importance
      const sorted = [...locations].sort((a, b) => b.importance - a.importance);
      const capital = sorted[0];
      const center = 10; // grid is 20x20

      // Capital should be reasonably close to center (within 5 tiles)
      expect(Math.abs(capital.gridX - center)).toBeLessThanOrEqual(5);
      expect(Math.abs(capital.gridY - center)).toBeLessThanOrEqual(5);
    });
  });

  describe("world-builder", () => {
    it("generates terrain grid of correct size", () => {
      const graph = makeTestGraph();
      const serialized = serializeGraph(graph, makeReport(), [], []);
      const locations = mapNodesToLocations(serialized.nodes);
      layoutLocations(locations, serialized.edges);

      const terrain = generateTerrain(20, 20, locations);
      expect(terrain).toHaveLength(20);
      expect(terrain[0]).toHaveLength(20);

      // All values should be valid terrain types
      for (const row of terrain) {
        for (const t of row) {
          expect(t).toBeGreaterThanOrEqual(0);
          expect(t).toBeLessThanOrEqual(6);
        }
      }
    });

    it("keeps grass around location tiles", () => {
      const graph = createGraph();
      addNode(graph, { id: "a.ts", filePath: "a.ts", label: "a", moduleType: "component", loc: 10, directory: "" });
      const serialized = serializeGraph(graph, makeReport(), [], []);
      const locations = mapNodesToLocations(serialized.nodes);
      layoutLocations(locations, serialized.edges);

      const terrain = generateTerrain(20, 20, locations);
      const loc = locations[0];

      // Tile at location should be grass (0-3)
      expect(terrain[loc.gridY][loc.gridX]).toBeLessThanOrEqual(3);
    });

    it("routes paths between connected locations", () => {
      const graph = makeTestGraph();
      const serialized = serializeGraph(graph, makeReport(), [], []);
      const locations = mapNodesToLocations(serialized.nodes);
      layoutLocations(locations, serialized.edges);

      const paths = routePaths(locations, serialized.edges);
      expect(paths.length).toBeGreaterThan(0);

      for (const p of paths) {
        expect(p.points.length).toBeGreaterThanOrEqual(1);
        expect(p.edgeType).toBeTruthy();
      }
    });

    it("clears terrain along path routes", () => {
      const terrain = [
        [4, 4, 4, 4, 4],
        [4, 4, 4, 4, 4],
        [4, 4, 4, 4, 4],
      ];
      const paths = [
        { sourceId: "a", targetId: "b", edgeType: "import", isCircular: false, points: [[1, 1] as [number, number], [2, 1] as [number, number], [3, 1] as [number, number]] },
      ];
      clearPathTerrain(terrain, paths);

      // Path tiles should now be grass (0-3)
      expect(terrain[1][1]).toBeLessThanOrEqual(3);
      expect(terrain[1][2]).toBeLessThanOrEqual(3);
      expect(terrain[1][3]).toBeLessThanOrEqual(3);
      // Non-path tiles should still be forest
      expect(terrain[0][0]).toBe(4);
    });
  });

  describe("full pipeline", () => {
    it("generates valid self-contained HTML", () => {
      const graph = makeTestGraph();
      const report = makeReport();
      const html = generateGameMapHtml(graph, report, [], []);

      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("</html>");
      expect(html).toContain("game-data");
      expect(html).toContain("REALM MAP");
      expect(html).toContain("Kingdom Overview");
      expect(html).toContain("Command Chain");
      expect(html).toContain("Supply Lines");
      expect(html).toContain("Threat Map");
    });

    it("contains no external script or stylesheet references", () => {
      const graph = makeTestGraph();
      const html = generateGameMapHtml(graph, makeReport(), [], []);

      // No CDN/external references
      expect(html).not.toContain("src=\"http");
      expect(html).not.toContain("href=\"http");
      expect(html).not.toContain("fonts.googleapis");
      expect(html).not.toContain("cdnjs.cloudflare");
      expect(html).not.toContain("cdn.jsdelivr");
    });

    it("embeds valid JSON data blob", () => {
      const graph = makeTestGraph();
      const html = generateGameMapHtml(graph, makeReport(), [], []);

      const match = html.match(/<script id="game-data" type="application\/json">([\s\S]*?)<\/script>/);
      expect(match).toBeTruthy();

      const data = JSON.parse(match![1]);
      expect(data.locations).toHaveLength(5);
      expect(data.paths.length).toBeGreaterThan(0);
      expect(data.terrain.length).toBeGreaterThan(0);
      expect(data.gridWidth).toBeGreaterThanOrEqual(20);
      expect(data.report.totalModules).toBe(2);
    });

    it("sanitizes location data against XSS", () => {
      const graph = createGraph();
      // Inject malicious label and filepath
      addNode(graph, {
        id: "src/evil.tsx",
        filePath: "src/evil.tsx",
        label: "<img onerror=alert(1)>",
        moduleType: "component",
        loc: 10,
        directory: "src",
      });

      const html = generateGameMapHtml(graph, makeReport(), [], []);

      // Malicious content should only appear inside <script type="application/json">
      // (which browsers do NOT parse as HTML), never as raw HTML attributes or content.
      // Split HTML to get content outside the JSON blob:
      const jsonStart = html.indexOf('<script id="game-data"');
      const jsonEnd = html.indexOf("</script>", jsonStart) + "</script>".length;
      const outsideJson = html.substring(0, jsonStart) + html.substring(jsonEnd);

      // The malicious label must NOT appear in HTML outside the JSON data blob
      expect(outsideJson).not.toContain("<img onerror");
      expect(outsideJson).not.toContain("alert(1)");

      // The JSON data blob safely contains the string (as JSON-encoded value)
      const match = html.match(/<script id="game-data" type="application\/json">([\s\S]*?)<\/script>/);
      expect(match).toBeTruthy();
      const data = JSON.parse(match![1]);
      expect(data.locations[0].label).toBe("<img onerror=alert(1)>");

      // The client-side JS uses textContent for all user data, never innerHTML
      // Verify that the template JS uses textContent for labels
      expect(html).toContain("textContent");
      // The JS code should never use innerHTML to set user-controlled content
      // (a comment mentioning innerHTML for documentation is acceptable)
      const scriptSection = html.substring(html.lastIndexOf("<script>"));
      const jsLines = scriptSection.split("\n").filter(line => !line.trim().startsWith("//"));
      const hasInnerHtmlAssignment = jsLines.some(line => /\.innerHTML\s*=/.test(line));
      expect(hasInnerHtmlAssignment).toBe(false);
    });
  });
});
