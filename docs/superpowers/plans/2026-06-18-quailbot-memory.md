# Quailbot Memory Subsystem Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the domain-organized memory subsystem — per-domain files, agent self-writes with consolidation discipline, load/unload (tool + `/quailbot-memory` command + toggle menu), search, and loaded-memory rendering into the cached knowledge prefix.

**Architecture:** Memory lives at `.quailbot-pi/memory/<domain>.md`, organized into `## topic` sections. A `memory` module reads/searches and writes via section-level consolidation (replace-by-`expectedOldHash`, never blind append). Loaded domains (persisted in `knowledge-state.json` from Plan 1) render their full content into the system-prompt prefix each turn. Tools let the agent save/load/unload/search; a `/quailbot-memory` command lists domains and toggles them via a `SettingsList` menu.

**Tech Stack:** TypeScript (ESM `.js` specifiers), Pi extension API, TypeBox, vitest. Reference spec: `docs/superpowers/specs/2026-06-18-quailbot-skill-memory-design.md`.

**Depends on Plan 1** (`2026-06-18-quailbot-knowledge-foundation-and-skills.md`): `knowledge-state.ts` (`loadedDomains`, `skillBodyWindow`, `saveKnowledgeState`), `knowledge-render.ts` (`renderKnowledgePrefix` with `memorySection?` seam), `knowledge-runtime.ts` (`KnowledgeRuntime`, `renderKnowledgePrefixFromRuntime`), `consolidation.ts` (`contentHash`), and tool registration patterns. Plan 1 must be merged/green first.

---

## File Structure

**Create:**
- `src/knowledge/memory.ts` — per-domain file paths, list, read (section-parsed), search, section-level consolidating write.
- `src/tools/quailbot_memory_save.ts` — consolidating write tool executor.
- `src/tools/quailbot_memory_load.ts` — load/unload executors (mutate + persist loaded set).
- `src/tools/quailbot_memory_search.ts` — search executor.
- `src/knowledge/register-memory-commands.ts` — `/quailbot-memory` (list/load/unload + toggle menu).
- Tests under `tests/knowledge/` and `tests/tools/`.

**Modify:**
- `src/knowledge/knowledge-render.ts` — add `renderMemorySection(cwd, loadedDomains)`.
- `src/knowledge/knowledge-runtime.ts` — compute the memory section in `renderKnowledgePrefixFromRuntime`.
- `src/tools/register-tools.ts` — register the three memory tools.
- `src/extension.ts` — register memory commands.

---

## Phase A — Memory store

### Task 1: Memory store module (read, search, section-consolidating write)

**Files:**
- Create: `src/knowledge/memory.ts`
- Test: `tests/knowledge/memory.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  listMemoryDomains,
  parseMemorySections,
  readMemoryDomain,
  saveMemoryTopic,
  searchMemory,
} from "../../src/knowledge/memory.js";

function tempCwd(): string {
  return mkdtempSync(join(tmpdir(), "qb-mem-"));
}

describe("memory store", () => {
  it("creates a topic, lists the domain, and parses sections", () => {
    const cwd = tempCwd();
    const created = saveMemoryTopic(cwd, "tip-conditioning", "shake gains", "Ramp integral gain to max over ~1s.");
    expect(created.status).toBe("created");
    expect(listMemoryDomains(cwd)).toEqual(["tip-conditioning"]);
    const doc = readMemoryDomain(cwd, "tip-conditioning");
    expect(doc?.sections).toHaveLength(1);
    expect(doc?.sections[0]).toMatchObject({ topic: "shake gains" });
  });

  it("consolidates an existing topic only when expected_old_hash matches", () => {
    const cwd = tempCwd();
    saveMemoryTopic(cwd, "d", "t", "old body");
    const hash = readMemoryDomain(cwd, "d")!.sections[0].hash;
    expect(saveMemoryTopic(cwd, "d", "t", "new", "wrong").status).toBe("stale_hash");
    expect(saveMemoryTopic(cwd, "d", "t", "consolidated body").status).toBe("missing_hash");
    expect(saveMemoryTopic(cwd, "d", "t", "consolidated body", hash).status).toBe("updated");
    expect(readMemoryDomain(cwd, "d")!.sections[0].body).toBe("consolidated body");
  });

  it("flags a date-like topic with an advisory warning", () => {
    const cwd = tempCwd();
    const result = saveMemoryTopic(cwd, "d", "2026-06-18", "a dated note");
    expect(result.status).toBe("created");
    expect(result.warning).toContain("topical heading");
  });

  it("searches across domains by topic and body", () => {
    const cwd = tempCwd();
    saveMemoryTopic(cwd, "approach", "fast approach", "Use coarse steps then fine.");
    saveMemoryTopic(cwd, "tip", "shake", "Ramp gain to maximum.");
    const matches = searchMemory(cwd, "ramp");
    expect(matches).toEqual([{ domain: "tip", topic: "shake", snippet: "Ramp gain to maximum." }]);
    expect(parseMemorySections("## a\n\nbody a\n\n## b\n\nbody b").map((s) => s.topic)).toEqual(["a", "b"]);
    expect(readFileSync(join(cwd, ".quailbot-pi", "memory", "tip.md"), "utf8")).toContain("## shake");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/knowledge/memory.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/knowledge/memory.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/knowledge/memory.ts tests/knowledge/memory.test.ts
git commit -m "feat(knowledge): add domain memory store with section consolidation"
```

