/**
 * Generates realistic throwaway git repos for tests and demos.
 *
 * Fixtures are built at test time (not checked in) because the interesting
 * cases — committed node_modules, a committed .env, a nested .git — can't live
 * inside this repository's own tree.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

export function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `codescape-${prefix}-`));
}

function write(root: string, rel: string, content: string | Buffer): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

/** git init + add everything + one commit, independent of global git config. */
export function commitAll(root: string, message = "initial commit"): void {
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: root, stdio: "pipe" });
  if (!fs.existsSync(path.join(root, ".git"))) {
    git("init", "-q");
  }
  git("add", "-A");
  git(
    "-c",
    "user.name=Test Dev",
    "-c",
    "user.email=dev@example.com",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-q",
    "-m",
    message,
  );
}

function repeat(n: number, fn: (i: number) => string): string {
  return Array.from({ length: n }, (_, i) => fn(i)).join("\n");
}

// ── Beginner full-stack JavaScript repo (Express + React) ──────────────────

function bigAppJs(): string {
  return `import React, { useState, useEffect } from 'react';
import './App.css';
import Navbar from './components/Navbar';
import UserList from './components/UserList';
import { fetchUsers } from './api';
import { formatDate } from './utils/helpers';

export const APP_NAME = 'My Awesome App';

function App() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    console.log('fetching users');
    setLoading(true);
    fetch('http://localhost:5000/api/users')
      .then((res) => res.json())
      .then((data) => {
        console.log(data);
        setUsers(data);
        setLoading(false);
      })
      .catch((err) => {
        console.log(err);
        setError(err);
      });
  }, []);

${repeat(
  36,
  (i) => `  function handleAction${i}(item) {
    console.log('action ${i}', item);
    if (!item) {
      return;
    }
    const updated = users.map((u) => (u.id === item.id ? { ...u, flag${i}: true } : u));
    setUsers(updated);
    fetchUsers().then((fresh) => {
      if (fresh.length > 0) {
        setUsers(fresh);
      } else {
        setError('no users after action ${i}');
      }
    });
  }

  const section${i} = (
    <div className="section-${i}">
      <h2>Section ${i}</h2>
      <p>Last updated {formatDate(new Date())}</p>
    </div>
  );
`,
)}

  debugger;

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Something went wrong</p>;

  return (
    <div className="App">
      <Navbar />
      <UserList users={users} />
${repeat(36, (i) => `      {section${i}}`)}
    </div>
  );
}

export default App;
`;
}

function bigServerJs(): string {
  return `const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const userRoutes = require('./routes/users');
const connectDB = require('./config/db');

const app = express();
const JWT_SECRET = "mysecretkey123";

app.use(cors());
app.use(express.json());
connectDB();

app.use('/api/users', userRoutes);

${repeat(
  26,
  (i) => `app.get('/api/items${i}/:id', async (req, res) => {
  console.log('GET item ${i}', req.params.id);
  try {
    const token = req.headers.authorization;
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ msg: 'no user' });
    }
    res.json({ id: req.params.id, owner: user.name, n: ${i} });
  } catch (err) {
    console.log(err);
    res.status(500).send('Server error');
  }
});
`,
)}

app.post('/api/login', async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  const ok = await bcrypt.compare(req.body.password, user.password);
  if (!ok) return res.status(400).json({ msg: 'bad password' });
  res.json({ token: jwt.sign({ id: user._id }, JWT_SECRET) });
});

app.listen(5000, () => console.log('Server running on port 5000'));
`;
}

const USERS_ROUTE = `const express = require('express');
const router = express.Router();
const User = require('../models/User');

router.get('/', async (req, res) => {
  const users = await User.find();
  res.json(users);
});

router.post('/', async (req, res) => {
  const user = new User(req.body);
  await user.save();
  res.json(user);
});

module.exports = router;
`;

const CRA_README = `# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### \`npm start\`

Runs the app in the development mode.
`;

