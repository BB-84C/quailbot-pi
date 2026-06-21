import { describe, expect, it } from "vitest";

import { attachMenuEvents } from "../../../src/workspace-ui/client/events/menu.js";
import { renderMenu, WORKSPACE_HELP_TEXT } from "../../../src/workspace-ui/client/render/menu.js";

function labels(root: HTMLElement): string[] {
  return [...root.querySelectorAll("button")].map((node) => node.textContent ?? "");
}

describe("workspace menu and help", () => {
  it("renders the A3 Tk menu surface without dropped activation entries", () => {
    const menuRoot = document.createElement("nav");

    renderMenu(menuRoot);

    expect([...menuRoot.querySelectorAll<HTMLButtonElement>('button[data-action="menu-toggle"]')].map((button) => button.textContent)).toEqual(["File", "Help"]);
    expect(menuRoot.querySelector<HTMLElement>('[data-menu-panel="file"]')?.hidden).toBe(true);
    expect(labels(menuRoot.querySelector<HTMLElement>('[data-menu-panel="file"]')!)).toEqual(["Load workspace...", "Export workspace..."]);
    expect(labels(menuRoot.querySelector<HTMLElement>('[data-menu-panel="help"]')!)).toEqual(["Show help"]);
    expect(menuRoot.textContent).not.toContain("Set agent workspace");
    expect(menuRoot.textContent).not.toContain("Use current workspace for agent");
  });

  it("opens and closes Tk-style dropdown menus", () => {
    const menuRoot = document.createElement("nav");
    const helpRoot = document.createElement("section");
    document.body.replaceChildren(menuRoot, helpRoot);
    renderMenu(menuRoot);
    const off = attachMenuEvents({ menuRoot, helpRoot });

    menuRoot.querySelector<HTMLButtonElement>('button[data-action="menu-toggle"][data-menu="file"]')?.click();
    expect(menuRoot.querySelector<HTMLButtonElement>('button[data-menu="file"]')?.getAttribute("aria-expanded")).toBe("true");
    expect(menuRoot.querySelector<HTMLElement>('[data-menu-panel="file"]')?.hidden).toBe(false);

    menuRoot.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(menuRoot.querySelector<HTMLButtonElement>('button[data-menu="file"]')?.getAttribute("aria-expanded")).toBe("false");
    expect(menuRoot.querySelector<HTMLElement>('[data-menu-panel="file"]')?.hidden).toBe(true);
    off();
  });

  it("opens File and Help menus through Tk-style Alt accelerators", () => {
    const menuRoot = document.createElement("nav");
    const helpRoot = document.createElement("section");
    document.body.replaceChildren(menuRoot, helpRoot);
    renderMenu(menuRoot);
    const off = attachMenuEvents({ menuRoot, helpRoot });

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "f", altKey: true, bubbles: true }));
    expect(menuRoot.querySelector<HTMLButtonElement>('button[data-menu="file"]')?.getAttribute("aria-expanded")).toBe("true");
    expect(menuRoot.querySelector<HTMLElement>('[data-menu-panel="file"]')?.hidden).toBe(false);
    expect(document.activeElement?.textContent).toBe("Load workspace...");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "h", altKey: true, bubbles: true }));
    expect(menuRoot.querySelector<HTMLButtonElement>('button[data-menu="file"]')?.getAttribute("aria-expanded")).toBe("false");
    expect(menuRoot.querySelector<HTMLButtonElement>('button[data-menu="help"]')?.getAttribute("aria-expanded")).toBe("true");
    expect(menuRoot.querySelector<HTMLElement>('[data-menu-panel="help"]')?.hidden).toBe(false);
    expect(document.activeElement?.textContent).toBe("Show help");
    off();
  });

  it("opens File from the Windows-style Alt prefix sequence", () => {
    const menuRoot = document.createElement("nav");
    const helpRoot = document.createElement("section");
    document.body.replaceChildren(menuRoot, helpRoot);
    renderMenu(menuRoot);
    const off = attachMenuEvents({ menuRoot, helpRoot });

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Alt", bubbles: true }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "f", bubbles: true }));

    expect(menuRoot.querySelector<HTMLButtonElement>('button[data-menu="file"]')?.getAttribute("aria-expanded")).toBe("true");
    expect(menuRoot.querySelector<HTMLElement>('[data-menu-panel="file"]')?.hidden).toBe(false);
    expect(document.activeElement?.textContent).toBe("Load workspace...");
    off();
  });

  it("closes dropdown menus on global Escape and outside pointer activation", () => {
    const menuRoot = document.createElement("nav");
    const helpRoot = document.createElement("section");
    const outside = document.createElement("button");
    document.body.replaceChildren(menuRoot, helpRoot, outside);
    renderMenu(menuRoot);
    const off = attachMenuEvents({ menuRoot, helpRoot });

    menuRoot.querySelector<HTMLButtonElement>('button[data-action="menu-toggle"][data-menu="file"]')?.click();
    outside.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(menuRoot.querySelector<HTMLButtonElement>('button[data-menu="file"]')?.getAttribute("aria-expanded")).toBe("false");
    expect(menuRoot.querySelector<HTMLElement>('[data-menu-panel="file"]')?.hidden).toBe(true);

    menuRoot.querySelector<HTMLButtonElement>('button[data-action="menu-toggle"][data-menu="file"]')?.click();
    outside.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, button: 0 }));
    expect(menuRoot.querySelector<HTMLButtonElement>('button[data-menu="file"]')?.getAttribute("aria-expanded")).toBe("false");
    expect(menuRoot.querySelector<HTMLElement>('[data-menu-panel="file"]')?.hidden).toBe(true);
    off();
  });

  it("keeps an open dropdown across background re-renders", () => {
    const menuRoot = document.createElement("nav");
    const helpRoot = document.createElement("section");
    document.body.replaceChildren(menuRoot, helpRoot);
    renderMenu(menuRoot);
    const off = attachMenuEvents({ menuRoot, helpRoot });

    menuRoot.querySelector<HTMLButtonElement>('button[data-action="menu-toggle"][data-menu="file"]')?.click();
    renderMenu(menuRoot);

    expect(menuRoot.querySelector<HTMLButtonElement>('button[data-menu="file"]')?.getAttribute("aria-expanded")).toBe("true");
    expect(menuRoot.querySelector<HTMLElement>('[data-menu-panel="file"]')?.hidden).toBe(false);
    off();
  });

  it("opens the canonical Tk help text and closes on Escape", () => {
    const menuRoot = document.createElement("nav");
    const helpRoot = document.createElement("section");
    document.body.replaceChildren(menuRoot, helpRoot);
    renderMenu(menuRoot);
    const off = attachMenuEvents({ menuRoot, helpRoot });

    menuRoot.querySelector<HTMLButtonElement>('button[data-action="menu-toggle"][data-menu="help"]')?.click();
    menuRoot.querySelector<HTMLButtonElement>('button[data-action="help-show"]')?.click();

    expect(helpRoot.querySelector('[role="dialog"]')).not.toBeNull();
    expect(helpRoot.textContent).toContain(WORKSPACE_HELP_TEXT);

    helpRoot.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(helpRoot.childElementCount).toBe(0);
    off();
  });

  it("opens help through pointer activation in embedded browser surfaces", () => {
    const menuRoot = document.createElement("nav");
    const helpRoot = document.createElement("section");
    document.body.replaceChildren(menuRoot, helpRoot);
    renderMenu(menuRoot);
    const off = attachMenuEvents({ menuRoot, helpRoot });

    menuRoot.querySelector<HTMLButtonElement>('button[data-action="menu-toggle"][data-menu="help"]')?.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, button: 0 }));
    menuRoot.querySelector<HTMLButtonElement>('button[data-action="help-show"]')?.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, button: 0 }));

    expect(helpRoot.querySelector('[role="dialog"]')).not.toBeNull();
    expect(helpRoot.textContent).toContain(WORKSPACE_HELP_TEXT);
    off();
  });

  it("closes help when focus leaves the transient dialog", async () => {
    const menuRoot = document.createElement("nav");
    const helpRoot = document.createElement("section");
    const outside = document.createElement("button");
    document.body.replaceChildren(menuRoot, helpRoot, outside);
    renderMenu(menuRoot);
    const off = attachMenuEvents({ menuRoot, helpRoot });

    menuRoot.querySelector<HTMLButtonElement>('button[data-action="menu-toggle"][data-menu="help"]')?.click();
    menuRoot.querySelector<HTMLButtonElement>('button[data-action="help-show"]')?.click();
    outside.focus();
    helpRoot.querySelector<HTMLElement>('[role="dialog"]')?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(helpRoot.childElementCount).toBe(0);
    off();
  });
});
