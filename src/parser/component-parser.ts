import { Project, SyntaxKind, type SourceFile, type Node } from "ts-morph";
import type { ComponentInfo, PropInfo } from "./types.js";

export function parseComponents(files: string[], rootDir: string): ComponentInfo[] {
  const project = new Project({
    tsConfigFilePath: `${rootDir}/tsconfig.json`,
    skipAddingFilesFromTsConfig: true,
  });

  for (const file of files) {
    if (file.endsWith(".tsx") || file.endsWith(".jsx")) {
      try {
        project.addSourceFileAtPath(file);
      } catch {
        // skip files that can't be parsed
      }
    }
  }

  const components: ComponentInfo[] = [];

  // Normalize rootDir for path comparison (ts-morph always returns forward slashes)
  const normalizedRoot = rootDir.split("\\").join("/").replace(/\/$/, "");

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath().replace(/\\/g, "/");
    const relPath = filePath.startsWith(normalizedRoot + "/")
      ? filePath.slice(normalizedRoot.length + 1)
      : filePath.replace(rootDir + "/", "").replace(/\\/g, "/");

    // Find function declarations that return JSX
    for (const func of sourceFile.getFunctions()) {
      const name = func.getName();
      if (name && isComponentName(name) && hasJsxReturn(func)) {
        components.push(extractComponentInfo(name, relPath, func, sourceFile));
      }
    }

    // Find arrow function variable declarations
    for (const varDecl of sourceFile.getVariableDeclarations()) {
      const name = varDecl.getName();
      const init = varDecl.getInitializer();
      if (name && isComponentName(name) && init && hasJsxReturn(init)) {
        components.push(extractComponentInfo(name, relPath, init, sourceFile));
      }
    }

    // Find default exports
    const defaultExport = sourceFile.getDefaultExportSymbol();
    if (defaultExport) {
      const existing = components.find((c) => c.filePath === relPath);
      if (existing) {
        existing.isDefaultExport = true;
      }
    }
  }

  return components;
}

function isComponentName(name: string): boolean {
  return /^[A-Z]/.test(name);
}

function hasJsxReturn(node: Node): boolean {
  return (
    node.getDescendantsOfKind(SyntaxKind.JsxElement).length > 0 ||
    node.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement).length > 0 ||
    node.getDescendantsOfKind(SyntaxKind.JsxFragment).length > 0
  );
}

function extractComponentInfo(
  name: string,
  filePath: string,
  node: Node,
  sourceFile: SourceFile
): ComponentInfo {
  const hooksUsed = extractHooks(node);
  const childComponents = extractChildComponents(node);
  const props = extractProps(name, sourceFile);

  return {
    name,
    filePath,
    props,
    hooksUsed,
    childComponents,
    isDefaultExport: false,
  };
}

function extractHooks(node: Node): string[] {
  const hooks = new Set<string>();
  const calls = node.getDescendantsOfKind(SyntaxKind.CallExpression);

  for (const call of calls) {
    const expr = call.getExpression();
    const text = expr.getText();
    if (text.startsWith("use") && /^use[A-Z]/.test(text)) {
      hooks.add(text);
    }
  }

  return [...hooks];
}

function extractChildComponents(node: Node): string[] {
  const children = new Set<string>();

  const jsxElements = [
    ...node.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
    ...node.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
  ];

  for (const jsx of jsxElements) {
    const tagName = jsx.getChildAtIndex(1)?.getText() ?? jsx.getFirstChildByKind(SyntaxKind.Identifier)?.getText();
    if (tagName && /^[A-Z]/.test(tagName)) {
      children.add(tagName);
    }
  }

  return [...children];
}

function extractProps(componentName: string, sourceFile: SourceFile): PropInfo[] {
  const props: PropInfo[] = [];

  // Look for interface/type named {Component}Props
  const propsTypeName = `${componentName}Props`;

  for (const iface of sourceFile.getInterfaces()) {
    if (iface.getName() === propsTypeName) {
      for (const prop of iface.getProperties()) {
        props.push({
          name: prop.getName(),
          type: prop.getType().getText(),
          isRequired: !prop.hasQuestionToken(),
        });
      }
    }
  }

  for (const typeAlias of sourceFile.getTypeAliases()) {
    if (typeAlias.getName() === propsTypeName) {
      const type = typeAlias.getType();
      for (const prop of type.getProperties()) {
        const decl = prop.getDeclarations()[0];
        props.push({
          name: prop.getName(),
          type: prop.getTypeAtLocation(sourceFile).getText(),
          isRequired: decl ? !decl.getText().includes("?:") : true,
        });
      }
    }
  }

  return props;
}
