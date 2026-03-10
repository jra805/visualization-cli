import { globby } from "globby";
import fs from "node:fs";
import path from "node:path";
import type { Language, LanguageInfo } from "./types.js";

interface LanguageConfig {
  language: Language;
  extensions: string[];
  manifests: string[];
}

const LANGUAGE_CONFIGS: LanguageConfig[] = [
  {
    language: "typescript",
    extensions: [".ts", ".tsx"],
    manifests: ["tsconfig.json"],
  },
  {
    language: "javascript",
    extensions: [".js", ".jsx", ".mjs", ".cjs"],
    manifests: ["package.json"],
  },
  {
    language: "python",
    extensions: [".py"],
    manifests: ["requirements.txt", "pyproject.toml", "Pipfile", "setup.py"],
  },
  {
    language: "go",
    extensions: [".go"],
    manifests: ["go.mod"],
  },
  {
    language: "java",
    extensions: [".java"],
    manifests: ["pom.xml", "build.gradle", "build.gradle.kts"],
  },
  {
    language: "kotlin",
    extensions: [".kt", ".kts"],
    manifests: ["build.gradle.kts", "build.gradle"],
  },
  {
    language: "rust",
    extensions: [".rs"],
    manifests: ["Cargo.toml"],
  },
  {
    language: "csharp",
    extensions: [".cs"],
    manifests: [], // *.csproj handled separately
  },
  {
    language: "php",
    extensions: [".php"],
    manifests: ["composer.json"],
  },
  {
    language: "ruby",
    extensions: [".rb"],
    manifests: ["Gemfile"],
  },
];

export async function detectLanguages(rootDir: string): Promise<LanguageInfo[]> {
  const results: LanguageInfo[] = [];

  for (const config of LANGUAGE_CONFIGS) {
    // Check for manifest files
    let manifestFile: string | undefined;
    for (const manifest of config.manifests) {
      if (fs.existsSync(path.join(rootDir, manifest))) {
        manifestFile = manifest;
        break;
      }
    }

    // Special case: C# uses *.csproj
    if (config.language === "csharp" && !manifestFile) {
      try {
        const csprojFiles = await globby("*.csproj", { cwd: rootDir });
        if (csprojFiles.length > 0) {
          manifestFile = csprojFiles[0];
        }
      } catch {
        // ignore
      }
    }

    // Count files with matching extensions
    const globs = config.extensions.map((ext) => `**/*${ext}`);
    let fileCount = 0;
    try {
      const files = await globby(globs, {
        cwd: rootDir,
        ignore: [
          "**/node_modules/**",
          "**/vendor/**",
          "**/target/**",
          "**/.git/**",
          "**/dist/**",
          "**/build/**",
          "**/venv/**",
          "**/.venv/**",
          "**/env/**",
          "**/__pycache__/**",
          "**/bin/Debug/**",
          "**/bin/Release/**",
          "**/obj/**",
        ],
        gitignore: true,
      });
      fileCount = files.length;
    } catch {
      // ignore
    }

    if (fileCount > 0 || manifestFile) {
      results.push({
        language: config.language,
        extensions: config.extensions,
        fileCount,
        manifestFile,
      });
    }
  }

  // If both JS and TS are present, keep both but TS takes priority in sorting
  results.sort((a, b) => b.fileCount - a.fileCount);

  return results;
}

/** Get the language for a file based on extension */
export function getFileLanguage(filePath: string): Language | undefined {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, Language> = {
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".py": "python",
    ".go": "go",
    ".java": "java",
    ".kt": "kotlin",
    ".kts": "kotlin",
    ".rs": "rust",
    ".cs": "csharp",
    ".php": "php",
    ".rb": "ruby",
  };
  return map[ext];
}
