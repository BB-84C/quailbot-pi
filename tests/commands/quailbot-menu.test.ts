import { describe, expect, it, vi } from "vitest";

import { closeQuailbotMenuThenRun, openQuailbotSettingsMenu } from "../../src/commands/quailbot-menu.js";

type CustomFactory = (tui: unknown, theme: unknown, keybindings: unknown, done: (value?: unknown) => void) => unknown;

/**
 * Fake ctx.ui.custom mirroring Pi's semantics: the returned promise resolves only when the
 * component calls done(). Menu components are constructed with pi-tui primitives, which run
 * fine without a live terminal.
 */
function fakeCtx() {
  let resolveCustom: (() => void) | undefined;
  const ctx = {
    ui: {
      notify: vi.fn(),
      custom: vi.fn(async (factory: CustomFactory) => {
        await new Promise<void>((resolve) => {
          resolveCustom = resolve;
          factory(undefined, undefined, undefined, () => resolve());
        });
      }),
    },
  };
  return { ctx: ctx as never, wasOpened: () => resolveCustom !== undefined };
}

describe("closeQuailbotMenuThenRun", () => {
  it("runs the action only after the open menu promise resolves, and openQuailbotSettingsMenu awaits it", async () => {
    const { ctx } = fakeCtx();
    const order: string[] = [];

    const menuPromise = openQuailbotSettingsMenu(ctx, []).then(() => {
      order.push("menu-open-returned");
    });
    // Allow ctx.ui.custom to invoke the factory and register the close hook.
    await Promise.resolve();

    closeQuailbotMenuThenRun(async () => {
      order.push("action-start");
      await Promise.resolve();
      order.push("action-end");
    });
    order.push("close-requested");

    await menuPromise;
    // The deferred action must run after close was requested (menu promise resolved first),
    // and openQuailbotSettingsMenu must not resolve until the action completed.
    expect(order).toEqual(["close-requested", "action-start", "action-end", "menu-open-returned"]);
  });

  it("runs the action directly when no menu is open", async () => {
    const ran = new Promise<string>((resolve) => {
      closeQuailbotMenuThenRun(() => resolve("ran"));
    });
    await expect(ran).resolves.toBe("ran");
  });

  it("clears the close hook after the menu closes", async () => {
    const { ctx } = fakeCtx();
    const menuPromise = openQuailbotSettingsMenu(ctx, []);
    await Promise.resolve();
    closeQuailbotMenuThenRun(() => undefined);
    await menuPromise;

    // A later action with no open menu must execute immediately instead of re-triggering
    // the stale close hook.
    const ran = new Promise<string>((resolve) => {
      closeQuailbotMenuThenRun(() => resolve("direct"));
    });
    await expect(ran).resolves.toBe("direct");
  });
});
