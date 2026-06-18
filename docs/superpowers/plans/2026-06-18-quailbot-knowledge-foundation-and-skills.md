# Quailbot Knowledge Foundation + Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the driver-gated skill system and the per-turn self-rendered knowledge prefix (skill catalog + AGENTS.md), with on-disk knowledge-state persistence.

**Architecture:** A new `src/knowledge/` module owns knowledge-state persistence, skill discovery/parsing, the CLI-driver gate, AGENTS.md self-read, and deterministic prefix rendering. The Pi extension composes the rendered knowledge prefix into `result.systemPrompt` every turn (`before_agent_start`), so writes propagate next turn with no reload. A `quailbot_skill` tool loads skill bodies as tool results, projected newest-3-full/older-stub. Companion tools create/edit skills.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), Pi extension API (`@earendil-works/pi-coding-agent`), TypeBox tool schemas, vitest. Reference spec: `docs/superpowers/specs/2026-06-18-quailbot-skill-memory-design.md`.

**Conventions (verified):**
- Tests: vitest, files at `tests/**/*.test.ts` mirroring `src/`. Run: `npm test` (`vitest --run`). Typecheck: `npm run typecheck`. Build: `npm run build`.
- Tools return `QuailbotToolResult` (`{ ok, action, action_input, primary_result, linked_observation? }`); registered via `pi.registerTool({...})` and wrapped by `piToolResult`.
- State dir: `.quailbot-pi/` via `quailbotStateRoot(cwd)` from `src/workspace/workspace-state.ts`.
- All new files use ESM `.js` import specifiers (e.g. `import { X } from "./x.js"`).

---

## File Structure

**Create:**
- `src/knowledge/knowledge-state.ts` — load/save `.quailbot-pi/knowledge-state.json` (`loadedDomains`, `skillBodyWindow`).
- `src/knowledge/agents-file.ts` — self-read deployed-dir `AGENTS.md` (mtime-cached).
- `src/knowledge/skills.ts` — `SKILL.md` frontmatter parse + skill discovery (mtime-cached).
- `src/knowledge/driver-gate.ts` — driver-present predicate, skill-gate evaluation, warning text.
- `src/knowledge/knowledge-render.ts` — deterministic rendering of the knowledge prefix.
- `src/knowledge/knowledge-runtime.ts` — `KnowledgeRuntime` holder (loaded state + mtime caches).
- `src/tools/quailbot_skill.ts` — load-a-skill tool executor.
- `src/tools/quailbot_skill_write.ts` — create-a-skill tool executor.
- `src/tools/quailbot_skill_edit.ts` — consolidate-a-skill tool executor.
- `src/knowledge/register-knowledge-commands.ts` — `/quailbot-skills`, `/quailbot-reload`.
- Tests mirroring each under `tests/knowledge/` and `tests/tools/`.

**Modify:**
- `src/extension.ts` — add `KnowledgeRuntime` to runtime; hydrate at `session_start`; compose knowledge prefix in `before_agent_start`; pass window to `context` projection; register knowledge commands.
- `src/tools/register-tools.ts` — register `quailbot_skill`, `quailbot_skill_write`, `quailbot_skill_edit`.
- `src/tools/tool-result-context.ts` — add a skill counter + `isSkillAction` gating for newest-N-full.
- `src/tools/tool-result-projection.ts` — add a `quailbot_skill` projection branch + stub mode.

---

## Phase A — Foundation

### Task 1: Knowledge-state store

**Files:**
- Create: `src/knowledge/knowledge-state.ts`
- Test: `tests/knowledge/knowledge-state.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_SKILL_BODY_WINDOW,
  knowledgeStatePath,
  loadKnowledgeState,
  saveKnowledgeState,
} from "../../src/knowledge/knowledge-state.js";

function tempCwd(): string {
  return mkdtempSync(join(tmpdir(), "qb-knowledge-"));
}

describe("knowledge-state", () => {
  it("returns defaults when no state file exists", () => {
    const cwd = tempCwd();
    expect(loadKnowledgeState(cwd)).toEqual({ loadedDomains: [], skillBodyWindow: DEFAULT_SKILL_BODY_WINDOW });
  });

  it("round-trips state, sorting and de-duplicating loaded domains", () => {
    const cwd = tempCwd();
    saveKnowledgeState({ loadedDomains: ["b", "a", "a"], skillBodyWindow: 5 }, cwd);
    expect(loadKnowledgeState(cwd)).toEqual({ loadedDomains: ["a", "b"], skillBodyWindow: 5 });
    expect(knowledgeStatePath(cwd)).toContain(".quailbot-pi");
  });

  it("falls back to defaults on malformed json or bad window", () => {
    const cwd = tempCwd();
    mkdirSync(join(cwd, ".quailbot-pi"), { recursive: true });
    writeFileSync(knowledgeStatePath(cwd), "{not json", "utf8");
    expect(loadKnowledgeState(cwd)).toEqual({ loadedDomains: [], skillBodyWindow: DEFAULT_SKILL_BODY_WINDOW });

    saveKnowledgeState({ loadedDomains: [], skillBodyWindow: 0 }, cwd);
    expect(loadKnowledgeState(cwd).skillBodyWindow).toBe(DEFAULT_SKILL_BODY_WINDOW);
    expect(readFileSync(knowledgeStatePath(cwd), "utf8").endsWith("\n")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/knowledge/knowledge-state.test.ts`
Expected: FAIL — `Cannot find module '../../src/knowledge/knowledge-state.js'`.

- [ ] **Step 3: Write minimal implementation**

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { quailbotStateRoot } from "../workspace/workspace-state.js";

export type KnowledgeState = {
  loadedDomains: string[];
  skillBodyWindow: number;
};

export const DEFAULT_SKILL_BODY_WINDOW = 3;

export function knowledgeStatePath(cwd = process.cwd()): string {
  return join(quailbotStateRoot(cwd), "knowledge-state.json");
}

