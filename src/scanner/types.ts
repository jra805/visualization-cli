export type Language =
  | "javascript"
  | "typescript"
  | "python"
  | "go"
  | "java"
  | "kotlin"
  | "rust"
  | "csharp"
  | "php"
  | "ruby";

export interface LanguageInfo {
  language: Language;
  extensions: string[];
  fileCount: number;
  manifestFile?: string;
}

export type FrameworkType =
  | "react"
  | "nextjs"
  | "vue"
  | "nuxt"
  | "angular"
  | "svelte"
  | "sveltekit"
  | "remix"
  | "astro"
  | "solidjs"
  | "express"
  | "nestjs"
  | "fastify"
  | "hono"
  | "electron"
  | "django"
  | "fastapi"
  | "flask"
  | "gin"
  | "echo"
  | "fiber"
  | "chi"
  | "spring-boot"
  | "android"
  | "actix"
  | "axum"
  | "rocket"
  | "aspnet"
  | "blazor"
  | "laravel"
  | "symfony"
  | "rails"
  | "sinatra"
  | "unknown";

export interface ScanResult {
  rootDir: string;
  languages: LanguageInfo[];
  framework: FrameworkType;
  frameworks: FrameworkType[];
  files: string[];
  entryPoints: string[];
  hasTypeScript: boolean;
}
