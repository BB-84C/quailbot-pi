import { closeHelpModal, renderHelpModal } from "../render/menu.js";
import { attachScopedActivation, attachScopedEvent, closestWithin } from "./delegation.js";

function setMenuOpen(menuRoot: HTMLElement, menu: string | null): void {
  for (const trigger of menuRoot.querySelectorAll<HTMLButtonElement>('button[data-action="menu-toggle"][data-menu]')) {
    const isOpen = Boolean(menu && trigger.dataset.menu === menu);
    trigger.setAttribute("aria-expanded", isOpen ? "true" : "false");
  }
  for (const panel of menuRoot.querySelectorAll<HTMLElement>("[data-menu-panel]")) {
    panel.hidden = !menu || panel.dataset.menuPanel !== menu;
  }
}

function focusFirstMenuItem(menuRoot: HTMLElement, menu: string): void {
  menuRoot.querySelector<HTMLButtonElement>(`[data-menu-panel="${menu}"] button`)?.focus();
}

export function attachMenuEvents(args: { menuRoot: HTMLElement; helpRoot: HTMLElement }): () => void {
  const { menuRoot, helpRoot } = args;
  let pendingAltMenu = false;
  let pendingAltTimer = 0;
  const clearPendingAltMenu = (): void => {
    pendingAltMenu = false;
    if (pendingAltTimer) {
      window.clearTimeout(pendingAltTimer);
      pendingAltTimer = 0;
    }
  };
  const markPendingAltMenu = (): void => {
    clearPendingAltMenu();
    pendingAltMenu = true;
    pendingAltTimer = window.setTimeout(clearPendingAltMenu, 1000);
  };
  const openAcceleratorMenu = (event: KeyboardEvent): boolean => {
    if (event.ctrlKey || event.metaKey || event.shiftKey) return false;
    const key = event.key.toLowerCase();
    const menu = key === "f" ? "file" : key === "h" ? "help" : null;
    const isChord = event.altKey;
    const isAltSequence = pendingAltMenu && !event.altKey;
    if (!menu || (!isChord && !isAltSequence)) return false;
    event.preventDefault();
    clearPendingAltMenu();
    setMenuOpen(menuRoot, menu);
    focusFirstMenuItem(menuRoot, menu);
    return true;
  };
  const onMenuClick = (event: MouseEvent): void => {
    const toggle = closestWithin<HTMLButtonElement>(event.target, 'button[data-action="menu-toggle"][data-menu]', menuRoot);
    if (toggle) {
      event.preventDefault();
      const menu = toggle.dataset.menu ?? "";
      setMenuOpen(menuRoot, toggle.getAttribute("aria-expanded") === "true" ? null : menu);
      return;
    }

    const help = closestWithin<HTMLButtonElement>(event.target, 'button[data-action="help-show"]', menuRoot);
    if (help) {
      event.preventDefault();
      setMenuOpen(menuRoot, null);
      renderHelpModal(helpRoot);
      return;
    }

    const item = closestWithin<HTMLButtonElement>(event.target, ".workspace-menu-popup button", menuRoot);
    if (item) {
      setMenuOpen(menuRoot, null);
    }
  };
  const onMenuKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    setMenuOpen(menuRoot, null);
  };
  const onDocumentPointerUp = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    if (event.target instanceof Element && menuRoot.contains(event.target)) return;
    setMenuOpen(menuRoot, null);
  };
  const onDocumentKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      clearPendingAltMenu();
      setMenuOpen(menuRoot, null);
      return;
    }
    if (event.key === "Alt") {
      markPendingAltMenu();
      return;
    }
    if (!openAcceleratorMenu(event)) {
      clearPendingAltMenu();
    }
  };
  const onHelpClick = (event: MouseEvent): void => {
    const close = closestWithin<HTMLElement>(event.target, '[data-action="help-close"]', helpRoot);
    const backdrop = closestWithin<HTMLElement>(event.target, '[data-region="help-backdrop"]', helpRoot);
    if (!close && event.target !== backdrop) return;
    event.preventDefault();
    closeHelpModal(helpRoot);
  };
  const onHelpKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    closeHelpModal(helpRoot);
  };
  const onHelpFocusOut = (): void => {
    window.setTimeout(() => {
      if (helpRoot.childElementCount > 0 && !helpRoot.contains(document.activeElement)) {
        closeHelpModal(helpRoot);
      }
    }, 0);
  };

  const offMenuClick = attachScopedActivation(menuRoot, onMenuClick);
  const offMenuKeyDown = attachScopedEvent<KeyboardEvent>(menuRoot, "keydown", onMenuKeyDown);
  const offHelpClick = attachScopedActivation(helpRoot, onHelpClick);
  const offHelpKeyDown = attachScopedEvent<KeyboardEvent>(helpRoot, "keydown", onHelpKeyDown);
  const offHelpFocusOut = attachScopedEvent<FocusEvent>(helpRoot, "focusout", onHelpFocusOut);
  document.addEventListener("pointerup", onDocumentPointerUp, true);
  document.addEventListener("keydown", onDocumentKeyDown, true);
  return () => {
    offMenuClick();
    offMenuKeyDown();
    offHelpClick();
    offHelpKeyDown();
    offHelpFocusOut();
    clearPendingAltMenu();
    document.removeEventListener("pointerup", onDocumentPointerUp, true);
    document.removeEventListener("keydown", onDocumentKeyDown, true);
  };
}
