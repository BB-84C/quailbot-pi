import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { quailbotStateRoot } from "../workspace/workspace-state.js";
import { contentHash } from "./consolidation.js";
import { isSafeKnowledgeName } from "./safe-name.js";

export type MemorySection = { topic: string; body: string; hash: string };

export type SaveMemoryResult = {
  status: "created" | "updated" | "stale_hash" | "missing_hash" | "invalid_name" | "filesystem_error";
  domain: string;
  topic: string;
  sectionHash?: string;
  currentHash?: string;
  warning?: string;
  errorCode?: string;
  errorMessage?: string;
};

export function memoryRoot(cwd: string): string {
  return join(quailbotStateRoot(cwd), "memory");
}

export function memoryFilePath(cwd: string, domain: string): string {
  return join(memoryRoot(cwd), `${domain}.md`);
}

export function listMemoryDomains(cwd: string): string[] {
  const root = memoryRoot(cwd);
  if (!existsSync(root)) {
    return [];
  }
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name.slice(0, -3))
    .filter(isSafeKnowledgeName)
    .sort();
}

export function parseMemorySections(content: string): MemorySection[] {
  const regex = /^## (.+)$/gm;
  const headings: Array<{ topic: string; start: number; bodyStart: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    headings.push({ topic: match[1].trim(), start: match.index, bodyStart: regex.lastIndex });
  }
  const sections: MemorySection[] = [];
  for (let i = 0; i < headings.length; i += 1) {
    const end = i + 1 < headings.length ? headings[i + 1].start : content.length;
    const body = content.slice(headings[i].bodyStart, end).trim();
    sections.push({ topic: headings[i].topic, body, hash: contentHash(body) });
  }
  return sections;
}

export function readMemoryDomain(cwd: string, domain: string): { content: string; sections: MemorySection[] } | undefined {
  if (!isSafeKnowledgeName(domain)) {
    return undefined;
  }
  const path = memoryFilePath(cwd, domain);
  if (!existsSync(path)) {
    return undefined;
  }
  let content;
  try {
    content = readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
  return { content, sections: parseMemorySections(content) };
}

export function searchMemory(cwd: string, query: string): Array<{ domain: string; topic: string; snippet: string; hash: string }> {
  const needle = query.toLowerCase();
  const results: Array<{ domain: string; topic: string; snippet: string; hash: string }> = [];
  for (const domain of listMemoryDomains(cwd)) {
    const doc = readMemoryDomain(cwd, domain);
    if (!doc) {
      continue;
    }
    for (const section of doc.sections) {
      if (`${section.topic}\n${section.body}`.toLowerCase().includes(needle)) {
        results.push({ domain, topic: section.topic, snippet: section.body.slice(0, 200), hash: section.hash });
      }
    }
  }
  return results;
}

export function saveMemoryTopic(
  cwd: string,
  domain: string,
  topic: string,
  body: string,
  expectedOldHash?: string,
): SaveMemoryResult {
  if (!isSafeKnowledgeName(domain)) {
    return { status: "invalid_name", domain, topic };
  }
  const doc = readMemoryDomain(cwd, domain) ?? { content: "", sections: [] as MemorySection[] };
  const existing = doc.sections.find((section) => section.topic === topic);
  const trimmed = body.trim();
  const warning = /^\d{4}-\d{2}-\d{2}/.test(topic.trim())
    ? "Topic looks like a date; prefer a topical heading and consolidate related knowledge rather than appending dated ledger entries."
    : undefined;

  if (existing) {
    if (!expectedOldHash) {
      return { status: "missing_hash", domain, topic, currentHash: existing.hash };
    }
    if (existing.hash !== expectedOldHash) {
      return { status: "stale_hash", domain, topic, currentHash: existing.hash };
    }
    const sections = doc.sections.map((section) =>
      section.topic === topic ? { topic, body: trimmed, hash: contentHash(trimmed) } : section,
    );
    const fsError = tryWriteSections(cwd, domain, sections);
    if (fsError !== undefined) {
      return { status: "filesystem_error", domain, topic, ...fsError };
    }
    return { status: "updated", domain, topic, sectionHash: contentHash(trimmed), warning };
  }

  const sections = [...doc.sections, { topic, body: trimmed, hash: contentHash(trimmed) }];
  const fsError = tryWriteSections(cwd, domain, sections);
  if (fsError !== undefined) {
    return { status: "filesystem_error", domain, topic, ...fsError };
  }
  return { status: "created", domain, topic, sectionHash: contentHash(trimmed), warning };
}

function tryWriteSections(
  cwd: string,
  domain: string,
  sections: MemorySection[],
): { errorCode?: string; errorMessage: string } | undefined {
  try {
    writeSections(cwd, domain, sections);
    return undefined;
  } catch (error) {
    return filesystemErrorDescriptor(error);
  }
}

function writeSections(cwd: string, domain: string, sections: MemorySection[]): void {
  const path = memoryFilePath(cwd, domain);
  mkdirSync(dirname(path), { recursive: true });
  const content = `${sections.map((section) => `## ${section.topic}\n\n${section.body}`).join("\n\n")}\n`;
  writeFileSync(path, content, "utf8");
}

export function filesystemErrorDescriptor(error: unknown): { errorCode?: string; errorMessage: string } {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorCode =
    error instanceof Error && typeof (error as unknown as { code?: unknown }).code === "string"
      ? ((error as unknown as { code: string }).code)
      : undefined;
  return errorCode === undefined ? { errorMessage } : { errorCode, errorMessage };
}