---

## Phase B — Loaded-memory rendering

### Task 2: Render loaded memory into the prefix

**Files:**
- Modify: `src/knowledge/knowledge-render.ts` (add `renderMemorySection`)
- Modify: `src/knowledge/knowledge-runtime.ts` (compute the section in `renderKnowledgePrefixFromRuntime`)
- Test: `tests/knowledge/memory-render.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { renderMemorySection } from "../../src/knowledge/knowledge-render.js";
import { createKnowledgeRuntime, hydrateKnowledgeRuntime, renderKnowledgePrefixFromRuntime } from "../../src/knowledge/knowledge-runtime.js";
import { saveMemoryTopic } from "../../src/knowledge/memory.js";
import { saveKnowledgeState } from "../../src/knowledge/knowledge-state.js";

function tempCwd(): string {
  return mkdtempSync(join(tmpdir(), "qb-memrender-"));
}

describe("renderMemorySection", () => {
  it("returns undefined when there are no domains", () => {
    expect(renderMemorySection(tempCwd(), new Set())).toBeUndefined();
  });

  it("lists all domains, marks loaded, and inlines loaded bodies", () => {
    const cwd = tempCwd();
    saveMemoryTopic(cwd, "tip", "shake", "Ramp gain to max.");
    saveMemoryTopic(cwd, "approach", "coarse", "Coarse then fine.");
    const section = renderMemorySection(cwd, new Set(["tip"]))!;
    expect(section).toContain("Available domains: approach, tip");
    expect(section).toContain("Loaded: tip");
    expect(section).toContain("### memory: tip");
    expect(section).toContain("Ramp gain to max.");
    expect(section).not.toContain("Coarse then fine."); // approach not loaded
  });
});

describe("renderKnowledgePrefixFromRuntime with memory", () => {
  it("includes loaded memory and is byte-identical across turns", () => {
    const cwd = tempCwd();
    saveMemoryTopic(cwd, "tip", "shake", "Ramp gain to max.");
    saveKnowledgeState({ loadedDomains: ["tip"], skillBodyWindow: 3 }, cwd);
    const knowledge = createKnowledgeRuntime();
    hydrateKnowledgeRuntime(knowledge, cwd);
    const first = renderKnowledgePrefixFromRuntime(knowledge, undefined);
    expect(first).toBe(renderKnowledgePrefixFromRuntime(knowledge, undefined));
    expect(first).toContain("### memory: tip");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/knowledge/memory-render.test.ts`
Expected: FAIL — `renderMemorySection` not exported.

- [ ] **Step 3: Add `renderMemorySection` to `src/knowledge/knowledge-render.ts`**

