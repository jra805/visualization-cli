import fs from "node:fs";
import path from "node:path";
import type { Graph, ModuleType } from "../graph/types.js";

interface ContentRule {
  pattern: RegExp;
  type: ModuleType;
}

const CONTENT_RULES: ContentRule[] = [
  // NestJS / Spring / Angular decorators
  { pattern: /@Controller\b|@RestController\b/, type: "controller" },
  { pattern: /@Injectable\b|@Service\b/, type: "service" },
  { pattern: /@Entity\b/, type: "entity" },
  { pattern: /@Component\b|@NgModule\b/, type: "component" },
  { pattern: /@Repository\b/, type: "repository" },
  { pattern: /@Guard\b|@UseGuards\b/, type: "guard" },
  { pattern: /@Middleware\b/, type: "middleware" },

  // Vue
  { pattern: /defineComponent\s*\(/, type: "component" },
  { pattern: /<template>/, type: "component" },

  // Express / Fastify route handlers
  { pattern: /app\.(get|post|put|patch|delete)\s*\(/, type: "controller" },
  { pattern: /router\.(get|post|put|patch|delete)\s*\(/, type: "controller" },

  // Flask / FastAPI
  { pattern: /@app\.route\b|@router\.(get|post|put|delete)/, type: "controller" },
  { pattern: /class\s+\w+.*\bAPIView\b/, type: "controller" },

  // Django
  { pattern: /class\s+\w+.*models\.Model\b/, type: "model" },
  { pattern: /class\s+\w+.*ViewSet\b/, type: "view" },
  { pattern: /class\s+\w+.*View\b.*:/, type: "view" },
  { pattern: /class\s+\w+.*Serializer\b/, type: "serializer" },
  { pattern: /class\s+\w+.*Form\b/, type: "validator" },

  // Go HTTP handlers
  { pattern: /func\s+\w+.*http\.Handler|func\s+\w+.*gin\.Context|func\s+\w+.*echo\.Context/, type: "handler" },

  // Java Spring
  { pattern: /@RequestMapping\b|@GetMapping\b|@PostMapping\b/, type: "controller" },
  { pattern: /@Configuration\b/, type: "config" },

  // General patterns
  { pattern: /class\s+\w+.*Migration\b/, type: "migration" },
  { pattern: /class\s+\w+.*Test\b|describe\s*\(|it\s*\(|test\s*\(/, type: "test" },
];

/**
 * Second-pass classifier: reads first ~50 lines of files with "unknown"
 * moduleType and attempts content-based reclassification.
 */
export function classifyByContent(graph: Graph, rootDir: string): void {
  for (const [id, node] of graph.nodes) {
    if (node.moduleType !== "unknown") continue;

    const absPath = path.join(rootDir, node.filePath);
    const head = readHead(absPath, 50);
    if (!head) continue;

    for (const rule of CONTENT_RULES) {
      if (rule.pattern.test(head)) {
        node.moduleType = rule.type;
        break;
      }
    }
  }
}

function readHead(filePath: string, lines: number): string | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return content.split("\n").slice(0, lines).join("\n");
  } catch {
    return null;
  }
}
