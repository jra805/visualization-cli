import type { Language } from "../scanner/types.js";

/**
 * Blank out comments and the *contents* of string and regex literals while
 * keeping every newline and column in place. Pattern checks that look for
 * code (eval(, debugger, innerHTML =) run on the masked text so that the same
 * words inside a comment, a docstring or a rule definition don't count.
 *
 * This is a tokenizer-lite, not a parser: it is exact for comments and
 * ordinary strings, and uses the usual "what came before the slash" heuristic
 * for JavaScript regex literals.
 */
export function maskSource(source: string, language?: Language): string {
  const hashComments =
    language === "python" || language === "ruby" || language === "php";
  const slashComments = language !== "python" && language !== "ruby";
  const jsLike = language === "javascript" || language === "typescript";
  const pythonStrings = language === "python";
  const backtickStrings = jsLike || language === "go";

  const out = source.split("");
  const n = source.length;
  let i = 0;
  // Last non-whitespace code character, used to tell a regex from division
  let prevSignificant = "";

  const blank = (from: number, to: number) => {
    for (let k = from; k < to && k < n; k++) {
      if (out[k] !== "\n") out[k] = " ";
    }
  };

  while (i < n) {
    const ch = source[i];
    const next = source[i + 1];

    // Line comments
    if (
      (slashComments && ch === "/" && next === "/") ||
      (hashComments && ch === "#" && !(language === "php" && next === "["))
    ) {
      const end = source.indexOf("\n", i);
      const stop = end === -1 ? n : end;
      blank(i, stop);
      i = stop;
      continue;
    }

    // Block comments
    if (slashComments && ch === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? n : end + 2;
      blank(i, stop);
      i = stop;
      continue;
    }

    // Python triple-quoted strings (docstrings)
    if (pythonStrings && (ch === '"' || ch === "'") && next === ch && source[i + 2] === ch) {
      const delim = ch.repeat(3);
      const end = source.indexOf(delim, i + 3);
      const stop = end === -1 ? n : end + 3;
      blank(i + 3, stop - 3);
      i = stop;
      prevSignificant = ch;
      continue;
    }

    // Ordinary strings: end at the matching quote or, if unterminated, the newline
    if (ch === '"' || ch === "'" || (backtickStrings && ch === "`")) {
      const multiline = ch === "`";
      let j = i + 1;
      while (j < n) {
        const c = source[j];
        if (c === "\\") {
          j += 2;
          continue;
        }
        if (c === ch) break;
        if (c === "\n" && !multiline) break;
        j++;
      }
      blank(i + 1, j);
      i = source[j] === ch ? j + 1 : j;
      prevSignificant = ch;
      continue;
    }

    // JavaScript regex literals
    if (jsLike && ch === "/" && isRegexStart(prevSignificant, source, i)) {
      const end = findRegexEnd(source, i);
      if (end !== -1) {
        blank(i + 1, end);
        i = end + 1;
        while (i < n && /[a-z]/i.test(source[i])) i++; // flags
        prevSignificant = "/";
        continue;
      }
    }

    if (!/\s/.test(ch)) prevSignificant = ch;
    i++;
  }
  return out.join("");
}

const REGEX_PRECEDERS = new Set("(,=:[!&|?{};+-*%<>~^".split(""));
const REGEX_KEYWORDS = /(?:^|[^\w$])(return|typeof|case|do|else|in|of|void|yield|await|delete|throw)\s*$/;

function isRegexStart(prev: string, source: string, i: number): boolean {
  if (prev === "" || REGEX_PRECEDERS.has(prev)) return true;
  const lineStart = source.lastIndexOf("\n", i - 1) + 1;
  return REGEX_KEYWORDS.test(source.slice(lineStart, i));
}

/** Index of the closing slash of a regex literal starting at `start`, or -1. */
function findRegexEnd(source: string, start: number): number {
  let inClass = false;
  for (let j = start + 1; j < source.length; j++) {
    const c = source[j];
    if (c === "\n") return -1;
    if (c === "\\") {
      j++;
      continue;
    }
    if (c === "[") inClass = true;
    else if (c === "]") inClass = false;
    else if (c === "/" && !inClass) return j;
  }
  return -1;
}