export function loadKnowledgeState(cwd = process.cwd()): KnowledgeState {
  const path = knowledgeStatePath(cwd);
  if (!existsSync(path)) {
    return defaultState();
  }
  try {
    return normalizeKnowledgeState(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return defaultState();
  }
}

export function saveKnowledgeState(state: KnowledgeState, cwd = process.cwd()): void {
  mkdirSync(quailbotStateRoot(cwd), { recursive: true });
  const normalized = normalizeKnowledgeState(state);
  writeFileSync(knowledgeStatePath(cwd), `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
}

function defaultState(): KnowledgeState {
  return { loadedDomains: [], skillBodyWindow: DEFAULT_SKILL_BODY_WINDOW };
}

function normalizeKnowledgeState(value: unknown): KnowledgeState {
  const record = isRecord(value) ? value : {};
  const loadedDomains = Array.isArray(record.loadedDomains)
    ? [...new Set(record.loadedDomains.filter((entry): entry is string => typeof entry === "string"))].sort()
    : [];
  const windowValue =
    typeof record.skillBodyWindow === "number" && Number.isInteger(record.skillBodyWindow) && record.skillBodyWindow > 0
      ? record.skillBodyWindow
      : DEFAULT_SKILL_BODY_WINDOW;
  return { loadedDomains, skillBodyWindow: windowValue };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/knowledge/knowledge-state.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/knowledge/knowledge-state.ts tests/knowledge/knowledge-state.test.ts
git commit -m "feat(knowledge): add knowledge-state persistence store"
```

### Task 2: AGENTS.md self-reader (mtime-cached)

**Files:**
- Create: `src/knowledge/agents-file.ts`
- Test: `tests/knowledge/agents-file.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createAgentsFileCache, readDeployedAgentsFile } from "../../src/knowledge/agents-file.js";

function tempCwd(): string {
  return mkdtempSync(join(tmpdir(), "qb-agents-"));
}

describe("agents-file", () => {
  it("returns undefined when no AGENTS.md exists", () => {
    const cwd = tempCwd();
    expect(readDeployedAgentsFile(cwd, createAgentsFileCache())).toBeUndefined();
  });

  it("reads AGENTS.md content and caches by mtime", () => {
    const cwd = tempCwd();
    const cache = createAgentsFileCache();
    writeFileSync(join(cwd, "AGENTS.md"), "hello constitution", "utf8");
    const first = readDeployedAgentsFile(cwd, cache);
    expect(first?.content).toBe("hello constitution");
    // Overwrite WITHOUT changing mtime is not deterministic; instead assert cache returns same object on re-read.
    const second = readDeployedAgentsFile(cwd, cache);
    expect(second).toBe(first);
  });

  it("re-reads when the file changes", () => {
    const cwd = tempCwd();
    const cache = createAgentsFileCache();
    const path = join(cwd, "AGENTS.md");
    writeFileSync(path, "v1", "utf8");
    expect(readDeployedAgentsFile(cwd, cache)?.content).toBe("v1");
    rmSync(path);
    writeFileSync(path, "v2-much-longer-content", "utf8");
    expect(readDeployedAgentsFile(cwd, cache)?.content).toBe("v2-much-longer-content");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/knowledge/agents-file.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export type AgentsFile = { path: string; content: string };

export type AgentsFileCache = { signature?: string; value?: AgentsFile };

export function createAgentsFileCache(): AgentsFileCache {
  return {};
}

export function readDeployedAgentsFile(cwd: string, cache: AgentsFileCache): AgentsFile | undefined {
  const path = join(cwd, "AGENTS.md");
  if (!existsSync(path)) {
    cache.signature = undefined;
    cache.value = undefined;
    return undefined;
  }
  const stats = statSync(path);
  const signature = `${stats.mtimeMs}:${stats.size}`;
  if (cache.signature === signature && cache.value) {
    return cache.value;
  }
  const value: AgentsFile = { path, content: readFileSync(path, "utf8").trimEnd() };
  cache.signature = signature;
  cache.value = value;
  return value;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/knowledge/agents-file.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/knowledge/agents-file.ts tests/knowledge/agents-file.test.ts
git commit -m "feat(knowledge): add mtime-cached deployed AGENTS.md reader"
```

---

## Phase B — Skill discovery + driver gate

### Task 3: SKILL.md frontmatter parser + discovery

**Files:**
- Create: `src/knowledge/skills.ts`
- Test: `tests/knowledge/skills.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createSkillCache, discoverSkills, parseSkillFile } from "../../src/knowledge/skills.js";

function tempCwd(): string {
  return mkdtempSync(join(tmpdir(), "qb-skills-"));
}

function writeSkill(cwd: string, name: string, body: string): void {
  const dir = join(cwd, ".quailbot-pi", "skills", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), body, "utf8");
}

describe("parseSkillFile", () => {
  it("parses frontmatter and body", () => {
    const parsed = parseSkillFile(
      "---\nname: change-tip\ndescription: Change the STM tip\ndrivers: [nqctl, other]\ndomain: tip-conditioning\n---\nThe procedure.",
    );
    expect(parsed).toEqual({
      name: "change-tip",
      description: "Change the STM tip",
      drivers: ["nqctl", "other"],
      domain: "tip-conditioning",
      body: "The procedure.",
    });
  });

  it("rejects missing name or empty drivers", () => {
    expect(parseSkillFile("---\ndescription: x\ndrivers: [a]\n---\nbody")).toBeUndefined();
    expect(parseSkillFile("---\nname: x\ndescription: y\ndrivers: []\n---\nbody")).toBeUndefined();
  });
});

describe("discoverSkills", () => {
  it("discovers and sorts skills by name, skipping invalid ones", () => {
    const cwd = tempCwd();
    writeSkill(cwd, "zeta", "---\nname: zeta\ndescription: Z\ndrivers: [nqctl]\n---\nz");
    writeSkill(cwd, "alpha", "---\nname: alpha\ndescription: A\ndrivers: [nqctl]\n---\na");
    writeSkill(cwd, "broken", "no frontmatter");
    const skills = discoverSkills(cwd, createSkillCache());
    expect(skills.map((s) => s.name)).toEqual(["alpha", "zeta"]);
  });

  it("returns [] when the skills dir is absent", () => {
    expect(discoverSkills(tempCwd(), createSkillCache())).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/knowledge/skills.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { quailbotStateRoot } from "../workspace/workspace-state.js";

export type SkillInfo = {
  name: string;
  description: string;
  drivers: string[];
  domain?: string;
  body: string;
};

export type SkillCache = { entries: Map<string, { signature: string; skill: SkillInfo }> };

export function createSkillCache(): SkillCache {
  return { entries: new Map() };
}

export function skillsRoot(cwd: string): string {
  return join(quailbotStateRoot(cwd), "skills");
}

export function discoverSkills(cwd: string, cache: SkillCache): SkillInfo[] {
  const root = skillsRoot(cwd);
  if (!existsSync(root)) {
    return [];
  }
  const skills: SkillInfo[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const file = join(root, entry.name, "SKILL.md");
    if (!existsSync(file)) {
      continue;
    }
    const stats = statSync(file);
    const signature = `${stats.mtimeMs}:${stats.size}`;
    const cached = cache.entries.get(file);
    if (cached && cached.signature === signature) {
      skills.push(cached.skill);
      continue;
    }
    const parsed = parseSkillFile(readFileSync(file, "utf8"));
    if (!parsed) {
      cache.entries.delete(file);
      continue;
    }
    cache.entries.set(file, { signature, skill: parsed });
    skills.push(parsed);
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

export function parseSkillFile(content: string): SkillInfo | undefined {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(content);
  if (!match) {
    return undefined;
  }
  const [, frontmatter, body] = match;
  const fields = parseFrontmatter(frontmatter);
  const name = fields.name;
  const description = fields.description;
  const drivers = fields.drivers;
  if (typeof name !== "string" || name.length === 0) {
    return undefined;
  }
  if (typeof description !== "string" || description.length === 0) {
    return undefined;
  }
  if (!Array.isArray(drivers) || drivers.length === 0) {
    return undefined;
  }
  const skill: SkillInfo = {
    name,
    description,
    drivers: [...drivers].map((d) => String(d)).sort(),
    body: body.trim(),
  };
  if (typeof fields.domain === "string" && fields.domain.length > 0) {
    skill.domain = fields.domain;
  }
  return skill;
}

function parseFrontmatter(text: string): Record<string, string | string[]> {
  const fields: Record<string, string | string[]> = {};
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }
    const colon = line.indexOf(":");
    if (colon === -1) {
      continue;
    }
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (value.startsWith("[") && value.endsWith("]")) {
      fields[key] = value
        .slice(1, -1)
        .split(",")
        .map((item) => item.trim().replace(/^["']|["']$/g, ""))
        .filter((item) => item.length > 0);
    } else {
      fields[key] = value.replace(/^["']|["']$/g, "");
    }
  }
  return fields;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/knowledge/skills.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/knowledge/skills.ts tests/knowledge/skills.test.ts
git commit -m "feat(knowledge): add SKILL.md parser and skill discovery"
```

### Task 4: Driver-availability gate

**Files:**
- Create: `src/knowledge/driver-gate.ts`
- Test: `tests/knowledge/driver-gate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import type { Workspace, CliParameter } from "../../src/workspace/types.js";
import { buildMissingDriverWarning, driverPresent, evaluateSkillGate } from "../../src/knowledge/driver-gate.js";

function workspace(params: Array<Partial<CliParameter> & { cliName: string; name: string; enabled: boolean }>, opts?: { enabled?: boolean; defaultCliName?: string }): Workspace {
  const parameters = new Map<string, CliParameter>();
  for (const p of params) {
    const ref = `${p.cliName}:${p.name}`;
    parameters.set(ref, {
      ref, cliName: p.cliName, name: p.name, enabled: p.enabled,
      actions: { get: true, set: false, ramp: false }, linkedObservables: [], schema: {},
    } as CliParameter);
  }
  return {
    sourcePath: "x", rois: [], anchors: [],
    cli: { enabled: opts?.enabled ?? true, defaultCliName: opts?.defaultCliName ?? "nqctl", parameters, actions: new Map() },
  };
}

describe("driverPresent", () => {
  it("true when an enabled param uses the driver and cli is enabled", () => {
    expect(driverPresent(workspace([{ cliName: "nqctl", name: "bias", enabled: true }]), "nqctl")).toBe(true);
  });
  it("false when cli is disabled", () => {
    expect(driverPresent(workspace([{ cliName: "nqctl", name: "bias", enabled: true }], { enabled: false }), "nqctl")).toBe(false);
  });
  it("false when all params for the driver are disabled (default-by-name alone is not enough)", () => {
    expect(driverPresent(workspace([{ cliName: "nqctl", name: "bias", enabled: false }]), "nqctl")).toBe(false);
  });
  it("false when no workspace", () => {
    expect(driverPresent(undefined, "nqctl")).toBe(false);
  });
});

describe("evaluateSkillGate + warning", () => {
  it("reports the missing subset and renders the verbatim warning", () => {
    const ws = workspace([{ cliName: "nqctl", name: "bias", enabled: true }]);
    const gate = evaluateSkillGate(ws, { name: "change-tip", description: "d", drivers: ["nqctl", "awg"], body: "b" });
    expect(gate.missing).toEqual(["awg"]);
    const warning = buildMissingDriverWarning("change-tip", ["nqctl", "awg"], ["awg"]);
    expect(warning).toContain("[QUAILBOT WORKSPACE WARNING]");
    expect(warning).toContain('Skill "change-tip" requires CLI driver(s): awg, nqctl.');
    expect(warning).toContain("does NOT register: awg.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/knowledge/driver-gate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { Workspace } from "../workspace/types.js";
import type { SkillInfo } from "./skills.js";

export function driverPresent(workspace: Workspace | undefined, driver: string): boolean {
  if (!workspace || !workspace.cli.enabled) {
    return false;
  }
  for (const param of workspace.cli.parameters.values()) {
    if (param.enabled && param.cliName === driver) {
      return true;
    }
  }
  for (const action of workspace.cli.actions.values()) {
    if (action.enabled && action.cliName === driver) {
      return true;
    }
  }
  return false;
}

export type SkillGate = { required: string[]; missing: string[] };

export function evaluateSkillGate(workspace: Workspace | undefined, skill: SkillInfo): SkillGate {
  const required = [...skill.drivers].sort();
  const missing = required.filter((driver) => !driverPresent(workspace, driver));
  return { required, missing };
}

export function buildMissingDriverWarning(skillName: string, required: string[], missing: string[]): string {
  const requiredList = [...required].sort().join(", ");
  const missingList = [...missing].sort().join(", ");
  return [
    "[QUAILBOT WORKSPACE WARNING]",
    `Skill "${skillName}" requires CLI driver(s): ${requiredList}.`,
    `The active workspace does NOT register: ${missingList}.`,
    "These procedures cannot run against the instrument until the workspace provides",
    "the driver. Verify and re-select/reset your workspace before relying on this skill.",
  ].join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/knowledge/driver-gate.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/knowledge/driver-gate.ts tests/knowledge/driver-gate.test.ts
git commit -m "feat(knowledge): add CLI driver-availability gate"
```

---

## Phase C — Deterministic rendering + extension wiring

### Task 5: Knowledge prefix renderer

**Files:**
- Create: `src/knowledge/knowledge-render.ts`
- Test: `tests/knowledge/knowledge-render.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import type { Workspace, CliParameter } from "../../src/workspace/types.js";
import { renderKnowledgePrefix, renderSkillCatalog } from "../../src/knowledge/knowledge-render.js";
import type { SkillInfo } from "../../src/knowledge/skills.js";

function workspaceWith(driver: string): Workspace {
  const ref = `${driver}:bias`;
  const parameters = new Map<string, CliParameter>([
    [ref, { ref, cliName: driver, name: "bias", enabled: true, actions: { get: true, set: false, ramp: false }, linkedObservables: [], schema: {} } as CliParameter],
  ]);
  return { sourcePath: "x", rois: [], anchors: [], cli: { enabled: true, defaultCliName: driver, parameters, actions: new Map() } };
}

const skills: SkillInfo[] = [
  { name: "zeta", description: "Z", drivers: ["nqctl"], body: "z" },
  { name: "alpha", description: "A", drivers: ["awg"], body: "a" },
];

describe("renderSkillCatalog", () => {
  it("sorts by name and marks OK/MISSING per driver presence", () => {
    const catalog = renderSkillCatalog(skills, workspaceWith("nqctl"));
    const lines = catalog.split("\n");
    expect(lines[0]).toBe("QUAILBOT SKILLS");
    expect(catalog.indexOf("alpha")).toBeLessThan(catalog.indexOf("zeta"));
    expect(catalog).toContain("- alpha: A [drivers: awg MISSING]");
    expect(catalog).toContain("- zeta: Z [drivers: nqctl OK]");
  });

  it("is byte-identical across repeated calls (cache determinism)", () => {
    const ws = workspaceWith("nqctl");
    expect(renderSkillCatalog(skills, ws)).toBe(renderSkillCatalog(skills, ws));
  });
});

describe("renderKnowledgePrefix", () => {
  it("composes AGENTS guidance + catalog deterministically, omitting empty sections", () => {
    const prefix = renderKnowledgePrefix({
      agentsFile: { path: "/x/AGENTS.md", content: "constitution" },
      skills,
      workspace: workspaceWith("nqctl"),
    });
    expect(prefix).toContain("QUAILBOT AGENTS GUIDANCE");
    expect(prefix).toContain("constitution");
    expect(prefix.indexOf("QUAILBOT AGENTS GUIDANCE")).toBeLessThan(prefix.indexOf("QUAILBOT SKILLS"));
    const noAgents = renderKnowledgePrefix({ agentsFile: undefined, skills, workspace: undefined });
    expect(noAgents.startsWith("QUAILBOT SKILLS")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/knowledge/knowledge-render.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { Workspace } from "../workspace/types.js";
import type { AgentsFile } from "./agents-file.js";
import { evaluateSkillGate } from "./driver-gate.js";
import type { SkillInfo } from "./skills.js";

export function renderSkillCatalog(skills: SkillInfo[], workspace: Workspace | undefined): string {
  if (skills.length === 0) {
    return "QUAILBOT SKILLS\nNo skills are currently registered.";
  }
  const lines = ["QUAILBOT SKILLS", "Use the quailbot_skill tool to load a skill by name."];
  for (const skill of [...skills].sort((a, b) => a.name.localeCompare(b.name))) {
    const gate = evaluateSkillGate(workspace, skill);
    const status = gate.missing.length === 0 ? "OK" : "MISSING";
    lines.push(`- ${skill.name}: ${skill.description} [drivers: ${gate.required.join(", ")} ${status}]`);
  }
  return lines.join("\n");
}

export function renderAgentsSection(agentsFile: AgentsFile | undefined): string | undefined {
  if (!agentsFile) {
    return undefined;
  }
  return `QUAILBOT AGENTS GUIDANCE (${agentsFile.path})\n${agentsFile.content}`;
}

export function renderKnowledgePrefix(input: {
  agentsFile: AgentsFile | undefined;
  skills: SkillInfo[];
  workspace: Workspace | undefined;
  memorySection?: string;
}): string {
  return [
    renderAgentsSection(input.agentsFile),
    renderSkillCatalog(input.skills, input.workspace),
    input.memorySection,
  ]
    .filter((section): section is string => typeof section === "string" && section.length > 0)
    .join("\n\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/knowledge/knowledge-render.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/knowledge/knowledge-render.ts tests/knowledge/knowledge-render.test.ts
git commit -m "feat(knowledge): add deterministic knowledge-prefix renderer"
```

### Task 6: Knowledge runtime + extension wiring

**Files:**
- Create: `src/knowledge/knowledge-runtime.ts`
- Test: `tests/knowledge/knowledge-runtime.test.ts`
- Modify: `src/extension.ts` (runtime shape, `session_start`, `before_agent_start`, `context`)

- [ ] **Step 1: Write the failing test**

```ts
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createKnowledgeRuntime, hydrateKnowledgeRuntime, renderKnowledgePrefixFromRuntime } from "../../src/knowledge/knowledge-runtime.js";
import { saveKnowledgeState } from "../../src/knowledge/knowledge-state.js";

function tempCwd(): string {
  return mkdtempSync(join(tmpdir(), "qb-kr-"));
}

function writeSkill(cwd: string, name: string): void {
  const dir = join(cwd, ".quailbot-pi", "skills", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: ${name} desc\ndrivers: [nqctl]\n---\nbody of ${name}`, "utf8");
}

describe("knowledge-runtime", () => {
  it("hydrates loaded domains + window from disk", () => {
    const cwd = tempCwd();
    saveKnowledgeState({ loadedDomains: ["tip"], skillBodyWindow: 7 }, cwd);
    const knowledge = createKnowledgeRuntime();
    hydrateKnowledgeRuntime(knowledge, cwd);
    expect([...knowledge.loadedDomains]).toEqual(["tip"]);
    expect(knowledge.skillBodyWindow).toBe(7);
    expect(knowledge.cwd).toBe(cwd);
  });

  it("renders the prefix from disk and is byte-identical across two turns (cache stability)", () => {
    const cwd = tempCwd();
    writeSkill(cwd, "change-tip");
    const knowledge = createKnowledgeRuntime();
    hydrateKnowledgeRuntime(knowledge, cwd);
    const first = renderKnowledgePrefixFromRuntime(knowledge, undefined);
    const second = renderKnowledgePrefixFromRuntime(knowledge, undefined);
    expect(first).toBe(second);
    expect(first).toContain("- change-tip: change-tip desc [drivers: nqctl MISSING]");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/knowledge/knowledge-runtime.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the runtime implementation**

```ts
import type { Workspace } from "../workspace/types.js";
import { createAgentsFileCache, readDeployedAgentsFile, type AgentsFileCache } from "./agents-file.js";
import { renderKnowledgePrefix } from "./knowledge-render.js";
import { DEFAULT_SKILL_BODY_WINDOW, loadKnowledgeState } from "./knowledge-state.js";
import { createSkillCache, discoverSkills, type SkillCache } from "./skills.js";

export type KnowledgeRuntime = {
  cwd: string;
  loadedDomains: Set<string>;
  skillBodyWindow: number;
  skillCache: SkillCache;
  agentsCache: AgentsFileCache;
};

export function createKnowledgeRuntime(): KnowledgeRuntime {
  return {
    cwd: process.cwd(),
    loadedDomains: new Set(),
    skillBodyWindow: DEFAULT_SKILL_BODY_WINDOW,
    skillCache: createSkillCache(),
    agentsCache: createAgentsFileCache(),
  };
}

export function hydrateKnowledgeRuntime(knowledge: KnowledgeRuntime, cwd: string): void {
  knowledge.cwd = cwd;
  const state = loadKnowledgeState(cwd);
  knowledge.loadedDomains = new Set(state.loadedDomains);
  knowledge.skillBodyWindow = state.skillBodyWindow;
}

export function renderKnowledgePrefixFromRuntime(
  knowledge: KnowledgeRuntime,
  workspace: Workspace | undefined,
  memorySection?: string,
): string {
  const skills = discoverSkills(knowledge.cwd, knowledge.skillCache);
  const agentsFile = readDeployedAgentsFile(knowledge.cwd, knowledge.agentsCache);
  return renderKnowledgePrefix({ agentsFile, skills, workspace, memorySection });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/knowledge/knowledge-runtime.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire into `src/extension.ts`**

Add the import near the other imports:
```ts
import { createKnowledgeRuntime, hydrateKnowledgeRuntime, renderKnowledgePrefixFromRuntime } from "./knowledge/knowledge-runtime.js";
```

Add `knowledge` to the runtime construction (around the existing `planStore` init):
```ts
const runtime: QuailbotRuntime = {
  planStore: new PlanContextStore(),
  knowledge: createKnowledgeRuntime(),
};
```

Add `knowledge: KnowledgeRuntime` to the `QuailbotRuntime` type (import the type):
```ts
import type { KnowledgeRuntime } from "./knowledge/knowledge-runtime.js";
// ...
export type QuailbotRuntime = {
  workspace?: Workspace;
  activeWorkspace?: LoadedWorkspace;
  pendingWorkspaceActivation?: PendingWorkspaceActivation;
  workspaceUiServer?: WorkspaceUiServer;
  experimentLog?: ExperimentLogService;
  planStore: PlanContextStore;
  knowledge: KnowledgeRuntime;
};
```

In the `session_start` handler, after `runtime.workspace` is resolved, hydrate knowledge from the session cwd:
```ts
hydrateKnowledgeRuntime(runtime.knowledge, ctx.cwd);
```

In `before_agent_start`, compose the knowledge prefix into the system prompt:
```ts
const knowledgePrefix = renderKnowledgePrefixFromRuntime(runtime.knowledge, runtime.workspace);
const systemPrompt = [buildQuailbotSystemPrompt(event.systemPromptOptions), knowledgePrefix]
  .filter((part) => part.length > 0)
  .join("\n\n");
```
(Leave the existing hidden `quailbot-context` message logic unchanged.)

In the `context` handler, pass the skill-body window to the projection policy:
```ts
pi.on("context", (event) => ({
  messages: projectQuailbotContextMessages(event.messages, {
    recentFullSkillResultCount: runtime.knowledge.skillBodyWindow,
  }),
}));
```

- [ ] **Step 6: Verify build + full suite**

Run: `npm run typecheck && npm test`
Expected: typecheck clean; all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/extension.ts src/knowledge/knowledge-runtime.ts tests/knowledge/knowledge-runtime.test.ts
git commit -m "feat(knowledge): wire self-rendered knowledge prefix into before_agent_start"
```

---

## Phase D — Skill load tool + projection

### Task 7: `quailbot_skill` load tool

**Files:**
- Create: `src/tools/quailbot_skill.ts`
- Test: `tests/tools/quailbot-skill.test.ts`
- Modify: `src/tools/register-tools.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { Workspace, CliParameter } from "../../src/workspace/types.js";
import { createSkillCache } from "../../src/knowledge/skills.js";
import { executeQuailbotSkill } from "../../src/tools/quailbot_skill.js";

function tempCwd(): string {
  return mkdtempSync(join(tmpdir(), "qb-skilltool-"));
}
function writeSkill(cwd: string, name: string, drivers: string): void {
  const dir = join(cwd, ".quailbot-pi", "skills", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: d\ndrivers: ${drivers}\n---\nBODY-${name}`, "utf8");
}
function workspaceWith(driver: string): Workspace {
  const ref = `${driver}:bias`;
  return {
    sourcePath: "x", rois: [], anchors: [],
    cli: { enabled: true, defaultCliName: driver, actions: new Map(),
      parameters: new Map([[ref, { ref, cliName: driver, name: "bias", enabled: true, actions: { get: true, set: false, ramp: false }, linkedObservables: [], schema: {} } as CliParameter]]) },
  };
}

describe("executeQuailbotSkill", () => {
  it("loads the body with no warning when drivers are present", () => {
    const cwd = tempCwd();
    writeSkill(cwd, "change-tip", "[nqctl]");
    const result = executeQuailbotSkill(workspaceWith("nqctl"), cwd, createSkillCache(), { name: "change-tip" });
    expect(result).toMatchObject({ ok: true, action: "quailbot_skill", action_input: { name: "change-tip" } });
    expect(result.primary_result).toMatchObject({ name: "change-tip", missing: [], warning: undefined, body: "BODY-change-tip" });
  });

  it("includes the missing-driver warning when a driver is absent", () => {
    const cwd = tempCwd();
    writeSkill(cwd, "change-tip", "[nqctl, awg]");
    const result = executeQuailbotSkill(workspaceWith("nqctl"), cwd, createSkillCache(), { name: "change-tip" });
    const pr = result.primary_result as { missing: string[]; warning?: string };
    expect(pr.missing).toEqual(["awg"]);
    expect(pr.warning).toContain("[QUAILBOT WORKSPACE WARNING]");
  });

  it("reports not-found with the available list", () => {
    const cwd = tempCwd();
    writeSkill(cwd, "alpha", "[nqctl]");
    const result = executeQuailbotSkill(undefined, cwd, createSkillCache(), { name: "missing" });
    expect(result.ok).toBe(false);
    expect(result.primary_result).toMatchObject({ name: "missing", error: "skill_not_found", available: ["alpha"] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tools/quailbot-skill.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the executor**

```ts
import { buildMissingDriverWarning, evaluateSkillGate } from "../knowledge/driver-gate.js";
import { discoverSkills, type SkillCache } from "../knowledge/skills.js";
import type { Workspace } from "../workspace/types.js";
import type { QuailbotToolResult } from "./tool-result.js";

export type QuailbotSkillParams = { name: string };

export function executeQuailbotSkill(
  workspace: Workspace | undefined,
  cwd: string,
  skillCache: SkillCache,
  params: QuailbotSkillParams,
): QuailbotToolResult {
  const skills = discoverSkills(cwd, skillCache);
  const skill = skills.find((entry) => entry.name === params.name);
  if (!skill) {
    return {
      ok: false,
      action: "quailbot_skill",
      action_input: params,
      primary_result: { name: params.name, error: "skill_not_found", available: skills.map((entry) => entry.name) },
    };
  }
  const gate = evaluateSkillGate(workspace, skill);
  const warning = gate.missing.length > 0 ? buildMissingDriverWarning(skill.name, gate.required, gate.missing) : undefined;
  return {
    ok: true,
    action: "quailbot_skill",
    action_input: params,
    primary_result: { name: skill.name, required: gate.required, missing: gate.missing, warning, body: skill.body },
  };
}
```

- [ ] **Step 4: Register the tool in `src/tools/register-tools.ts`**

Add the import:
```ts
import { executeQuailbotSkill } from "./quailbot_skill.js";
```

Add the registration alongside the other `pi.registerTool({...})` calls (note: NO `requireWorkspace` — skills load even with no workspace so the gate can report MISSING):
```ts
pi.registerTool({
  name: "quailbot_skill",
  label: "Quailbot skill",
  description: "Load a workspace-registered Quailbot skill by name. Prepends a fixed warning if a required CLI driver is missing from the active workspace.",
  renderCall: makeQuailbotRenderCall("quailbot_skill"),
  renderResult: renderQuailbotToolResult,
  parameters: Type.Object({
    name: Type.String({ minLength: 1, description: "Skill name from the catalog in the system prompt." }),
  }),
  async execute(toolCallId, params) {
    return piToolResult(
      await executeLoggedTool(runtime, toolCallId, "quailbot_skill", params, async () =>
        executeQuailbotSkill(runtime.workspace, runtime.knowledge.cwd, runtime.knowledge.skillCache, params),
      ),
    );
  },
});
```

- [ ] **Step 5: Run tool tests + typecheck**

Run: `npm run typecheck && npm test -- tests/tools/quailbot-skill.test.ts`
Expected: PASS (3 tests), typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/tools/quailbot_skill.ts src/tools/register-tools.ts tests/tools/quailbot-skill.test.ts
git commit -m "feat(tools): add quailbot_skill load tool with driver-gate warning"
```

### Task 8: Skill-body projection (newest-N full, older stub)

**Files:**
- Modify: `src/tools/tool-result-context.ts`
- Modify: `src/tools/tool-result-projection.ts`
- Test: `tests/tools/skill-projection.test.ts`

- [ ] **Step 1: Read the projection internals first**

Open `src/tools/tool-result-projection.ts` and `src/tools/tool-result-context.ts`. Identify the exact `ProjectionOptions` type (the `mode`/`maxChars` fields), the `projectionOptions(mode, policy)` builder, the per-action body branch (`projectionBodyLines` or equivalent near lines 82-107), and `buildQuailbotToolContent`. The new code below must use those exact field names.

- [ ] **Step 2: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import type { QuailbotToolResult } from "../../src/tools/tool-result.js";
import { projectQuailbotContextMessages } from "../../src/tools/tool-result-context.js";

function skillMessage(name: string, warning?: string): { details: QuailbotToolResult; content: unknown } {
  return {
    details: {
      ok: true,
      action: "quailbot_skill",
      action_input: { name },
      primary_result: { name, required: ["nqctl"], missing: warning ? ["awg"] : [], warning, body: `BODY-${name}` },
    },
    content: [{ type: "text", text: "" }],
  };
}
function textOf(message: unknown): string {
  const content = (message as { content: Array<{ text: string }> }).content;
  return content.map((part) => part.text).join("\n");
}

describe("skill-body projection", () => {
  it("keeps the newest N=2 skill bodies full and stubs older ones", () => {
    const messages = [skillMessage("a"), skillMessage("b"), skillMessage("c")];
    const projected = projectQuailbotContextMessages(messages, { recentFullSkillResultCount: 2 });
    expect(textOf(projected[2])).toContain("BODY-c"); // newest -> full
    expect(textOf(projected[1])).toContain("BODY-b"); // 2nd newest -> full
    expect(textOf(projected[0])).toContain("re-invoke quailbot_skill"); // oldest -> stub
    expect(textOf(projected[0])).not.toContain("BODY-a");
  });

  it("renders the missing-driver warning in full mode", () => {
    const messages = [skillMessage("x", "[QUAILBOT WORKSPACE WARNING] ...")];
    const projected = projectQuailbotContextMessages(messages, { recentFullSkillResultCount: 3 });
    expect(textOf(projected[0])).toContain("[QUAILBOT WORKSPACE WARNING]");
    expect(textOf(projected[0])).toContain("BODY-x");
  });
});
```

- [ ] **Step 3: Extend `tool-result-projection.ts`**

Add a skill action predicate and a skill body branch. Match the actual `ProjectionOptions` shape found in Step 1 (assume it carries a `mode: "recent-full" | "summary"` field — rename to the real field if different):
```ts
export function isSkillAction(action: string): boolean {
  return action === "quailbot_skill";
}

function skillProjectionLines(result: QuailbotToolResult, options: ProjectionOptions): string[] {
  const pr = result.primary_result as {
    name: string;
    body?: string;
    warning?: string;
    available?: string[];
  };
  if (!result.ok) {
    return [`Skill "${pr.name}" not found. Available: ${(pr.available ?? []).join(", ")}`];
  }
  if (options.mode === "summary") {
    return [`[skill: ${pr.name}] loaded earlier; re-invoke quailbot_skill("${pr.name}") to reload its full body.`];
  }
  const lines: string[] = [];
  if (pr.warning) {
    lines.push(pr.warning, "");
  }
  lines.push(`<skill_content name="${pr.name}">`, pr.body ?? "", "</skill_content>");
  return lines;
}
```
Then, in the per-action body dispatch (the function that returns the lines for a result, near the existing `quailbot_plan_and_execute`/`quailbot_planwrite` branches), add at the top:
```ts
if (isSkillAction(result.action)) {
  return skillProjectionLines(result, options);
}
```

- [ ] **Step 4: Extend `tool-result-context.ts`**

Add a policy field and a parallel skill counter. Extend `ToolResultContextPolicy`:
```ts
export type ToolResultContextPolicy = {
  recentFullCliResultCount?: number;
  recentFullSkillResultCount?: number;
  summaryMaxChars?: number;
  fullMaxChars?: number;
};
```
In `projectQuailbotContextMessages`, add a skill limit + counter alongside the CLI ones, and choose the mode for skill results:
```ts
const recentFullSkillLimit = nonNegativeInteger(policy.recentFullSkillResultCount, DEFAULT_RECENT_FULL_SKILL_RESULT_COUNT);
let skillResultsSeen = 0;
// inside the reverse-scan loop, after computing `result`:
if (isSkillAction(result.action)) {
  const skillMode = skillResultsSeen < recentFullSkillLimit ? "recent-full" : "summary";
  skillResultsSeen += 1;
  output[index] = {
    ...(message as Record<string, unknown>),
    content: [{ type: "text", text: buildQuailbotToolContent(result, projectionOptions(skillMode, policy)) }],
  } as T;
  continue;
}
```
Import `isSkillAction` and add the default constant in `tool-result-projection.ts`:
```ts
export const DEFAULT_RECENT_FULL_SKILL_RESULT_COUNT = 3;
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npm run typecheck && npm test -- tests/tools/skill-projection.test.ts`
Expected: PASS (2 tests), typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/tools/tool-result-projection.ts src/tools/tool-result-context.ts tests/tools/skill-projection.test.ts
git commit -m "feat(tools): project skill bodies newest-N-full, older as stub"
```

---

## Phase E — Skill authoring tools (consolidation discipline)

### Task 9: Skill writer module + `quailbot_skill_write` tool

**Files:**
- Create: `src/knowledge/consolidation.ts`
- Create: `src/knowledge/skill-writer.ts`
- Create: `src/tools/quailbot_skill_write.ts`
- Test: `tests/knowledge/skill-writer.test.ts`
- Modify: `src/tools/register-tools.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { contentHash } from "../../src/knowledge/consolidation.js";
import { editSkill, renderSkillFile, skillFilePath, writeNewSkill } from "../../src/knowledge/skill-writer.js";
import { parseSkillFile } from "../../src/knowledge/skills.js";

function tempCwd(): string {
  return mkdtempSync(join(tmpdir(), "qb-writer-"));
}

describe("skill-writer", () => {
  it("renders a parseable SKILL.md", () => {
    const text = renderSkillFile({ name: "change-tip", description: "d", drivers: ["nqctl"], domain: "tip", body: "Procedure." });
    expect(parseSkillFile(text)).toEqual({ name: "change-tip", description: "d", drivers: ["nqctl"], domain: "tip", body: "Procedure." });
  });

  it("creates a new skill, refuses to overwrite, validates input", () => {
    const cwd = tempCwd();
    expect(writeNewSkill(cwd, { name: "a", description: "d", drivers: ["nqctl"], body: "x" })).toMatchObject({ created: true });
    expect(parseSkillFile(readFileSync(skillFilePath(cwd, "a"), "utf8"))?.name).toBe("a");
    expect(writeNewSkill(cwd, { name: "a", description: "d", drivers: ["nqctl"], body: "y" })).toMatchObject({ created: false, error: "skill_exists" });
    expect(writeNewSkill(cwd, { name: "b", description: "", drivers: ["nqctl"], body: "x" })).toMatchObject({ created: false, error: "invalid_input" });
    expect(writeNewSkill(cwd, { name: "c", description: "d", drivers: [], body: "x" })).toMatchObject({ created: false, error: "invalid_input" });
  });

  it("edits only when expectedOldHash matches (consolidation, anti-clobber)", () => {
    const cwd = tempCwd();
    writeNewSkill(cwd, { name: "a", description: "d", drivers: ["nqctl"], body: "old" });
    const current = readFileSync(skillFilePath(cwd, "a"), "utf8");
    expect(editSkill(cwd, "a", "deadbeef", { name: "a", description: "d", drivers: ["nqctl"], body: "new" })).toMatchObject({ updated: false, error: "stale_hash" });
    const ok = editSkill(cwd, "a", contentHash(current), { name: "a", description: "d2", drivers: ["nqctl"], body: "consolidated" });
    expect(ok).toMatchObject({ updated: true });
    expect(parseSkillFile(readFileSync(skillFilePath(cwd, "a"), "utf8"))).toMatchObject({ description: "d2", body: "consolidated" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/knowledge/skill-writer.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `src/knowledge/consolidation.ts`**

```ts
import { createHash } from "node:crypto";

export function contentHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);
}
```

- [ ] **Step 4: Implement `src/knowledge/skill-writer.ts`**

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { contentHash } from "./consolidation.js";
import { skillsRoot } from "./skills.js";

export type SkillWriteInput = {
  name: string;
  description: string;
  drivers: string[];
  domain?: string;
  body: string;
};

export function skillFilePath(cwd: string, name: string): string {
  return join(skillsRoot(cwd), name, "SKILL.md");
}

export function renderSkillFile(input: SkillWriteInput): string {
  const lines = ["---", `name: ${input.name}`, `description: ${input.description}`, `drivers: [${[...input.drivers].sort().join(", ")}]`];
  if (input.domain) {
    lines.push(`domain: ${input.domain}`);
  }
  lines.push("---", input.body.trim(), "");
  return lines.join("\n");
}

function invalid(input: SkillWriteInput): boolean {
  return (
    !input.name ||
    !input.description ||
    !Array.isArray(input.drivers) ||
    input.drivers.length === 0 ||
    input.drivers.some((driver) => typeof driver !== "string" || driver.length === 0)
  );
}

export function writeNewSkill(cwd: string, input: SkillWriteInput): { created: boolean; path: string; error?: string } {
  const path = skillFilePath(cwd, input.name);
  if (invalid(input)) {
    return { created: false, path, error: "invalid_input" };
  }
  if (existsSync(path)) {
    return { created: false, path, error: "skill_exists" };
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, renderSkillFile(input), "utf8");
  return { created: true, path };
}

export function editSkill(
  cwd: string,
  name: string,
  expectedOldHash: string,
  input: SkillWriteInput,
): { updated: boolean; path: string; error?: string; currentHash?: string } {
  const path = skillFilePath(cwd, name);
  if (invalid(input)) {
    return { updated: false, path, error: "invalid_input" };
  }
  if (!existsSync(path)) {
    return { updated: false, path, error: "skill_not_found" };
  }
  const current = readFileSync(path, "utf8");
  const currentHash = contentHash(current);
  if (currentHash !== expectedOldHash) {
    return { updated: false, path, error: "stale_hash", currentHash };
  }
  writeFileSync(path, renderSkillFile(input), "utf8");
  return { updated: true, path };
}
```

- [ ] **Step 5: Implement `src/tools/quailbot_skill_write.ts`**

```ts
import { writeNewSkill, type SkillWriteInput } from "../knowledge/skill-writer.js";
import type { QuailbotToolResult } from "./tool-result.js";

export function executeQuailbotSkillWrite(cwd: string, input: SkillWriteInput): QuailbotToolResult {
  const result = writeNewSkill(cwd, input);
  return {
    ok: result.created,
    action: "quailbot_skill_write",
    action_input: input,
    primary_result: result,
  };
}
```

- [ ] **Step 6: Register in `src/tools/register-tools.ts`**

```ts
import { executeQuailbotSkillWrite } from "./quailbot_skill_write.js";
// ...
pi.registerTool({
  name: "quailbot_skill_write",
  label: "Quailbot skill write",
  description: "Create a new Quailbot skill (SKILL.md) registered against one or more workspace CLI drivers. Fails if the skill already exists; use quailbot_skill_edit to consolidate an existing skill.",
  renderCall: makeQuailbotRenderCall("quailbot_skill_write"),
  renderResult: renderQuailbotToolResult,
  parameters: Type.Object({
    name: Type.String({ minLength: 1 }),
    description: Type.String({ minLength: 1 }),
    drivers: Type.Array(Type.String({ minLength: 1 }), { minItems: 1, description: "Required CLI driver name(s)." }),
    domain: Type.Optional(Type.String({ minLength: 1, description: "Optional memory domain link." })),
    body: Type.String({ minLength: 1, description: "The general procedure (markdown)." }),
  }),
  async execute(toolCallId, params) {
    return piToolResult(
      await executeLoggedTool(runtime, toolCallId, "quailbot_skill_write", params, async () =>
        executeQuailbotSkillWrite(runtime.knowledge.cwd, params),
      ),
    );
  },
});
```

- [ ] **Step 7: Run tests + typecheck**

Run: `npm run typecheck && npm test -- tests/knowledge/skill-writer.test.ts`
Expected: PASS (3 tests), typecheck clean.

- [ ] **Step 8: Commit**

```bash
git add src/knowledge/consolidation.ts src/knowledge/skill-writer.ts src/tools/quailbot_skill_write.ts src/tools/register-tools.ts tests/knowledge/skill-writer.test.ts
git commit -m "feat(knowledge): add skill writer + quailbot_skill_write tool"
```

### Task 10: `quailbot_skill_edit` tool (consolidate)

**Files:**
- Create: `src/tools/quailbot_skill_edit.ts`
- Test: `tests/tools/quailbot-skill-edit.test.ts`
- Modify: `src/tools/register-tools.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { contentHash } from "../../src/knowledge/consolidation.js";
import { skillFilePath, writeNewSkill } from "../../src/knowledge/skill-writer.js";
import { executeQuailbotSkillEdit } from "../../src/tools/quailbot_skill_edit.js";

function tempCwd(): string {
  return mkdtempSync(join(tmpdir(), "qb-edit-"));
}

describe("executeQuailbotSkillEdit", () => {
  it("rejects a stale hash and returns the current hash for retry", () => {
    const cwd = tempCwd();
    writeNewSkill(cwd, { name: "a", description: "d", drivers: ["nqctl"], body: "old" });
    const result = executeQuailbotSkillEdit(cwd, { name: "a", expected_old_hash: "bad", description: "d", drivers: ["nqctl"], body: "new" });
    expect(result.ok).toBe(false);
    expect(result.primary_result).toMatchObject({ error: "stale_hash" });
  });

  it("consolidates when the hash matches", () => {
    const cwd = tempCwd();
    writeNewSkill(cwd, { name: "a", description: "d", drivers: ["nqctl"], body: "old" });
    const hash = contentHash(readFileSync(skillFilePath(cwd, "a"), "utf8"));
    const result = executeQuailbotSkillEdit(cwd, { name: "a", expected_old_hash: hash, description: "d", drivers: ["nqctl"], body: "consolidated" });
    expect(result.ok).toBe(true);
    expect(readFileSync(skillFilePath(cwd, "a"), "utf8")).toContain("consolidated");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tools/quailbot-skill-edit.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/tools/quailbot_skill_edit.ts`**

```ts
import { editSkill } from "../knowledge/skill-writer.js";
import type { QuailbotToolResult } from "./tool-result.js";

export type QuailbotSkillEditParams = {
  name: string;
  expected_old_hash: string;
  description: string;
  drivers: string[];
  domain?: string;
  body: string;
};

export function executeQuailbotSkillEdit(cwd: string, params: QuailbotSkillEditParams): QuailbotToolResult {
  const result = editSkill(cwd, params.name, params.expected_old_hash, {
    name: params.name,
    description: params.description,
    drivers: params.drivers,
    domain: params.domain,
    body: params.body,
  });
  return {
    ok: result.updated,
    action: "quailbot_skill_edit",
    action_input: params,
    primary_result: result,
  };
}
```

- [ ] **Step 4: Register in `src/tools/register-tools.ts`**

```ts
import { executeQuailbotSkillEdit } from "./quailbot_skill_edit.js";
// ...
pi.registerTool({
  name: "quailbot_skill_edit",
  label: "Quailbot skill edit",
  description: "Consolidate an existing skill: read it, then submit the rewritten body with expected_old_hash (the contentHash of the current SKILL.md). Rejects stale hashes so changes integrate rather than blindly overwrite.",
  renderCall: makeQuailbotRenderCall("quailbot_skill_edit"),
  renderResult: renderQuailbotToolResult,
  parameters: Type.Object({
    name: Type.String({ minLength: 1 }),
    expected_old_hash: Type.String({ minLength: 1, description: "contentHash of the current SKILL.md (from loading the skill first)." }),
    description: Type.String({ minLength: 1 }),
    drivers: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
    domain: Type.Optional(Type.String({ minLength: 1 })),
    body: Type.String({ minLength: 1, description: "The consolidated procedure (full replacement)." }),
  }),
  async execute(toolCallId, params) {
    return piToolResult(
      await executeLoggedTool(runtime, toolCallId, "quailbot_skill_edit", params, async () =>
        executeQuailbotSkillEdit(runtime.knowledge.cwd, params),
      ),
    );
  },
});
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npm run typecheck && npm test -- tests/tools/quailbot-skill-edit.test.ts`
Expected: PASS (2 tests), typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/tools/quailbot_skill_edit.ts src/tools/register-tools.ts tests/tools/quailbot-skill-edit.test.ts
git commit -m "feat(tools): add quailbot_skill_edit consolidation tool"
```

---

## Phase F — Commands

### Task 11: `/quailbot-skills` and `/quailbot-reload` commands

**Files:**
- Create: `src/knowledge/register-knowledge-commands.ts`
- Test: `tests/knowledge/skills-command.test.ts`
- Modify: `src/workspace/register-workspace-commands.ts` (export `splitCommandArgs`)
- Modify: `src/extension.ts` (register the commands)

- [ ] **Step 1: Export the arg splitter**

In `src/workspace/register-workspace-commands.ts`, change `function splitCommandArgs` to `export function splitCommandArgs` (single-word edit; keep behavior identical).

- [ ] **Step 2: Write the failing test**

```ts
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { createKnowledgeRuntime, hydrateKnowledgeRuntime } from "../../src/knowledge/knowledge-runtime.js";
import { loadKnowledgeState } from "../../src/knowledge/knowledge-state.js";
import { handleSkillsCommand } from "../../src/knowledge/register-knowledge-commands.js";

function tempCwd(): string {
  return mkdtempSync(join(tmpdir(), "qb-cmd-"));
}
function writeSkill(cwd: string, name: string): void {
  const dir = join(cwd, ".quailbot-pi", "skills", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: d\ndrivers: [nqctl]\n---\nbody`, "utf8");
}
function fakeCtx() {
  return { ui: { notify: vi.fn() }, reload: vi.fn() } as never;
}
function runtimeFor(cwd: string) {
  const knowledge = createKnowledgeRuntime();
  hydrateKnowledgeRuntime(knowledge, cwd);
  return { knowledge, workspace: undefined } as never;
}

describe("handleSkillsCommand", () => {
  it("lists the catalog", async () => {
    const cwd = tempCwd();
    writeSkill(cwd, "change-tip");
    const runtime = runtimeFor(cwd);
    const ctx = fakeCtx();
    await handleSkillsCommand("list", ctx, runtime);
    expect((ctx as { ui: { notify: ReturnType<typeof vi.fn> } }).ui.notify).toHaveBeenCalledWith(expect.stringContaining("change-tip"), "info");
  });

  it("sets and persists the skill-body window", async () => {
    const cwd = tempCwd();
    const runtime = runtimeFor(cwd);
    await handleSkillsCommand("window 5", fakeCtx(), runtime);
    expect((runtime as { knowledge: { skillBodyWindow: number } }).knowledge.skillBodyWindow).toBe(5);
    expect(loadKnowledgeState(cwd).skillBodyWindow).toBe(5);
  });

  it("rejects a non-positive window", async () => {
    const cwd = tempCwd();
    const runtime = runtimeFor(cwd);
    const ctx = fakeCtx();
    await handleSkillsCommand("window 0", ctx, runtime);
    expect((ctx as { ui: { notify: ReturnType<typeof vi.fn> } }).ui.notify).toHaveBeenCalledWith(expect.stringContaining("positive"), "warning");
  });
});
```

- [ ] **Step 3: Implement `src/knowledge/register-knowledge-commands.ts`**

Mirror the import style of `src/workspace/register-workspace-commands.ts` for `ExtensionAPI` / `ExtensionCommandContext`.
```ts
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import type { QuailbotRuntime } from "../extension.js";
import { splitCommandArgs } from "../workspace/register-workspace-commands.js";
import { renderSkillCatalog } from "./knowledge-render.js";
import { saveKnowledgeState } from "./knowledge-state.js";
import { discoverSkills } from "./skills.js";

export function registerKnowledgeCommands(pi: ExtensionAPI, runtime: QuailbotRuntime): void {
  pi.registerCommand("quailbot-skills", {
    description: "List Quailbot skills, or set the skill-body context window",
    getArgumentCompletions(prefix) {
      return ["list", "window"].filter((command) => command.startsWith(prefix.trim())).map((command) => ({ value: command, label: command }));
    },
    async handler(args, ctx) {
      await handleSkillsCommand(args, ctx, runtime);
    },
  });

  pi.registerCommand("quailbot-reload", {
    description: "Reload Quailbot extensions, skills, and prompts (manual full refresh)",
    async handler(_args, ctx) {
      await ctx.reload();
    },
  });
}

export async function handleSkillsCommand(args: string, ctx: ExtensionCommandContext, runtime: QuailbotRuntime): Promise<void> {
  const [sub = "list", ...rest] = splitCommandArgs(args);
  if (sub === "window") {
    const value = Number(rest[0]);
    if (!Number.isInteger(value) || value <= 0) {
      ctx.ui.notify("Usage: /quailbot-skills window <positive integer>", "warning");
      return;
    }
    runtime.knowledge.skillBodyWindow = value;
    saveKnowledgeState({ loadedDomains: [...runtime.knowledge.loadedDomains], skillBodyWindow: value }, runtime.knowledge.cwd);
    ctx.ui.notify(`Quailbot skill-body window set to ${value}.`, "info");
    return;
  }
  const skills = discoverSkills(runtime.knowledge.cwd, runtime.knowledge.skillCache);
  ctx.ui.notify(renderSkillCatalog(skills, runtime.workspace), "info");
}
```

- [ ] **Step 4: Register in `src/extension.ts`**

```ts
import { registerKnowledgeCommands } from "./knowledge/register-knowledge-commands.js";
// ... alongside the other register*() calls:
registerKnowledgeCommands(pi, runtime);
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npm run typecheck && npm test -- tests/knowledge/skills-command.test.ts`
Expected: PASS (3 tests), typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/knowledge/register-knowledge-commands.ts src/workspace/register-workspace-commands.ts src/extension.ts tests/knowledge/skills-command.test.ts
git commit -m "feat(knowledge): add /quailbot-skills and /quailbot-reload commands"
```

---

## Final verification

- [ ] **Run the full suite + typecheck + build**

Run: `npm run typecheck && npm test && npm run build`
Expected: typecheck clean, all tests PASS, build succeeds.

- [ ] **Manual acceptance (spec §13 scenarios 1, 4, 5, 7, 8, 9)**

In a session with a workspace registering+enabling `nqctl`, plus `.quailbot-pi/skills/change-tip/SKILL.md` (`drivers: [nqctl]`):
1. Catalog shows `change-tip ... [drivers: nqctl OK]`; `quailbot_skill("change-tip")` loads the body with no warning.
2. Switch to a workspace without `nqctl` (or with it disabled) → catalog shows `[MISSING]`; loading prepends the verbatim warning.
3. `quailbot_skill_write` a new skill → it appears in the catalog on the next turn (no reload).
4. `/quailbot-skills window 1`, load two skills → only the newest body stays full.

---

## Self-review (completed by plan author)

- **Spec coverage:** Skills half of the spec — §4 layout, §5 prefix+normalization, §6 driver gate, §7 skill tools, §8 `/quailbot-skills` window, §9 consolidation (skill_edit hash), §10 self-render wiring, §11 AGENTS.md prefix render, §12 skill projection, §13 scenarios 1/4/5/7/8/9 — all covered. Memory half (§7 memory tools, §8 `/quailbot-memory` menu, §13 scenarios 2/3/6) is intentionally deferred to Plan 2.
- **Type consistency:** `QuailbotToolResult` shape, `SkillInfo`, `KnowledgeRuntime`, `contentHash`, `skillsRoot`/`skillFilePath`, `recentFullSkillResultCount`, `evaluateSkillGate` are used consistently across tasks.
- **Known integration point to verify during execution (Task 8):** the exact `ProjectionOptions` field name for mode — confirm against `tool-result-projection.ts` and align the `skillProjectionLines` branch (the test pins the required behavior regardless of internal field names).

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-18-quailbot-knowledge-foundation-and-skills.md`.** Plan 2 (memory subsystem) will be written next, building on this foundation.

Two execution options:
1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks (uses superpowers:subagent-driven-development).
2. **Inline Execution** — execute tasks in this session with checkpoints (uses superpowers:executing-plans).