Add the import at the top:
```ts
import { listMemoryDomains, readMemoryDomain } from "./memory.js";
```
Add the exported function:
```ts
export function renderMemorySection(cwd: string, loadedDomains: Set<string>): string | undefined {
  const domains = listMemoryDomains(cwd);
  if (domains.length === 0) {
    return undefined;
  }
  const loaded = [...loadedDomains].filter((domain) => domains.includes(domain)).sort();
  const lines = [
    "QUAILBOT MEMORY",
    `Available domains: ${domains.join(", ")}`,
    `Loaded: ${loaded.length > 0 ? loaded.join(", ") : "(none)"}`,
    "Load a domain with /quailbot-memory or quailbot_memory_load; search all with quailbot_memory_search.",
  ];
  for (const domain of loaded) {
    const doc = readMemoryDomain(cwd, domain);
    if (doc && doc.content.trim().length > 0) {
      lines.push("", `### memory: ${domain}`, doc.content.trim());
    }
  }
  return lines.join("\n");
}
```

- [ ] **Step 4: Compute the section in `src/knowledge/knowledge-runtime.ts`**

Add the import:
```ts
import { renderKnowledgePrefix, renderMemorySection } from "./knowledge-render.js";
```
Update `renderKnowledgePrefixFromRuntime` to compute and pass the memory section (replace the existing body):
```ts
export function renderKnowledgePrefixFromRuntime(knowledge: KnowledgeRuntime, workspace: Workspace | undefined): string {
  const skills = discoverSkills(knowledge.cwd, knowledge.skillCache);
  const agentsFile = readDeployedAgentsFile(knowledge.cwd, knowledge.agentsCache);
  const memorySection = renderMemorySection(knowledge.cwd, knowledge.loadedDomains);
  return renderKnowledgePrefix({ agentsFile, skills, workspace, memorySection });
}
```
(Remove the now-unused `memorySection?` parameter from the signature if Plan 1 left one; callers in `extension.ts` pass only `(knowledge, workspace)`.)

- [ ] **Step 5: Run tests + typecheck**

Run: `npm run typecheck && npm test -- tests/knowledge/memory-render.test.ts`
Expected: PASS (3 tests), typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/knowledge/knowledge-render.ts src/knowledge/knowledge-runtime.ts tests/knowledge/memory-render.test.ts
git commit -m "feat(knowledge): render loaded memory domains into the knowledge prefix"
```

---

## Phase C — Memory write tool (consolidation)

### Task 3: `quailbot_memory_save` tool

**Files:**
- Create: `src/tools/quailbot_memory_save.ts`
- Test: `tests/tools/quailbot-memory-save.test.ts`
- Modify: `src/tools/register-tools.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { readMemoryDomain } from "../../src/knowledge/memory.js";
import { executeQuailbotMemorySave } from "../../src/tools/quailbot_memory_save.js";

function tempCwd(): string {
  return mkdtempSync(join(tmpdir(), "qb-memsave-"));
}

describe("executeQuailbotMemorySave", () => {
  it("creates a new topic", () => {
    const cwd = tempCwd();
    const result = executeQuailbotMemorySave(cwd, { domain: "tip", topic: "shake", body: "Ramp gain." });
    expect(result).toMatchObject({ ok: true, action: "quailbot_memory_save" });
    expect(result.primary_result).toMatchObject({ status: "created", domain: "tip", topic: "shake" });
  });

  it("requires expected_old_hash to overwrite an existing topic", () => {
    const cwd = tempCwd();
    executeQuailbotMemorySave(cwd, { domain: "tip", topic: "shake", body: "v1" });
    const stale = executeQuailbotMemorySave(cwd, { domain: "tip", topic: "shake", body: "v2" });
    expect(stale.ok).toBe(false);
    expect(stale.primary_result).toMatchObject({ status: "missing_hash" });
    const hash = readMemoryDomain(cwd, "tip")!.sections[0].hash;
    const ok = executeQuailbotMemorySave(cwd, { domain: "tip", topic: "shake", body: "v2", expected_old_hash: hash });
    expect(ok.ok).toBe(true);
    expect(ok.primary_result).toMatchObject({ status: "updated" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tools/quailbot-memory-save.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/tools/quailbot_memory_save.ts`**