export function createBeginnerNodeRepo(root: string): string {
  write(
    root,
    ".env",
    "MONGO_URI=mongodb+srv://admin:SuperSecret123@cluster0.abcde.mongodb.net/myapp\nJWT_SECRET=mysecretkey123\nPORT=5000\n",
  );
  write(root, ".DS_Store", Buffer.from([0, 0, 0, 1, 66, 117, 100, 49]));
  write(root, "npm-debug.log", "0 info it worked if it ends with ok\n");
  write(
    root,
    "package.json",
    JSON.stringify(
      {
        name: "my-app",
        version: "1.0.0",
        main: "server.js",
        scripts: {
          start: "node server.js",
          dev: "nodemon server.js",
          test: 'echo "Error: no test specified" && exit 1',
        },
        dependencies: {
          bcryptjs: "^2.4.3",
          cors: "^2.8.5",
          dotenv: "^16.0.0",
          express: "^4.18.2",
          jsonwebtoken: "^9.0.0",
          mongoose: "^7.0.0",
          nodemon: "^3.0.1",
          eslint: "^8.40.0",
        },
      },
      null,
      2,
    ),
  );
  write(root, "package-lock.json", '{ "lockfileVersion": 3 }\n');
  write(root, "yarn.lock", "# yarn lockfile v1\n");
  write(
    root,
    "node_modules/express/package.json",
    '{ "name": "express", "version": "4.18.2" }\n',
  );
  write(
    root,
    "node_modules/express/index.js",
    "module.exports = require('./lib/express');\n",
  );
  write(
    root,
    "node_modules/express/lib/express.js",
    "exports = module.exports = function createApplication() {};\n",
  );
  write(
    root,
    "node_modules/lodash/lodash.js",
    repeat(40, (i) => `function fn${i}() { return ${i}; }`),
  );
  write(root, "server.js", bigServerJs());
  write(
    root,
    "server_old.js",
    bigServerJs().split("\n").slice(0, 120).join("\n"),
  );
  write(root, "routes/users.js", USERS_ROUTE);
  write(root, "routes/users copy.js", USERS_ROUTE);
  write(
    root,
    "models/User.js",
    `const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});

module.exports = mongoose.model('user', UserSchema);
`,
  );
  write(
    root,
    "config/db.js",
    `const mongoose = require('mongoose');

const connectDB = async () => {
  await mongoose.connect("mongodb+srv://admin:SuperSecret123@cluster0.abcde.mongodb.net/myapp");
  console.log('MongoDB connected');
};

module.exports = connectDB;
`,
  );
  write(
    root,
    "client/package.json",
    JSON.stringify(
      {
        name: "client",
        private: true,
        dependencies: {
          react: "^18.2.0",
          "react-dom": "^18.2.0",
          "react-scripts": "5.0.1",
        },
        scripts: { start: "react-scripts start", build: "react-scripts build" },
      },
      null,
      2,
    ),
  );
  write(root, "client/README.md", CRA_README);
  write(
    root,
    "client/public/index.html",
    '<!DOCTYPE html><html><body><div id="root"></div></body></html>\n',
  );
  write(
    root,
    "client/src/index.js",
    `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
`,
  );
  write(root, "client/src/App.css", ".App { text-align: center; }\n");
  write(root, "client/src/App.js", bigAppJs());
  write(
    root,
    "client/src/api.js",
    `import { APP_NAME } from './App';

export const API_URL = 'http://localhost:5000/api';

export function fetchUsers() {
  console.log('fetching for', APP_NAME);
  return fetch(API_URL + '/users').then((r) => r.json());
}
`,
  );
  write(
    root,
    "client/src/components/Navbar.js",
    `import React from 'react';

export const NAV_LINKS = ['Home', 'Users', 'About'];

export default function Navbar() {
  return (
    <nav>
      {NAV_LINKS.map((l) => (
        <a key={l} href={'#' + l}>{l}</a>
      ))}
    </nav>
  );
}
`,
  );
  write(
    root,
    "client/src/components/navbar_old.js",
    `import React from 'react';

export default function Navbar() {
  return <nav><a href="#home">Home</a></nav>;
}
`,
  );
  write(
    root,
    "client/src/components/Footer.js",
    `import React from 'react';

export default function Footer() {
  return <footer>(c) 2024 My Awesome App</footer>;
}
`,
  );
  write(
    root,
    "client/src/components/UserList.jsx",
    `import React, { useEffect, useRef } from 'react';

export default function UserList({ users }) {
  const bioRef = useRef(null);
  useEffect(() => {
    if (users.length > 0) {
      bioRef.current.innerHTML = users[0].bio;
    }
  }, [users]);
  return (
    <ul>
      {users.map((u) => (
        <li key={u.id}>{u.name}</li>
      ))}
      <div ref={bioRef} />
    </ul>
  );
}
`,
  );
  write(
    root,
    "client/src/utils/helpers.js",
    `import { NAV_LINKS } from '../components/Navbar';

export function formatDate(d) {
  return d.toLocaleDateString();
}

export function isNavLink(name) {
  return NAV_LINKS.includes(name);
}
`,
  );
  write(
    root,
    "client/build/index.html",
    '<!doctype html><html><head><script defer="defer" src="/static/js/main.8f2a1c.js"></script></head><body><div id="root"></div></body></html>',
  );
  write(
    root,
    "client/build/static/js/main.8f2a1c.js",
    "!function(){var e={};console.log(e)}();\n",
  );
  // A committed 6 MB upload — big binaries don't belong in git.
  const big = Buffer.alloc(6 * 1024 * 1024);
  for (let i = 0; i < big.length; i += 4096) big[i] = i % 251;
  write(root, "uploads/profile-pic.png", big);
  commitAll(root);
  return root;
}

