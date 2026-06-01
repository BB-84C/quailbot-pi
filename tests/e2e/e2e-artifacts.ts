import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type SemanticE2EArtifact = {
  scenario: string;
  task: string;
  events: unknown[];
  responses: unknown[];
  messages: unknown[];
  finalToolResult?: unknown;
  linkedObservations: unknown[];
  assertions: { name: string; pass: boolean; detail: string }[];
};

export function semanticArtifactRoot(): string {
  return join(process.cwd(), ".opencode", "artifacts", "quailbot-pi-e2e");
}

export function writeSemanticArtifact(name: string, artifact: SemanticE2EArtifact): string {
  const path = join(semanticArtifactRoot(), `${name}.json`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(artifact, null, 2), "utf8");
  return path;
}

export function readSemanticArtifact(path: string): SemanticE2EArtifact {
  if (!existsSync(path)) throw new Error(`semantic E2E artifact not found: ${path}`);
  return JSON.parse(readFileSync(path, "utf8")) as SemanticE2EArtifact;
}
