import { describe, expect, it } from "vitest";

import { PlanContextStore } from "../../src/prompt/plan-context.js";
import { executeQuailbotPlanwrite } from "../../src/tools/quailbot_planwrite.js";
import { registerQuailbotTools } from "../../src/tools/register-tools.js";

describe("quailbot_planwrite", () => {
  it("stores system plan text in the plan context store", async () => {
    const store = new PlanContextStore();

    const result = await executeQuailbotPlanwrite(store, { mode: "system", text: "Run the alignment check." });

    expect(store.get()).toBe("Run the alignment check.");
    expect(result).toMatchObject({
      ok: true,
      action: "quailbot_planwrite",
      action_input: { mode: "system", text: "Run the alignment check." },
      primary_result: {
        mode: "system",
        cleaned: false,
        persisted: true,
        text: "Run the alignment check.",
      },
    });
  });

  it("clears the persistent plan when clean is true", async () => {
    const store = new PlanContextStore();
    store.set("Previous plan");

    const result = await executeQuailbotPlanwrite(store, { mode: "system", text: "", clean: true });

    expect(store.get()).toBe("");
    expect(result.primary_result).toMatchObject({ mode: "system", cleaned: true, persisted: false, text: "" });
  });

  it("does not modify the store in ephemeral mode", async () => {
    const store = new PlanContextStore();
    store.set("Persistent plan");

    const result = await executeQuailbotPlanwrite(store, { mode: "ephemeral", text: "Temporary note" });

    expect(store.get()).toBe("Persistent plan");
    expect(result).toMatchObject({
      ok: true,
      primary_result: {
        mode: "ephemeral",
        cleaned: false,
        persisted: false,
        text: "Temporary note",
      },
    });
  });

  it("does not overwrite the store with empty system text when clean is false", async () => {
    const store = new PlanContextStore();
    store.set("Existing plan");

    const result = await executeQuailbotPlanwrite(store, { mode: "system", text: "   " });

    expect(store.get()).toBe("Existing plan");
    expect(result.primary_result).toMatchObject({ mode: "system", cleaned: false, persisted: false, text: "   " });
  });

  it("registers the tool and returns the JSON result envelope", async () => {
    const tools: Array<{
      name: string;
      parameters: { properties?: Record<string, unknown> };
      execute: (id: string, params: unknown) => Promise<unknown>;
    }> = [];
    const store = new PlanContextStore();
    const pi = {
      registerTool: (tool: {
        name: string;
        parameters: { properties?: Record<string, unknown> };
        execute: (id: string, params: unknown) => Promise<unknown>;
      }) => tools.push(tool),
    };

    registerQuailbotTools(pi as never, { planStore: store } as never);

    const tool = tools.find((tool) => tool.name === "quailbot_planwrite");
    expect(tool).toBeDefined();
    expect(tool?.parameters.properties?.text).toMatchObject({ type: "string" });
    expect(tool?.parameters.properties?.clean).toMatchObject({ type: "boolean" });

    const result = await tool?.execute("tool-call", { mode: "system", text: "Registered plan" });

    expect(store.get()).toBe("Registered plan");
    expect(result).toMatchObject({
      details: { ok: true, action: "quailbot_planwrite", primary_result: { persisted: true } },
      content: [{ type: "text" }],
    });
  });
});
