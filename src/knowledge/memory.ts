import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { quailbotStateRoot } from "../workspace/workspace-state.js";
import { contentHash } from "./consolidation.js";

export type MemorySection = { topic: string; body: string; hash: string };

export type SaveMemoryResult = {
  status: "created" | "updated" | "stale_hash" | "missing_hash";
  domain: string;
  topic: string;
  sectionHash?: string;
  currentHash?: string;
  warning?: string;
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
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name.slice(0, -3))
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
  const path = memoryFilePath(cwd, domain);
  if (!existsSync(path)) {
    return undefined;
  }
  const content = readFileSync(path, "utf8");
  return { content, sections: parseMemorySections(content) };
}

export function searchMemory(cwd: string, query: string): Array<{ domain: string; topic: string; snippet: string }> {
  const needle = query.toLowerCase();
  const results: Array<{ domain: string; topic: string; snippet: string }> = [];
  for (const domain of listMemoryDomains(cwd)) {
    const doc = readMemoryDomain(cwd, domain);
    if (!doc) {
      continue;
    }
    for (const section of doc.sections) {
      if (`${section.topic}\n${section.body}`.toLowerCase().includes(needle)) {
        results.push({ domain, topic: section.topic, snippet: section.body.slice(0, 200) });
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
    writeSections(cwd, domain, sections);
    return { status: "updated", domain, topic, sectionHash: contentHash(trimmed), warning };
  }

  const sections = [...doc.sections, { topic, body: trimmed, hash: contentHash(trimmed) }];
  writeSections(cwd, domain, sections);
  return { status: "created", domain, topic, sectionHash: contentHash(trimmed), warning };
}

function writeSections(cwd: string, domain: string, sections: MemorySection[]): void {
  const path = memoryFilePath(cwd, domain);
  mkdirSync(dirname(path), { recursive: true });
  const content = `${sections.map((section) => `## ${section.topic}\n\n${section.body}`).join("\n\n")}\n`;
  writeFileSync(path, content, "utf8");
}
