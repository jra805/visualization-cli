import fs from "node:fs";
import path from "node:path";
import { globby } from "globby";
import type { FrameworkType, LanguageInfo } from "./types.js";

export async function detectFrameworks(
  rootDir: string,
  languages: LanguageInfo[]
): Promise<FrameworkType[]> {
  const frameworks: FrameworkType[] = [];

  // JS/TS frameworks from package.json
  const pkgPath = path.join(rootDir, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

      // Order matters: more specific first
      if (allDeps["next"]) frameworks.push("nextjs");
      if (allDeps["nuxt"] || allDeps["nuxt3"]) frameworks.push("nuxt");
      if (allDeps["@sveltejs/kit"]) frameworks.push("sveltekit");
      if (allDeps["@remix-run/react"] || allDeps["remix"]) frameworks.push("remix");
      if (allDeps["astro"]) frameworks.push("astro");
      if (allDeps["react"] && !frameworks.includes("nextjs") && !frameworks.includes("remix")) frameworks.push("react");
      if (allDeps["vue"] && !frameworks.includes("nuxt")) frameworks.push("vue");
      if (allDeps["@angular/core"]) frameworks.push("angular");
      if (allDeps["svelte"] && !frameworks.includes("sveltekit")) frameworks.push("svelte");
      if (allDeps["solid-js"]) frameworks.push("solidjs");
      if (allDeps["@nestjs/core"]) frameworks.push("nestjs");
      if (allDeps["express"]) frameworks.push("express");
      if (allDeps["fastify"]) frameworks.push("fastify");
      if (allDeps["hono"]) frameworks.push("hono");
      if (allDeps["electron"]) frameworks.push("electron");
    } catch {
      // ignore parse errors
    }
  }

  // Python frameworks
  const pythonLang = languages.find((l) => l.language === "python");
  if (pythonLang) {
    const pythonDeps = await readPythonDeps(rootDir);
    if (pythonDeps.has("django")) frameworks.push("django");
    if (pythonDeps.has("fastapi")) frameworks.push("fastapi");
    if (pythonDeps.has("flask")) frameworks.push("flask");
  }

  // Go frameworks
  const goLang = languages.find((l) => l.language === "go");
  if (goLang) {
    const goModPath = path.join(rootDir, "go.mod");
    if (fs.existsSync(goModPath)) {
      const content = fs.readFileSync(goModPath, "utf-8");
      if (content.includes("gin-gonic/gin")) frameworks.push("gin");
      if (content.includes("labstack/echo")) frameworks.push("echo");
      if (content.includes("gofiber/fiber")) frameworks.push("fiber");
      if (content.includes("go-chi/chi")) frameworks.push("chi");
    }
  }

  // Java/Kotlin frameworks
  const javaLang = languages.find((l) => l.language === "java" || l.language === "kotlin");
  if (javaLang) {
    const hasSpring = await checkJavaFramework(rootDir);
    if (hasSpring) frameworks.push("spring-boot");

    // Check for Android
    if (fs.existsSync(path.join(rootDir, "AndroidManifest.xml")) ||
        fs.existsSync(path.join(rootDir, "app/build.gradle")) ||
        fs.existsSync(path.join(rootDir, "app/build.gradle.kts"))) {
      frameworks.push("android");
    }
  }

  // Rust frameworks
  const rustLang = languages.find((l) => l.language === "rust");
  if (rustLang) {
    const cargoPath = path.join(rootDir, "Cargo.toml");
    if (fs.existsSync(cargoPath)) {
      const content = fs.readFileSync(cargoPath, "utf-8");
      if (content.includes("actix-web")) frameworks.push("actix");
      if (content.includes("axum")) frameworks.push("axum");
      if (content.includes("rocket")) frameworks.push("rocket");
    }
  }

  // C# frameworks
  const csharpLang = languages.find((l) => l.language === "csharp");
  if (csharpLang) {
    try {
      const csprojFiles = await globby("**/*.csproj", {
        cwd: rootDir,
        ignore: ["**/bin/**", "**/obj/**"],
      });
      for (const csproj of csprojFiles) {
        const content = fs.readFileSync(path.join(rootDir, csproj), "utf-8");
        if (content.includes("Microsoft.AspNetCore")) frameworks.push("aspnet");
        if (content.includes("Microsoft.AspNetCore.Components")) frameworks.push("blazor");
        break; // only check first
      }
    } catch {
      // ignore
    }
  }

  // PHP frameworks
  const phpLang = languages.find((l) => l.language === "php");
  if (phpLang) {
    const composerPath = path.join(rootDir, "composer.json");
    if (fs.existsSync(composerPath)) {
      try {
        const composer = JSON.parse(fs.readFileSync(composerPath, "utf-8"));
        const allDeps = { ...composer.require, ...composer["require-dev"] };
        if (allDeps["laravel/framework"]) frameworks.push("laravel");
        if (allDeps["symfony/framework-bundle"]) frameworks.push("symfony");
      } catch {
        // ignore
      }
    }
  }

  // Ruby frameworks
  const rubyLang = languages.find((l) => l.language === "ruby");
  if (rubyLang) {
    const gemfilePath = path.join(rootDir, "Gemfile");
    if (fs.existsSync(gemfilePath)) {
      const content = fs.readFileSync(gemfilePath, "utf-8");
      if (content.includes("'rails'") || content.includes('"rails"')) frameworks.push("rails");
      if (content.includes("'sinatra'") || content.includes('"sinatra"')) frameworks.push("sinatra");
    }
  }

  return frameworks;
}

async function readPythonDeps(rootDir: string): Promise<Set<string>> {
  const deps = new Set<string>();

  // requirements.txt
  const reqPath = path.join(rootDir, "requirements.txt");
  if (fs.existsSync(reqPath)) {
    const content = fs.readFileSync(reqPath, "utf-8");
    for (const line of content.split("\n")) {
      const pkg = line.trim().split(/[=<>!~\[]/)[0].toLowerCase();
      if (pkg) deps.add(pkg);
    }
  }

  // pyproject.toml (simple regex, no TOML parser)
  const pyprojectPath = path.join(rootDir, "pyproject.toml");
  if (fs.existsSync(pyprojectPath)) {
    const content = fs.readFileSync(pyprojectPath, "utf-8");
    const depMatches = content.matchAll(/["']([a-zA-Z0-9_-]+)/g);
    for (const m of depMatches) {
      deps.add(m[1].toLowerCase());
    }
  }

  // Pipfile
  const pipfilePath = path.join(rootDir, "Pipfile");
  if (fs.existsSync(pipfilePath)) {
    const content = fs.readFileSync(pipfilePath, "utf-8");
    const pkgMatches = content.matchAll(/^([a-zA-Z0-9_-]+)\s*=/gm);
    for (const m of pkgMatches) {
      deps.add(m[1].toLowerCase());
    }
  }

  return deps;
}

async function checkJavaFramework(rootDir: string): Promise<boolean> {
  // Check pom.xml
  const pomPath = path.join(rootDir, "pom.xml");
  if (fs.existsSync(pomPath)) {
    const content = fs.readFileSync(pomPath, "utf-8");
    if (content.includes("spring-boot-starter")) return true;
  }

  // Check build.gradle
  for (const name of ["build.gradle", "build.gradle.kts"]) {
    const gradlePath = path.join(rootDir, name);
    if (fs.existsSync(gradlePath)) {
      const content = fs.readFileSync(gradlePath, "utf-8");
      if (content.includes("spring-boot") || content.includes("org.springframework.boot")) return true;
    }
  }

  return false;
}
