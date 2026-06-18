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
