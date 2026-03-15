import fs from "node:fs";
import path from "node:path";

export function ensureGitignore(targetDir: string): void {
  const gitignorePath = path.join(targetDir, ".gitignore");
  const entry = ".codescape/";

  try {
    if (fs.existsSync(gitignorePath)) {
      const content = fs.readFileSync(gitignorePath, "utf-8");
      if (content.includes(entry)) return;
      const newline = content.endsWith("\n") ? "" : "\n";
      fs.appendFileSync(gitignorePath, `${newline}${entry}\n`, "utf-8");
    } else {
      fs.writeFileSync(gitignorePath, `${entry}\n`, "utf-8");
    }
  } catch {
    // Silently ignore gitignore write failures
  }
}