// ── Beginner Flask repo ────────────────────────────────────────────────────

function bigFlaskApp(): string {
  return `from flask import Flask, render_template, request, redirect, session
import sqlite3
import hashlib
from models import *
import helpers

app = Flask(__name__)
app.secret_key = "dev-secret-key-12345"


def get_db():
    conn = sqlite3.connect("database.db")
    conn.row_factory = sqlite3.Row
    return conn


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form["username"]
        password = hashlib.md5(request.form["password"].encode()).hexdigest()
        db = get_db()
        user = db.execute(f"SELECT * FROM users WHERE username = '{username}' AND password = '{password}'").fetchone()
        if user:
            session["user"] = username
            return redirect("/")
        print("login failed for", username)
    return render_template("login.html")

${repeat(
  30,
  (i) => `@app.route("/page${i}")
def page${i}():
    print("visiting page ${i}")
    db = get_db()
    rows = db.execute("SELECT * FROM posts WHERE category = " + str(${i})).fetchall()
    if not rows:
        return render_template("index.html", posts=[])
    posts = [helpers.clean(r) for r in rows]
    return render_template("index.html", posts=posts)
`,
)}

if __name__ == "__main__":
    app.run(debug=True)
`;
}

export function createBeginnerFlaskRepo(root: string): string {
  write(root, "app.py", bigFlaskApp());
  write(root, "app_backup.py", bigFlaskApp().split("\n").slice(0, 60).join("\n"));
  write(
    root,
    "models.py",
    `from app import get_db


class Post:
    def __init__(self, title, body):
        self.title = title
        self.body = body

    def save(self):
        db = get_db()
        db.execute("INSERT INTO posts (title, body) VALUES (?, ?)", (self.title, self.body))
        db.commit()
`,
  );
  write(
    root,
    "helpers.py",
    `def clean(row):
    return {k: row[k] for k in row.keys()}


def slugify(title):
    return title.lower().replace(" ", "-")
`,
  );
  write(
    root,
    "test.py",
    `import helpers

print(helpers.slugify("Hello World"))
`,
  );
  write(root, "templates/index.html", "<h1>My Blog</h1>\n");
  write(root, "templates/login.html", "<form method=post></form>\n");
  write(root, "static/style.css", "body { font-family: sans-serif; }\n");
  write(
    root,
    "venv/lib/python3.11/site-packages/flask/__init__.py",
    "from .app import Flask as Flask\n",
  );
  write(root, "venv/bin/activate", "# This file must be used with source\n");
  write(root, "venv/pyvenv.cfg", "home = /usr/bin\nversion = 3.11.4\n");
  write(
    root,
    "__pycache__/app.cpython-311.pyc",
    Buffer.from([0xa7, 0x0d, 0x0d, 0x0a, 0, 0, 0, 0]),
  );
  write(
    root,
    "__pycache__/models.cpython-311.pyc",
    Buffer.from([0xa7, 0x0d, 0x0d, 0x0a, 0, 0, 0, 1]),
  );
  write(
    root,
    "database.db",
    Buffer.concat([Buffer.from("SQLite format 3\0"), Buffer.alloc(4096)]),
  );
  write(root, ".idea/workspace.xml", '<?xml version="1.0"?><project/>\n');
  commitAll(root);
  return root;
}

