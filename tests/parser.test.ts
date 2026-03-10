import { describe, it, expect } from "vitest";
import path from "node:path";
import { scan } from "../src/scanner/index.js";
import { parse } from "../src/parser/index.js";

const REACT_FIXTURE = path.resolve("tests/fixtures/react-app");

describe("parser", () => {
  it("parses dependency graph from React app", async () => {
    const scanResult = await scan(REACT_FIXTURE);
    const result = await parse(scanResult);

    expect(result.graph.nodes.size).toBeGreaterThan(0);
  });

  it("detects React components", async () => {
    const scanResult = await scan(REACT_FIXTURE);
    const result = await parse(scanResult);

    const componentNames = result.parseResult.components.map((c) => c.name);
    expect(componentNames).toContain("App");
    expect(componentNames).toContain("Header");
  });

  it("extracts hooks usage", async () => {
    const scanResult = await scan(REACT_FIXTURE);
    const result = await parse(scanResult);

    const app = result.parseResult.components.find((c) => c.name === "App");
    expect(app?.hooksUsed).toContain("useAuth");
  });

  it("detects child components", async () => {
    const scanResult = await scan(REACT_FIXTURE);
    const result = await parse(scanResult);

    const app = result.parseResult.components.find((c) => c.name === "App");
    expect(app?.childComponents).toContain("Header");
    expect(app?.childComponents).toContain("UserList");
  });
});
