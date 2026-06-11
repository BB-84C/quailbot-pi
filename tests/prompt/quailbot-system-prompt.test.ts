import { describe, expect, it } from "vitest";
import type { BuildSystemPromptOptions } from "@earendil-works/pi-coding-agent";

import { buildQuailbotSystemPrompt } from "../../src/prompt/quailbot-system-prompt.js";

describe("Quailbot system prompt", () => {
  it("builds Quailbot identity around quantum action-outcome uncertainty", () => {
    const prompt = buildQuailbotSystemPrompt({
      cwd: "D:\\vault-lab",
      selectedTools: ["read", "edit", "write", "bash", "grep", "cli_get"],
      toolSnippets: {
        read: "Read file contents",
        edit: "Make precise file edits",
        write: "Create or overwrite files",
        bash: "Execute shell commands",
        grep: "Search file contents",
        cli_get: "Read a workspace-approved quantum instrument CLI parameter",
      },
      promptGuidelines: ["Use edit for surgical file changes"],
    } satisfies BuildSystemPromptOptions);

    expect(prompt).toContain("You are Quailbot: a quantum uncertain action-outcome instrument loop agent.");
    expect(prompt).toContain("an action is not the same thing as its outcome");
    expect(prompt).toContain("An AWG pulse may be intended to flip a qubit");
    expect(prompt).toContain("An STM tip pulse may be intended to sharpen or clean the tip");
    expect(prompt).toContain("allowed quantum instrument CLI parameters");
    expect(prompt).toContain("Unexpected or undesirable outcomes are not automatically failures");
    expect(prompt).toContain("Stop and report a limiting condition only when policy forbids the action");
  });

  it("does not render transport-level tool metadata into the system prompt", () => {
    const prompt = buildQuailbotSystemPrompt({
      cwd: "D:\\vault-lab",
      selectedTools: ["read", "edit", "write", "bash", "grep"],
      toolSnippets: {
        read: "Read file contents",
        edit: "Make precise file edits",
        write: "Create or overwrite files",
        bash: "Execute shell commands",
        grep: "Search file contents",
      },
      promptGuidelines: ["Use edit for surgical file changes"],
    } satisfies BuildSystemPromptOptions);

    expect(prompt).toContain("current tool schema");
    expect(prompt).toContain("linked-observable readback");
    expect(prompt).toContain("mutation policy");
    expect(prompt).toContain("Quailbot support-tool boundaries");
    expect(prompt).toContain("Instrument operations use WORKSPACE-declared Quailbot tools first");
    expect(prompt).toContain("File and shell tools are support tools");
    expect(prompt).toContain("Do not use file or shell tools to bypass WORKSPACE capability");
    expect(prompt).toContain("- read: inspect local files and workspace documents before editing");
    expect(prompt).toContain("- edit: make precise local file changes only when file editing is part of the task");
    expect(prompt).toContain("- write: create new local files or perform complete rewrites only");
    expect(prompt).toContain("- bash: run local development or diagnostic commands only");
    expect(prompt).toContain("Current working directory: D:/vault-lab");
    expect(prompt).not.toContain("Available tools:");
    expect(prompt).not.toContain("Other runtime tools");
    expect(prompt).not.toContain("Read file contents");
    expect(prompt).not.toContain("Execute shell commands");
    expect(prompt).not.toContain("Use edit for surgical file changes");
    expect(prompt).not.toContain("Be concise in your responses");
  });

  it("gates support-tool bullets by selected tools without copying raw metadata", () => {
    const prompt = buildQuailbotSystemPrompt({
      cwd: "D:\\vault-lab",
      selectedTools: ["read"],
      toolSnippets: {
        read: "Raw read snippet must not appear",
        bash: "Raw bash snippet must not appear",
      },
      promptGuidelines: ["Raw guideline must not appear"],
    });

    expect(prompt).toContain("Quailbot support-tool boundaries");
    expect(prompt).toContain("- read: inspect local files and workspace documents before editing");
    expect(prompt).not.toContain("- edit: make precise local file changes only when file editing is part of the task");
    expect(prompt).not.toContain("- write: create new local files or perform complete rewrites only");
    expect(prompt).not.toContain("- bash: run local development or diagnostic commands only");
    expect(prompt).not.toContain("Raw read snippet must not appear");
    expect(prompt).not.toContain("Raw bash snippet must not appear");
    expect(prompt).not.toContain("Raw guideline must not appear");
  });

  it("does not include legacy or internal identity wording", () => {
    const prompt = buildQuailbotSystemPrompt({ cwd: "D:\\vault-lab" });

    for (const forbidden of [
      "Pi",
      "coding assistant",
      "MCP tool",
      "ReAct",
      "Plan+Execute",
      "wait_until",
      "chain-of-thought",
      "Keep narration short",
    ]) {
      expect(prompt).not.toContain(forbidden);
    }
  });

  it("ignores context files and skills that could reintroduce internal project text", () => {
    const prompt = buildQuailbotSystemPrompt({
      cwd: "D:\\vault-lab",
      contextFiles: [
        {
          path: "AGENTS.md",
          content: "Pi coding assistant ReAct wait_until internal engineering decision",
        },
      ],
      skills: [
        {
          name: "internal-pi-skill",
          description: "coding assistant helper",
          filePath: "D:/quailbot-pi/.opencode/skills/internal/SKILL.md",
        } as NonNullable<BuildSystemPromptOptions["skills"]>[number],
      ],
    });

    expect(prompt).not.toContain("internal engineering decision");
    expect(prompt).not.toContain("internal-pi-skill");
    expect(prompt).not.toContain("coding assistant helper");
    expect(prompt).not.toContain("Pi");
    expect(prompt).not.toContain("wait_until");
  });

  it("ignores poisoned tool snippets and prompt guidelines instead of filtering them into support sections", () => {
    const prompt = buildQuailbotSystemPrompt({
      cwd: "D:\\vault-lab",
      selectedTools: ["read", "bash", "cli_get"],
      toolSnippets: {
        read: "Read file contents",
        bash: "Pi coding assistant shell helper",
        cli_get: "MCP tool for ReAct Plan+Execute wait_until chain-of-thought",
      },
      promptGuidelines: [
        "Use dedicated tools for file exploration",
        "Pi coding assistant should keep narration short",
        "Be concise in your responses",
      ],
    });

    expect(prompt).not.toContain("Available tools:");
    expect(prompt).not.toContain("Read file contents");
    expect(prompt).not.toContain("Use dedicated tools for file exploration");
    for (const forbidden of [
      "Pi",
      "coding assistant",
      "MCP tool",
      "ReAct",
      "Plan+Execute",
      "wait_until",
      "chain-of-thought",
      "keep narration short",
      "Be concise in your responses",
    ]) {
      expect(prompt).not.toContain(forbidden);
    }
  });

  it("keeps a stable prompt without available-tools or guidelines sections when snippets are absent", () => {
    const prompt = buildQuailbotSystemPrompt({
      cwd: "D:\\vault-lab",
      selectedTools: ["read", "bash"],
    });

    expect(prompt).toContain("current tool schema");
    expect(prompt).toContain("Quailbot support-tool boundaries");
    expect(prompt).toContain("- read: inspect local files and workspace documents before editing");
    expect(prompt).toContain("- bash: run local development or diagnostic commands only");
    expect(prompt).not.toContain("Available tools:");
    expect(prompt).toContain("Current date: ");
  });
});
