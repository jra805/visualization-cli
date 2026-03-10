import type { Language, LanguageInfo } from "../scanner/types.js";
import type { LanguageParser } from "./language-parser.js";
import { JavaScriptParser } from "./languages/javascript.js";
import { PythonParser } from "./languages/python.js";
import { GoParser } from "./languages/go.js";
import { JavaParser } from "./languages/java.js";
import { RustParser } from "./languages/rust.js";
import { CSharpParser } from "./languages/csharp.js";
import { PhpParser } from "./languages/php.js";
import { RubyParser } from "./languages/ruby.js";

const ALL_PARSERS: LanguageParser[] = [
  new JavaScriptParser(),
  new PythonParser(),
  new GoParser(),
  new JavaParser(),
  new RustParser(),
  new CSharpParser(),
  new PhpParser(),
  new RubyParser(),
];

const parserMap = new Map<Language, LanguageParser>();
for (const p of ALL_PARSERS) {
  parserMap.set(p.language, p);
}
// TypeScript uses the JavaScript parser
parserMap.set("typescript", ALL_PARSERS[0]);
// Kotlin uses the Java parser
parserMap.set("kotlin", ALL_PARSERS[3]);

export function getParsersForLanguages(languages: LanguageInfo[]): LanguageParser[] {
  const seen = new Set<LanguageParser>();
  const result: LanguageParser[] = [];

  for (const lang of languages) {
    const parser = parserMap.get(lang.language);
    if (parser && !seen.has(parser)) {
      seen.add(parser);
      result.push(parser);
    }
  }

  // Default to JS parser if nothing detected
  if (result.length === 0) {
    result.push(ALL_PARSERS[0]);
  }

  return result;
}
