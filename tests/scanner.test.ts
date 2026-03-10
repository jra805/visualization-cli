import { describe, it, expect } from "vitest";
import path from "node:path";
import { scan } from "../src/scanner/index.js";

const REACT_FIXTURE = path.resolve("tests/fixtures/react-app");
const NEXTJS_FIXTURE = path.resolve("tests/fixtures/nextjs-app");

describe("scanner", () => {
  it("detects React framework", async () => {
    const result = await scan(REACT_FIXTURE);
    expect(result.framework).toBe("react");
  });

  it("detects Next.js framework", async () => {
    const result = await scan(NEXTJS_FIXTURE);
    expect(result.framework).toBe("nextjs");
  });

  it("finds source files in React app", async () => {
    const result = await scan(REACT_FIXTURE);
    expect(result.files.length).toBeGreaterThan(0);
    expect(result.files.some((f) => f.includes("App.tsx"))).toBe(true);
  });

  it("detects TypeScript", async () => {
    const result = await scan(REACT_FIXTURE);
    expect(result.hasTypeScript).toBe(true);
  });

  it("finds entry points in Next.js app", async () => {
    const result = await scan(NEXTJS_FIXTURE);
    expect(result.entryPoints.some((f) => f.includes("page.tsx"))).toBe(true);
  });

  it("throws for non-existent directory", async () => {
    await expect(scan("/nonexistent/path")).rejects.toThrow();
  });
});