```ts
import { saveMemoryTopic } from "../knowledge/memory.js";
import type { QuailbotToolResult } from "./tool-result.js";

export type QuailbotMemorySaveParams = {
  domain: string;
  topic: string;
  body: string;
  expected_old_hash?: string;
};

export function executeQuailbotMemorySave(cwd: string, params: QuailbotMemorySaveParams): QuailbotToolResult {
  const result = saveMemoryTopic(cwd, params.domain, params.topic, params.body, params.expected_old_hash);
  return {
    ok: result.status === "created" || result.status === "updated",
    action: "quailbot_memory_save",
    action_input: params,
    primary_result: result,
  };
}
```

- [ ] **Step 4: Register in `src/tools/register-tools.ts`**

```ts
import { executeQuailbotMemorySave } from "./quailbot_memory_save.js";
// ...
pi.registerTool({
  name: "quailbot_memory_save",
  label: "Quailbot memory save",
  description: "Save a situated fact into a domain memory file as a `## topic` section. To update an existing topic you MUST pass expected_old_hash (the section hash from reading the domain) and submit a consolidated rewrite — do not append dated ledger entries.",
  renderCall: makeQuailbotRenderCall("quailbot_memory_save"),
  renderResult: renderQuailbotToolResult,
  parameters: Type.Object({
    domain: Type.String({ minLength: 1, description: "Memory domain, e.g. tip-conditioning." }),
    topic: Type.String({ minLength: 1, description: "Topical section heading (not a date)." }),
    body: Type.String({ minLength: 1, description: "The consolidated content for this topic." }),
    expected_old_hash: Type.Optional(Type.String({ minLength: 1, description: "Required to overwrite an existing topic; the section hash from reading the domain first." })),
  }),
  async execute(toolCallId, params) {
    return piToolResult(
      await executeLoggedTool(runtime, toolCallId, "quailbot_memory_save", params, async () =>
        executeQuailbotMemorySave(runtime.knowledge.cwd, params),
      ),
    );
  },
});
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npm run typecheck && npm test -- tests/tools/quailbot-memory-save.test.ts`
Expected: PASS (2 tests), typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/tools/quailbot_memory_save.ts src/tools/register-tools.ts tests/tools/quailbot-memory-save.test.ts
git commit -m "feat(tools): add quailbot_memory_save with section consolidation"
```

---

## Phase D — Load / unload tools

### Task 4: `quailbot_memory_load` / `quailbot_memory_unload`

**Files:**
- Create: `src/tools/quailbot_memory_load.ts`
- Test: `tests/tools/quailbot-memory-load.test.ts`
- Modify: `src/tools/register-tools.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createKnowledgeRuntime, hydrateKnowledgeRuntime } from "../../src/knowledge/knowledge-runtime.js";
import { loadKnowledgeState } from "../../src/knowledge/knowledge-state.js";
import { saveMemoryTopic } from "../../src/knowledge/memory.js";
import { executeQuailbotMemoryLoad, executeQuailbotMemoryUnload } from "../../src/tools/quailbot_memory_load.js";

function runtimeFor(cwd: string) {
  const knowledge = createKnowledgeRuntime();
  hydrateKnowledgeRuntime(knowledge, cwd);
  return knowledge;
}
function tempCwd(): string {
  return mkdtempSync(join(tmpdir(), "qb-memload-"));
}

describe("memory load/unload", () => {
  it("loads a known domain and persists the set", () => {
    const cwd = tempCwd();
    saveMemoryTopic(cwd, "tip", "shake", "Ramp gain.");
    const knowledge = runtimeFor(cwd);
    const result = executeQuailbotMemoryLoad(knowledge, "tip");
    expect(result.primary_result).toMatchObject({ domain: "tip", loaded: ["tip"], known: true });
    expect(loadKnowledgeState(cwd).loadedDomains).toEqual(["tip"]);
  });

  it("warns when loading a domain with no file yet, and unloads", () => {
    const cwd = tempCwd();
    const knowledge = runtimeFor(cwd);
    const loaded = executeQuailbotMemoryLoad(knowledge, "ghost");
    expect((loaded.primary_result as { warning?: string }).warning).toContain("No memory file");
    const unloaded = executeQuailbotMemoryUnload(knowledge, "ghost");
    expect(unloaded.primary_result).toMatchObject({ domain: "ghost", loaded: [] });
    expect(loadKnowledgeState(cwd).loadedDomains).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tools/quailbot-memory-load.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/tools/quailbot_memory_load.ts`**