// ── Clean control repo: should come out (nearly) spotless ─────────────────

export function createCleanRepo(root: string): string {
  write(root, ".gitignore", "node_modules/\ndist/\n.env\ncoverage/\n");
  write(
    root,
    "README.md",
    "# Task Tracker API\n\nA small REST API for tracking tasks.\n\n## Run\n\n```\nnpm install\nnpm start\n```\n",
  );
  write(root, ".env.example", "PORT=3000\nDATABASE_URL=\n");
  write(
    root,
    "package.json",
    JSON.stringify(
      {
        name: "task-tracker",
        version: "1.0.0",
        type: "module",
        main: "dist/index.js",
        scripts: { build: "tsc", start: "node dist/index.js", test: "vitest run" },
        dependencies: { express: "^4.18.2" },
        devDependencies: { typescript: "^5.4.0", vitest: "^1.6.0" },
      },
      null,
      2,
    ),
  );
  write(root, "package-lock.json", '{ "lockfileVersion": 3 }\n');
  write(
    root,
    "tsconfig.json",
    '{ "compilerOptions": { "outDir": "dist", "strict": true } }\n',
  );
  write(
    root,
    "src/index.ts",
    `import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 3000);
createApp().listen(port);
`,
  );
  write(
    root,
    "src/app.ts",
    `import express from "express";
import { taskRouter } from "./routes/tasks.js";

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/tasks", taskRouter);
  return app;
}
`,
  );
  write(
    root,
    "src/routes/tasks.ts",
    `import { Router } from "express";
import { listTasks, addTask } from "../services/taskService.js";

export const taskRouter = Router();

taskRouter.get("/", (_req, res) => {
  res.json(listTasks());
});

taskRouter.post("/", (req, res) => {
  res.status(201).json(addTask(req.body.title));
});
`,
  );
  write(
    root,
    "src/services/taskService.ts",
    `import type { Task } from "../models/task.js";
import { slugify } from "../utils/format.js";

const tasks: Task[] = [];

export function listTasks(): Task[] {
  return tasks;
}

export function addTask(title: string): Task {
  const task = { id: tasks.length + 1, title, slug: slugify(title), done: false };
  tasks.push(task);
  return task;
}
`,
  );
  write(
    root,
    "src/models/task.ts",
    `export interface Task {
  id: number;
  title: string;
  slug: string;
  done: boolean;
}
`,
  );
  write(
    root,
    "src/utils/format.ts",
    `export function slugify(title: string): string {
  return title.toLowerCase().trim().replace(/\\s+/g, "-");
}
`,
  );
  write(
    root,
    "tests/taskService.test.ts",
    `import { describe, it, expect } from "vitest";
import { addTask, listTasks } from "../src/services/taskService.js";

describe("taskService", () => {
  it("adds tasks", () => {
    addTask("Write tests");
    expect(listTasks()).toHaveLength(1);
  });
});
`,
  );
  write(
    root,
    "tests/format.test.ts",
    `import { describe, it, expect } from "vitest";
import { slugify } from "../src/utils/format.js";

describe("slugify", () => {
  it("dashes spaces", () => {
    expect(slugify("A B")).toBe("a-b");
  });
});
`,
  );
  commitAll(root);
  return root;
}
