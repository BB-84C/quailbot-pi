import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const workspaceUiRoot = join(process.cwd(), "src", "workspace-ui");
const browserRoots = [join(workspaceUiRoot, "shared"), join(workspaceUiRoot, "client")];

const bannedPatterns = [
  /from\s+["']node:/,
  /require\(\s*["']node:/,
  /from\s+["']fs["']/,
  /from\s+["']path["']/,
  /from\s+["']child_process["']/,
  /process\./,
];

describe("workspace UI browser boundary", () => {
  it("keeps shared and client modules free of Node-only imports and globals", () => {
    const violations: string[] = [];

    for (const filePath of collectTypeScriptFiles(browserRoots)) {
      const text = readFileSync(filePath, "utf8");
      for (const pattern of bannedPatterns) {
        if (pattern.test(text)) {
          violations.push(`${relative(process.cwd(), filePath)} matched ${pattern}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

function collectTypeScriptFiles(roots: string[]): string[] {
  const files: string[] = [];

  for (const root of roots) {
    if (!existsDirectory(root)) {
      continue;
    }
    walk(root, files);
  }

  return files.sort();
}

function walk(dir: string, files: string[]): void {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walk(fullPath, files);
    } else if (entry.endsWith(".ts")) {
      files.push(fullPath);
    }
  }
}

function existsDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