```ts
import type { KnowledgeRuntime } from "../knowledge/knowledge-runtime.js";
import { saveKnowledgeState } from "../knowledge/knowledge-state.js";
import { listMemoryDomains } from "../knowledge/memory.js";
import type { QuailbotToolResult } from "./tool-result.js";

function persist(knowledge: KnowledgeRuntime): void {
  saveKnowledgeState(
    { loadedDomains: [...knowledge.loadedDomains], skillBodyWindow: knowledge.skillBodyWindow },
    knowledge.cwd,
  );
}

export function executeQuailbotMemoryLoad(knowledge: KnowledgeRuntime, domain: string): QuailbotToolResult {
  knowledge.loadedDomains.add(domain);
  persist(knowledge);
  const known = listMemoryDomains(knowledge.cwd).includes(domain);
  return {
    ok: true,
    action: "quailbot_memory_load",
    action_input: { domain },
    primary_result: {
      domain,
      loaded: [...knowledge.loadedDomains].sort(),
      known,
      warning: known ? undefined : "No memory file for this domain yet; it will render once content is saved.",
    },
  };
}

export function executeQuailbotMemoryUnload(knowledge: KnowledgeRuntime, domain: string): QuailbotToolResult {
  knowledge.loadedDomains.delete(domain);
  persist(knowledge);
  return {
    ok: true,
    action: "quailbot_memory_unload",
    action_input: { domain },
    primary_result: { domain, loaded: [...knowledge.loadedDomains].sort() },
  };
}
```

- [ ] **Step 4: Register both tools in `src/tools/register-tools.ts`**

```ts
import { executeQuailbotMemoryLoad, executeQuailbotMemoryUnload } from "./quailbot_memory_load.js";
// ...
pi.registerTool({
  name: "quailbot_memory_load",
  label: "Quailbot memory load",
  description: "Load a memory domain so its content renders in context. Persists across turns and restart.",
  renderCall: makeQuailbotRenderCall("quailbot_memory_load"),
  renderResult: renderQuailbotToolResult,
  parameters: Type.Object({ domain: Type.String({ minLength: 1 }) }),
  async execute(toolCallId, params) {
    return piToolResult(
      await executeLoggedTool(runtime, toolCallId, "quailbot_memory_load", params, async () =>
        executeQuailbotMemoryLoad(runtime.knowledge, params.domain),
      ),
    );
  },
});
pi.registerTool({
  name: "quailbot_memory_unload",
  label: "Quailbot memory unload",
  description: "Unload a memory domain from context.",
  renderCall: makeQuailbotRenderCall("quailbot_memory_unload"),
  renderResult: renderQuailbotToolResult,
  parameters: Type.Object({ domain: Type.String({ minLength: 1 }) }),
  async execute(toolCallId, params) {
    return piToolResult(
      await executeLoggedTool(runtime, toolCallId, "quailbot_memory_unload", params, async () =>
        executeQuailbotMemoryUnload(runtime.knowledge, params.domain),
      ),
    );
  },
});
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npm run typecheck && npm test -- tests/tools/quailbot-memory-load.test.ts`
Expected: PASS (2 tests), typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/tools/quailbot_memory_load.ts src/tools/register-tools.ts tests/tools/quailbot-memory-load.test.ts
git commit -m "feat(tools): add quailbot_memory_load/unload with persistence"
```

---

## Phase E — Search tool

### Task 5: `quailbot_memory_search`

**Files:**
- Create: `src/tools/quailbot_memory_search.ts`
- Test: `tests/tools/quailbot-memory-search.test.ts`
- Modify: `src/tools/register-tools.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { saveMemoryTopic } from "../../src/knowledge/memory.js";
import { executeQuailbotMemorySearch } from "../../src/tools/quailbot_memory_search.js";

