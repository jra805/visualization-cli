import type { IssueType } from "./types.js";

export interface IssueDescription {
  title: string;
  explanation: string;
  suggestion: string;
}

const descriptions: Record<IssueType, IssueDescription> = {
  "circular-dependency": {
    title: "Circular Dependency",
    explanation:
      "These files import each other in a loop, which can cause initialization bugs and makes code harder to change.",
    suggestion:
      "Extract shared code into a separate file that both can import.",
  },
  "orphan-module": {
    title: "Unused Module",
    explanation:
      "This file isn't connected to anything — nothing imports it and it imports nothing.",
    suggestion: "Import it where needed, or remove it if it's dead code.",
  },
  "god-module": {
    title: "Oversized Module",
    explanation:
      "This file does too much — it has many connections or is very large, making it a bottleneck for changes.",
    suggestion:
      "Split it into smaller, focused files with clear responsibilities.",
  },
  "high-coupling": {
    title: "High Coupling",
    explanation:
      "This file depends on (or is depended on by) many others, making changes risky.",
    suggestion:
      "Introduce an interface or facade to reduce the number of direct connections.",
  },
  "prop-drilling": {
    title: "Prop Drilling",
    explanation:
      "Data is being passed through many component layers just to reach where it's actually used.",
    suggestion:
      "Use React Context, a state manager, or restructure your component tree.",
  },
  "layering-violation": {
    title: "Layer Violation",
    explanation:
      "A lower-level module imports from a higher-level one, breaking the architecture's dependency direction.",
    suggestion: "Invert the dependency or move shared code to a common layer.",
  },
  hotspot: {
    title: "Change Hotspot",
    explanation:
      "This file is both complex (many branches) and frequently changed — a common source of bugs.",
    suggestion: "Simplify the logic or break it into smaller functions.",
  },
  "temporal-coupling": {
    title: "Hidden Coupling",
    explanation:
      "These files always change together but don't import each other — they may share an implicit dependency.",
    suggestion:
      "Make the dependency explicit, or extract the shared concern into its own module.",
  },
  "bus-factor": {
    title: "Single Maintainer",
    explanation:
      "Only one person has been contributing to this file recently. If they leave, knowledge is lost.",
    suggestion:
      "Have another team member review or pair on changes to this area.",
  },
  "stale-code": {
    title: "Stale Code",
    explanation:
      "This file hasn't been touched in a long time — it may be outdated or dead.",
    suggestion:
      "Review if it's still needed and whether it follows current patterns.",
  },
  "security-secret": {
    title: "Hardcoded Secret",
    explanation:
      "This file appears to contain a hardcoded password, API key, or token that could be exposed.",
    suggestion:
      "Move secrets to environment variables or a secrets manager. Never commit credentials.",
  },
  "security-injection": {
    title: "Injection Risk",
    explanation:
      "User input may reach a dangerous function (eval, exec, SQL query) without sanitization.",
    suggestion:
      "Use parameterized queries for SQL, avoid eval(), and sanitize all user input.",
  },
  "security-xss": {
    title: "Cross-Site Scripting Risk",
    explanation:
      "Untrusted data may be inserted into HTML without escaping, allowing script injection.",
    suggestion:
      "Use a framework's built-in escaping, or sanitize with a library like DOMPurify.",
  },
  "security-crypto": {
    title: "Weak Cryptography",
    explanation:
      "This file uses a weak hashing algorithm (MD5 or SHA1) that is no longer considered secure.",
    suggestion: "Use SHA-256 or stronger. For passwords, use bcrypt or argon2.",
  },
};

export function getIssueDescription(type: IssueType): IssueDescription {
  return descriptions[type];
}

export function getAllIssueDescriptions(): Record<IssueType, IssueDescription> {
  return descriptions;
}
