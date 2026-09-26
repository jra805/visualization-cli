import type { IssueType, Severity } from "./types.js";

export type IssueCategory =
  | "security"
  | "hygiene"
  | "structure"
  | "habits"
  | "history";

export interface IssueDescription {
  title: string;
  /** Why it matters, in plain English for someone new to programming. */
  explanation: string;
  /** One-line fix summary. */
  suggestion: string;
  /** Concrete steps or commands, shown as a checklist. */
  steps?: string[];
  category: IssueCategory;
  /** How the problem shows up in the city view. */
  city: { name: string; look: string };
}

export const SEVERITY_LABELS: Record<Severity, string> = {
  error: "Fix now",
  warning: "Should fix",
  info: "Nice to fix",
};

const descriptions: Record<IssueType, IssueDescription> = {
  // ── Structure ────────────────────────────────────────────────────────────
  "circular-dependency": {
    title: "Circular Import",
    explanation:
      "These files import each other in a loop (A needs B, B needs A). Whichever loads first sees the other half-built — a classic source of 'undefined' errors, and in Python an ImportError crash.",
    suggestion:
      "Break the loop: move the shared piece into a third file that both can import.",
    steps: [
      "Find what each file needs from the other (a constant, helper or type).",
      "Move that shared code into a new file.",
      "Import it from the new file in both places instead of from each other.",
    ],
    category: "structure",
    city: {
      name: "Traffic loop",
      look: "Red cars circling between the buildings, never getting anywhere.",
    },
  },
  "orphan-module": {
    title: "Unused File",
    explanation:
      "Nothing in the project imports this file, and it doesn't look like something you run directly. It's probably dead code that everyone still has to read around.",
    suggestion:
      "Delete it if it's no longer needed — git keeps the history if you ever want it back.",
    steps: [
      "Search the project for the file name to make sure nothing loads it another way.",
      "If it really is unused: git rm <file> && git commit -m \"Remove unused file\"",
    ],
    category: "structure",
    city: {
      name: "Abandoned building",
      look: "A boarded-up grey building nobody visits.",
    },
  },
  "god-module": {
    title: "Oversized File",
    explanation:
      "This file is huge. Big files are hard to read, hard to test and turn every change into a merge conflict — it usually means one file is doing several jobs.",
    suggestion:
      "Split it by responsibility: move each component, route group or helper set into its own file.",
    steps: [
      "List the separate jobs this file does (e.g. routes, database access, validation, UI sections).",
      "Move each job into its own file and import it back.",
      "Aim for files under ~300 lines that each do one thing.",
    ],
    category: "structure",
    city: {
      name: "Overloaded skyscraper",
      look: "A tower looming over its block with a crane on top.",
    },
  },
  "high-coupling": {
    title: "Traffic Hub",
    explanation:
      "Many files depend on this one AND it depends on many others, so any change here ripples through the whole project.",
    suggestion:
      "Split it so each piece has fewer connections, or put a small, stable interface in front of it.",
    category: "structure",
    city: {
      name: "Gridlock junction",
      look: "Cars queued up around a jammed building.",
    },
  },
  "prop-drilling": {
    title: "Prop Drilling",
    explanation:
      "The same prop is passed down through several components that don't use it, just so it can reach one that does.",
    suggestion:
      "Use React context or a state library for data many components need, or restructure the component tree.",
    category: "structure",
    city: {
      name: "Bucket brigade",
      look: "A value handed from building to building to reach its destination.",
    },
  },
  "layering-violation": {
    title: "Zoning Violation",
    explanation:
      "A low-level file (a helper, model or service) imports UI code. Dependencies should flow from the UI toward helpers and data — otherwise your 'helpers' can't be reused without dragging the UI along.",
    suggestion:
      "Move what the low-level file needs (a constant, type or function) out of the UI file into a shared module.",
    category: "structure",
    city: {
      name: "Zoning violation",
      look: "An orange 'wrong way' route from a back-office building into a shop.",
    },
  },

  // ── History ──────────────────────────────────────────────────────────────
  hotspot: {
    title: "Hotspot",
    explanation:
      "This file is complex AND changes constantly. Files like this are where most bugs are born.",
    suggestion:
      "Put tests around it first, then simplify: break up long functions and flatten deep nesting.",
    category: "history",
    city: { name: "Fire hazard", look: "Flames flickering on the roof." },
  },
  "temporal-coupling": {
    title: "Hidden Coupling",
    explanation:
      "These files always change together but don't import each other — they may share an implicit dependency.",
    suggestion:
      "Make the dependency explicit, or extract the shared concern into its own module.",
    category: "history",
    city: { name: "Secret tunnel", look: "An underground link between buildings." },
  },
  "bus-factor": {
    title: "Single Maintainer",
    explanation:
      "Only one person has been changing this file. If they leave, the knowledge leaves with them.",
    suggestion:
      "Have another team member review or pair on changes to this area.",
    category: "history",
    city: { name: "One-person shop", look: "A single lit window." },
  },
  "stale-code": {
    title: "Stale Code",
    explanation:
      "This file hasn't been touched in a long time — it may be outdated or dead.",
    suggestion:
      "Review whether it's still needed and whether it follows current patterns.",
    category: "history",
    city: { name: "Dusty building", look: "Faded paint and cobwebs." },
  },

  // ── Security ─────────────────────────────────────────────────────────────
  "security-secret": {
    title: "Hardcoded Secret",
    explanation:
      "A password, API key or token is written directly in the code. Anyone who can see the repo can use it — and bots scan public GitHub repos for leaked keys within minutes.",
    suggestion:
      "Move it to an environment variable and rotate (replace) the key: assume the old one is compromised.",
    steps: [
      "Revoke or rotate the key in the provider's dashboard — it's already exposed.",
      "Put the new value in a .env file that is listed in .gitignore.",
      "Read it in code: process.env.MY_KEY (Node) or os.environ[\"MY_KEY\"] (Python).",
      "Commit a .env.example with the variable names but no values.",
    ],
    category: "security",
    city: {
      name: "Open vault",
      look: "A flashing key over the building — the vault door is wide open.",
    },
  },
  "security-injection": {
    title: "Injection Risk",
    explanation:
      "Text that may come from a user is pasted into a SQL query, a shell command or eval(). Crafted input can then run the attacker's own commands — the classic way web apps get hacked.",
    suggestion:
      "Use parameterized queries (placeholders like ? or %s) and never pass user input to eval, exec or a shell.",
    steps: [
      "SQL: pass values separately — db.execute(\"SELECT * FROM users WHERE id = ?\", (user_id,)) instead of building the string.",
      "Shell: pass arguments as a list — execFile / subprocess.run([...]) — instead of one command string.",
      "Replace eval() with JSON.parse / json.loads or an explicit lookup table.",
    ],
    category: "security",
    city: { name: "Broken lock", look: "A police siren flashing on the roof." },
  },
  "security-xss": {
    title: "Cross-Site Scripting Risk",
    explanation:
      "HTML is built from data that could come from users. If that data contains a <script> tag, it runs in every visitor's browser.",
    suggestion:
      "Set text with textContent (or let React/Vue render it) instead of innerHTML; sanitize with DOMPurify if you truly need HTML.",
    category: "security",
    city: { name: "Broken windows", look: "Smashed windows anyone can climb through." },
  },
  "security-crypto": {
    title: "Weak Password Hashing",
    explanation:
      "Passwords are hashed with MD5 or SHA-1. These are so fast that stolen hashes can be cracked billions of times per second.",
    suggestion: "Use a real password hashing library: bcrypt, argon2 or scrypt.",
    category: "security",
    city: { name: "Cardboard safe", look: "A safe that folds like paper." },
  },

  // ── Repo hygiene ─────────────────────────────────────────────────────────
  "committed-dependencies": {
    title: "Committed Dependencies",
    explanation:
      "Downloaded libraries (like node_modules or a Python virtualenv) are committed to git. They're huge, machine-specific and can be reinstalled from your package file in seconds — committing them bloats the repo forever.",
    suggestion:
      "Remove them from git (not from your disk) and add the folder to .gitignore.",
    category: "hygiene",
    city: { name: "Landfill", look: "A garbage dump on the edge of town." },
  },
  "committed-build-output": {
    title: "Committed Build Output",
    explanation:
      "Generated files (compiled code, bundles, caches) are committed. They're rebuilt from your source every time, so they only cause noisy diffs and merge conflicts.",
    suggestion: "Stop tracking them and add the folder to .gitignore.",
    category: "hygiene",
    city: { name: "Rubble heap", look: "Construction rubble dumped at the city limits." },
  },
  "committed-env-file": {
    title: "Committed .env File",
    explanation:
      ".env files hold your secrets (database passwords, API keys). This one is in git history, so anyone with the repo has them — even if you delete the file later.",
    suggestion:
      "Stop tracking it, add .env to .gitignore and rotate every secret it contained.",
    category: "security",
    city: { name: "Keys under the doormat", look: "A key left on the City Hall steps." },
  },
  "committed-secret-file": {
    title: "Committed Credentials File",
    explanation:
      "A private key or credentials file (like a service-account JSON or .pem key) is in git. Whoever has it can act as you or your app.",
    suggestion:
      "Remove it from git, revoke it with the provider and load credentials from outside the repo.",
    category: "security",
    city: { name: "Master key on display", look: "A giant key hanging over the lot." },
  },
  "committed-junk": {
    title: "Junk Files",
    explanation:
      "OS and editor clutter (.DS_Store, Thumbs.db, .idea/, log files) is committed. It's noise for everyone who clones the repo.",
    suggestion: "Remove them from git and add them to .gitignore.",
    category: "hygiene",
    city: { name: "Litter", look: "Trash blowing through the streets." },
  },
  "committed-database": {
    title: "Committed Database",
    explanation:
      "A database file (like SQLite's .db or .sqlite3) is committed. It can contain real user data and password hashes, and it changes whenever the app runs — guaranteed conflicts.",
    suggestion:
      "Stop tracking it; commit a schema, migration or seed script instead so others can create their own.",
    category: "hygiene",
    city: { name: "Leaky warehouse", look: "Crates of records stacked outside." },
  },
  "large-file": {
    title: "Large File",
    explanation:
      "A big file (over 5 MB) is committed. Git keeps every version forever, so the repo stays slow to clone for everyone — even after you delete it.",
    suggestion:
      "Keep big media and datasets outside git (cloud storage), or use Git LFS.",
    category: "hygiene",
    city: { name: "Shipping containers", look: "Oversized containers blocking a lot." },
  },
  "missing-gitignore": {
    title: "No .gitignore",
    explanation:
      "There's no .gitignore, so git will happily commit dependencies, build output, secrets and OS junk.",
    suggestion:
      "Add a .gitignore for your language — github.com/github/gitignore has good templates.",
    category: "hygiene",
    city: { name: "No garbage service", look: "Overflowing bins outside City Hall." },
  },
  "gitignore-gap": {
    title: ".gitignore Gap",
    explanation:
      "Your .gitignore doesn't cover something this project generates, so it's one `git add .` away from being committed.",
    suggestion: "Add the missing entries to .gitignore.",
    category: "hygiene",
    city: { name: "Hole in the fence", look: "A gap where junk can blow in." },
  },
  "missing-readme": {
    title: "No README",
    explanation:
      "There's no README, so visitors — teammates, recruiters, future you — can't tell what this project is or how to run it.",
    suggestion:
      "Add a README.md: what it does, how to install it, how to run it, and a screenshot.",
    category: "hygiene",
    city: { name: "Blank welcome sign", look: "The sign at the city gate is empty." },
  },
  "template-readme": {
    title: "Template README",
    explanation:
      "The README is still the one generated by your project template (e.g. Create React App or Vite). It describes the template, not your project.",
    suggestion:
      "Replace it with your project's own description, setup steps and a screenshot.",
    category: "hygiene",
    city: { name: "Generic welcome sign", look: "The gate sign still says 'Your Town Here'." },
  },
  "no-tests": {
    title: "No Tests",
    explanation:
      "There are no automated tests. Tests let you change code without breaking what already works — and employers look for them.",
    suggestion:
      "Start small: add a test runner (Vitest or Jest for JavaScript, pytest for Python) and test one important function.",
    category: "hygiene",
    city: { name: "No fire station", look: "Nobody to call when something breaks." },
  },
  "multiple-lockfiles": {
    title: "Mixed Package Managers",
    explanation:
      "There are lockfiles from more than one package manager (e.g. package-lock.json and yarn.lock). They drift apart, so teammates end up installing different versions.",
    suggestion:
      "Pick one package manager, delete the other lockfile and stick to it.",
    category: "hygiene",
    city: { name: "Two sets of blueprints", look: "Builders arguing over plans." },
  },
  "missing-lockfile": {
    title: "No Lockfile",
    explanation:
      "package.json lists dependencies but no lockfile is committed, so every install may pull different versions — hello, 'works on my machine'.",
    suggestion:
      "Run your package manager's install and commit the lockfile it creates.",
    category: "hygiene",
    city: { name: "Unsigned blueprints", look: "Plans nobody agreed on." },
  },
  "dev-deps-in-deps": {
    title: "Dev Tools in Dependencies",
    explanation:
      "Development-only tools (like nodemon, eslint or jest) are listed as regular dependencies, so they get installed in production too.",
    suggestion:
      "Move them to devDependencies: npm install --save-dev <package>.",
    category: "hygiene",
    city: { name: "Scaffolding left up", look: "Builders' tools left on a finished street." },
  },
  "missing-python-requirements": {
    title: "No Dependency List",
    explanation:
      "This Python project imports third-party packages but has no requirements.txt or pyproject.toml, so nobody else can install what it needs.",
    suggestion:
      "Create one: pip freeze > requirements.txt (inside your virtualenv), or list packages in pyproject.toml.",
    category: "hygiene",
    city: { name: "Missing supply list", look: "Deliveries with no order form." },
  },
  "root-clutter": {
    title: "Cluttered Root Folder",
    explanation:
      "Lots of source files sit directly in the top folder. Without folders it's hard to see what belongs together as the project grows.",
    suggestion:
      "Group files into folders by feature or role (e.g. routes/, models/, components/).",
    category: "structure",
    city: { name: "Urban sprawl", look: "Buildings dumped in one giant lot with no streets." },
  },
  "no-git": {
    title: "No Version Control",
    explanation:
      "This folder isn't a git repository. Without version control there's no history, no undo and no easy way to collaborate.",
    suggestion: "Run git init, then commit early and often.",
    category: "hygiene",
    city: { name: "No city records", look: "The city archive is empty." },
  },

  // ── Code habits ──────────────────────────────────────────────────────────
  "backup-file": {
    title: "Backup Copy",
    explanation:
      "This looks like a manual backup of another file (like app_old.js or 'server copy.js'). Git already remembers every version, so copies just confuse readers about which one is real.",
    suggestion:
      "Delete the copy — you can always get old versions back with git log and git checkout.",
    category: "habits",
    city: { name: "Ghost building", look: "A faded, see-through twin of a real building." },
  },
  "duplicate-file": {
    title: "Duplicate File",
    explanation:
      "These files have identical content. When you fix a bug in one, the copy keeps the bug.",
    suggestion: "Keep one copy and import it wherever it's needed.",
    category: "habits",
    city: { name: "Cloned buildings", look: "Identical twins linked by a dotted line." },
  },
  "debugger-statement": {
    title: "Leftover debugger",
    explanation:
      "A `debugger` statement is left in the code. It freezes the app whenever someone has developer tools open.",
    suggestion:
      "Remove it — and turn on ESLint's no-debugger rule so it can't sneak back in.",
    category: "habits",
    city: { name: "Roadblock", look: "A barrier across the building's entrance." },
  },
  "debug-logging": {
    title: "Leftover Debug Logs",
    explanation:
      "This UI file has several console.log calls. They clutter every visitor's browser console and can leak data.",
    suggestion:
      "Remove debug logs before committing, or use a logger you can switch off in production.",
    category: "habits",
    city: { name: "Graffiti", look: "Scribbles sprayed on the walls." },
  },
  "localhost-url": {
    title: "Hardcoded localhost",
    explanation:
      "The frontend calls a server at localhost. That only works on your machine — once deployed, every visitor's browser tries to reach their own computer.",
    suggestion:
      "Read the API address from configuration, e.g. import.meta.env.VITE_API_URL or process.env.REACT_APP_API_URL.",
    category: "habits",
    city: { name: "Road to nowhere", look: "A street sign pointing at your own house." },
  },
  "star-import": {
    title: "Wildcard Import",
    explanation:
      "`from module import *` dumps every name into this file, hiding where things come from and silently overwriting names.",
    suggestion:
      "Import what you use explicitly: from module import thing_a, thing_b.",
    category: "habits",
    city: { name: "Unlabeled deliveries", look: "Boxes with no shipping label." },
  },
  "debug-mode": {
    title: "Debug Mode On",
    explanation:
      "Debug mode is switched on in code. If this gets deployed, error pages reveal your code and settings — and Flask's debugger lets anyone run Python on your server.",
    suggestion:
      "Control debug mode with an environment variable and make sure it's off in production.",
    category: "security",
    city: { name: "Open back door", look: "The staff entrance is propped open." },
  },
};

export function getIssueDescription(type: IssueType): IssueDescription {
  return descriptions[type];
}

export function getAllIssueDescriptions(): Record<IssueType, IssueDescription> {
  return descriptions;
}