function tempCwd(): string {
  return mkdtempSync(join(tmpdir(), "qb-memsearch-"));
}

describe("executeQuailbotMemorySearch", () => {
  it("returns matches with domain, topic, and snippet", () => {
    const cwd = tempCwd();
    saveMemoryTopic(cwd, "tip", "shake", "Ramp the integral gain to maximum.");
    const result = executeQuailbotMemorySearch(cwd, { query: "integral gain" });
    expect(result).toMatchObject({ ok: true, action: "quailbot_memory_search" });
    expect(result.primary_result).toMatchObject({ query: "integral gain", count: 1 });
    expect((result.primary_result as { matches: Array<{ domain: string }> }).matches[0]).toMatchObject({ domain: "tip", topic: "shake" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tools/quailbot-memory-search.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/tools/quailbot_memory_search.ts`**

```ts
import { searchMemory } from "../knowledge/memory.js";
import type { QuailbotToolResult } from "./tool-result.js";

export type QuailbotMemorySearchParams = { query: string };

export function executeQuailbotMemorySearch(cwd: string, params: QuailbotMemorySearchParams): QuailbotToolResult {
  const matches = searchMemory(cwd, params.query);
  return {
    ok: true,
    action: "quailbot_memory_search",
    action_input: params,
    primary_result: { query: params.query, count: matches.length, matches },
  };
}
```

- [ ] **Step 4: Register in `src/tools/register-tools.ts`**

```ts
import { executeQuailbotMemorySearch } from "./quailbot_memory_search.js";
// ...
pi.registerTool({
  name: "quailbot_memory_search",
  label: "Quailbot memory search",
  description: "Search all memory domains by keyword; returns matching domain, topic, and a snippet. Use before saving to find related sections to consolidate.",
  renderCall: makeQuailbotRenderCall("quailbot_memory_search"),
  renderResult: renderQuailbotToolResult,
  parameters: Type.Object({ query: Type.String({ minLength: 1 }) }),
  async execute(toolCallId, params) {
    return piToolResult(
      await executeLoggedTool(runtime, toolCallId, "quailbot_memory_search", params, async () =>
        executeQuailbotMemorySearch(runtime.knowledge.cwd, params),
      ),
    );
  },
});
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npm run typecheck && npm test -- tests/tools/quailbot-memory-search.test.ts`
Expected: PASS (1 test), typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/tools/quailbot_memory_search.ts src/tools/register-tools.ts tests/tools/quailbot-memory-search.test.ts
git commit -m "feat(tools): add quailbot_memory_search"
```

---

## Phase F — Command + toggle menu

### Task 6: `/quailbot-memory` command (list/load/unload + SettingsList menu)

> **Best-of-N candidate:** the no-arg interactive toggle menu (`ctx.ui.custom` + pi-tui `SettingsList`) is UI-shaped and the exact `ctx.ui.custom` / `SettingsList` signatures must be confirmed against `node_modules/@earendil-works/pi-tui/dist/components/settings-list.d.ts` and the `ExtensionUIContext.custom` type. Consider best-of-N for the menu factory. The list/load/unload string subcommands below are fully unit-tested and are the reliable core.

**Files:**
- Create: `src/knowledge/register-memory-commands.ts`
- Test: `tests/knowledge/memory-command.test.ts`
- Modify: `src/extension.ts` (register the command)

- [ ] **Step 1: Write the failing test (string subcommands)**

```ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { createKnowledgeRuntime, hydrateKnowledgeRuntime } from "../../src/knowledge/knowledge-runtime.js";
import { loadKnowledgeState } from "../../src/knowledge/knowledge-state.js";
import { saveMemoryTopic } from "../../src/knowledge/memory.js";
import { handleMemoryCommand } from "../../src/knowledge/register-memory-commands.js";

function tempCwd(): string {
  return mkdtempSync(join(tmpdir(), "qb-memcmd-"));
}
function fakeCtx() {
  return { ui: { notify: vi.fn(), custom: vi.fn() } } as never;
}
function runtimeFor(cwd: string) {
  const knowledge = createKnowledgeRuntime();
  hydrateKnowledgeRuntime(knowledge, cwd);
  return { knowledge, workspace: undefined } as never;
}

describe("handleMemoryCommand", () => {
  it("lists domains and loaded set", async () => {
    const cwd = tempCwd();
    saveMemoryTopic(cwd, "tip", "shake", "x");
    const ctx = fakeCtx();
    await handleMemoryCommand("list", ctx, runtimeFor(cwd));
    expect((ctx as { ui: { notify: ReturnType<typeof vi.fn> } }).ui.notify).toHaveBeenCalledWith(expect.stringContaining("tip"), "info");
  });

  it("loads and unloads a domain, persisting each time", async () => {
    const cwd = tempCwd();
    const runtime = runtimeFor(cwd);
    await handleMemoryCommand("load tip", fakeCtx(), runtime);
    expect(loadKnowledgeState(cwd).loadedDomains).toEqual(["tip"]);
    await handleMemoryCommand("unload tip", fakeCtx(), runtime);
    expect(loadKnowledgeState(cwd).loadedDomains).toEqual([]);
  });

  it("warns on a missing domain argument", async () => {
    const ctx = fakeCtx();
    await handleMemoryCommand("load", ctx, runtimeFor(tempCwd()));
    expect((ctx as { ui: { notify: ReturnType<typeof vi.fn> } }).ui.notify).toHaveBeenCalledWith(expect.stringContaining("Usage"), "warning");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/knowledge/memory-command.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/knowledge/register-memory-commands.ts`**

Mirror the `ExtensionAPI` / `ExtensionCommandContext` import style from `register-workspace-commands.ts`.
```ts
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import type { QuailbotRuntime } from "../extension.js";
import { splitCommandArgs } from "../workspace/register-workspace-commands.js";
import { saveKnowledgeState } from "./knowledge-state.js";
import { listMemoryDomains } from "./memory.js";

export function registerMemoryCommands(pi: ExtensionAPI, runtime: QuailbotRuntime): void {
  pi.registerCommand("quailbot-memory", {
    description: "List, load, or unload Quailbot memory domains (no args opens the toggle menu)",
    getArgumentCompletions(prefix) {
      return ["list", "load", "unload"].filter((command) => command.startsWith(prefix.trim())).map((command) => ({ value: command, label: command }));
    },
    async handler(args, ctx) {
      await handleMemoryCommand(args, ctx, runtime);
    },
  });
}

function persistLoaded(runtime: QuailbotRuntime): void {
  saveKnowledgeState(
    { loadedDomains: [...runtime.knowledge.loadedDomains], skillBodyWindow: runtime.knowledge.skillBodyWindow },
    runtime.knowledge.cwd,
  );
}

export async function handleMemoryCommand(args: string, ctx: ExtensionCommandContext, runtime: QuailbotRuntime): Promise<void> {
  const [sub = "", ...rest] = splitCommandArgs(args);
  if (sub === "") {
    await openMemoryMenu(ctx, runtime);
    return;
  }
  if (sub === "list") {
    const domains = listMemoryDomains(runtime.knowledge.cwd);
    const loaded = [...runtime.knowledge.loadedDomains].sort();
    ctx.ui.notify(`Quailbot memory domains: ${domains.join(", ") || "(none)"}\nLoaded: ${loaded.join(", ") || "(none)"}`, "info");
    return;
  }
  if (sub === "load" || sub === "unload") {
    const domain = rest[0];
    if (!domain) {
      ctx.ui.notify(`Usage: /quailbot-memory ${sub} <domain>`, "warning");
      return;
    }
    if (sub === "load") {
      runtime.knowledge.loadedDomains.add(domain);
    } else {
      runtime.knowledge.loadedDomains.delete(domain);
    }
    persistLoaded(runtime);
    ctx.ui.notify(`${sub === "load" ? "Loaded" : "Unloaded"} memory domain "${domain}".`, "info");
    return;
  }
  ctx.ui.notify("Usage: /quailbot-memory [list | load <domain> | unload <domain>]", "warning");
}
```

- [ ] **Step 4: Implement the toggle menu (`openMemoryMenu`) — confirm the pi-tui signatures first**

Read `node_modules/@earendil-works/pi-tui/dist/components/settings-list.d.ts` and the `ExtensionUIContext.custom` type. Implement `openMemoryMenu(ctx, runtime)` to mount a `SettingsList` via `ctx.ui.custom(...)`: one row per `listMemoryDomains(cwd)` with `currentValue` of `"loaded"`/`"unloaded"` (from `runtime.knowledge.loadedDomains`) and `values: ["loaded", "unloaded"]`. On `done`, apply each row's value to `runtime.knowledge.loadedDomains`, call `persistLoaded(runtime)`, and `ctx.ui.notify` a summary. If `ctx.ui.custom`/`SettingsList` wiring is uncertain, fall back to `ctx.ui.select` per domain or notify the user to use the string subcommands. This step is the best-of-N candidate; the string subcommands already work without it.

- [ ] **Step 5: Register in `src/extension.ts`**

```ts
import { registerMemoryCommands } from "./knowledge/register-memory-commands.js";
// ... alongside the other register*() calls:
registerMemoryCommands(pi, runtime);
```

- [ ] **Step 6: Run tests + typecheck**

Run: `npm run typecheck && npm test -- tests/knowledge/memory-command.test.ts`
Expected: PASS (3 tests), typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add src/knowledge/register-memory-commands.ts src/extension.ts tests/knowledge/memory-command.test.ts
git commit -m "feat(knowledge): add /quailbot-memory command and toggle menu"
```

---

## Final verification

- [ ] **Full suite + typecheck + build**

Run: `npm run typecheck && npm test && npm run build`
Expected: typecheck clean, all tests PASS, build succeeds.

- [ ] **Manual acceptance (spec §13 scenarios 2, 3, 6)**

1. `/quailbot-memory load tip-conditioning` → next turn the domain's content appears in the prefix; `unload` → it disappears (scenario 2).
2. `quailbot_memory_save` mid-session → reflected next turn with NO synthetic message and NO extra LLM turn (scenario 3, no-reload propagation).
3. Saving to an existing topic without `expected_old_hash` is rejected; with the correct hash it consolidates the section (no duplication) (scenario 6).

---

## Self-review (completed by plan author)

- **Spec coverage:** Memory half — §4 `memory/<domain>.md`, §5 loaded bodies in prefix, §7 `quailbot_memory_save`/`load`/`unload`/`search`, §8 `/quailbot-memory` + menu, §9 consolidation (section hash, append-ledger advisory), §13 scenarios 2/3/6 — all covered. Skills half is Plan 1.
- **Type consistency:** `KnowledgeRuntime`, `saveKnowledgeState`, `contentHash`, `MemorySection`, `QuailbotToolResult`, `splitCommandArgs`, `renderKnowledgePrefix({ memorySection })` align with Plan 1 definitions.
- **Best-of-N flag:** Task 6 Step 4 (the `SettingsList` menu) is the one UI-ambiguous unit; the tested string subcommands are the reliable fallback.

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-18-quailbot-memory.md`.** Execute after Plan 1 via superpowers:subagent-driven-development. Best-of-N is warranted for Plan 1 Task 8 (projection integration) and Plan 2 Task 6 Step 4 (toggle menu); the rest are well-specified single-pass tasks.
