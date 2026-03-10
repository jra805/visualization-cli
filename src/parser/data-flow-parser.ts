import { Project, SyntaxKind, type Node } from "ts-morph";
import type { ComponentDataFlow, DataSource } from "./types.js";

export function parseDataFlows(files: string[], rootDir: string): ComponentDataFlow[] {
  const project = new Project({
    tsConfigFilePath: `${rootDir}/tsconfig.json`,
    skipAddingFilesFromTsConfig: true,
  });

  for (const file of files) {
    if (file.endsWith(".tsx") || file.endsWith(".jsx")) {
      try {
        project.addSourceFileAtPath(file);
      } catch {
        // skip
      }
    }
  }

  const flows: ComponentDataFlow[] = [];

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath().replace(rootDir + "/", "").replace(/\\/g, "/");

    // Check function declarations
    for (const func of sourceFile.getFunctions()) {
      const name = func.getName();
      if (!name || !/^[A-Z]/.test(name)) continue;
      const dataSources = extractDataSources(func);
      if (dataSources.length > 0) {
        flows.push({ componentName: name, filePath, dataSources });
      }
    }

    // Check variable declarations (arrow functions)
    for (const varDecl of sourceFile.getVariableDeclarations()) {
      const name = varDecl.getName();
      if (!/^[A-Z]/.test(name)) continue;
      const init = varDecl.getInitializer();
      if (!init) continue;
      const dataSources = extractDataSources(init);
      if (dataSources.length > 0) {
        flows.push({ componentName: name, filePath, dataSources });
      }
    }
  }

  return flows;
}

function extractDataSources(node: Node): DataSource[] {
  const sources: DataSource[] = [];
  const calls = node.getDescendantsOfKind(SyntaxKind.CallExpression);

  for (const call of calls) {
    const text = call.getExpression().getText();

    // useContext
    if (text === "useContext") {
      const arg = call.getArguments()[0]?.getText() ?? "unknown";
      sources.push({ type: "context", name: arg, detail: `useContext(${arg})` });
    }

    // useState
    if (text === "useState") {
      const parent = call.getParent();
      const detail = parent?.getText().slice(0, 60) ?? "useState(...)";
      sources.push({ type: "local-state", name: "useState", detail });
    }

    // useReducer
    if (text === "useReducer") {
      const arg = call.getArguments()[0]?.getText() ?? "unknown";
      sources.push({ type: "local-state", name: "useReducer", detail: `useReducer(${arg})` });
    }

    // Redux hooks
    if (text === "useSelector" || text === "useAppSelector") {
      sources.push({ type: "store", name: "redux", detail: text });
    }
    if (text === "useDispatch" || text === "useAppDispatch") {
      sources.push({ type: "store", name: "redux-dispatch", detail: text });
    }

    // Zustand
    if (text.match(/^use\w+Store$/)) {
      sources.push({ type: "store", name: text, detail: `${text}()` });
    }

    // API calls
    if (text === "fetch" || text === "axios.get" || text === "axios.post") {
      const arg = call.getArguments()[0]?.getText() ?? "unknown";
      sources.push({ type: "api", name: "fetch", detail: `${text}(${arg})` });
    }

    // React Query / SWR
    if (text === "useQuery" || text === "useSWR" || text === "useMutation") {
      const arg = call.getArguments()[0]?.getText() ?? "unknown";
      sources.push({ type: "api", name: text, detail: `${text}(${arg})` });
    }
  }

  // Props detection (function parameter)
  const params = node.getDescendantsOfKind(SyntaxKind.Parameter);
  if (params.length > 0) {
    const firstParam = params[0];
    const paramText = firstParam.getText();
    if (paramText.includes("{") || firstParam.getType()?.getText().includes("Props")) {
      sources.push({ type: "props", name: "props", detail: paramText.slice(0, 60) });
    }
  }

  return sources;
}
