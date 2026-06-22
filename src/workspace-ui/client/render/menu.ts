import type { AppState } from "../state.js";
import { workspaceFileName } from "../title.js";

export const WORKSPACE_HELP_TEXT = `Workflow:
1) Select an item (or Add ROI/Anchor)
2) Click "Draw ROI box" or "Pick anchor point"
3) Draw on the screenshot (drag for ROI; click for anchor)
4) Save

Preview controls:
- Mouse wheel: scroll vertically
- Alt/Shift + wheel: scroll horizontally
- Ctrl + wheel: zoom

Notes:
- Coordinates are screen pixels (monitor-merged coordinate space).
- Keep the instrument control window layout stable.`;

type MenuState = Pick<AppState, "workspace">;

function menuButton(action: string, label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.action = action;
  button.textContent = label;
  return button;
}

function menuTrigger(menu: "file" | "help", label: string): HTMLButtonElement {
  const button = menuButton("menu-toggle", label);
  button.dataset.menu = menu;
  button.setAttribute("aria-haspopup", "menu");
  button.setAttribute("aria-expanded", "false");
  return button;
}

function menuGroup(menu: "file" | "help", titleText: string, controls: HTMLElement[]): HTMLElement {
  const group = document.createElement("div");
  group.className = "workspace-menu-group";
  group.dataset.menuGroup = menu;

  const trigger = menuTrigger(menu, titleText);
  const popup = document.createElement("div");
  popup.className = "workspace-menu-popup";
  popup.dataset.menuPanel = menu;
  popup.setAttribute("role", "menu");
  popup.hidden = true;
  for (const control of controls) {
    control.setAttribute("role", "menuitem");
    popup.append(control);
  }

  group.append(trigger, popup);
  return group;
}

function workspacePathLabel(path: string): string {
  const trimmed = path.trim();
  return trimmed || "No active workspace path";
}

function workspacePathStatus(state: MenuState): HTMLElement {
  const path = workspacePathLabel(state.workspace.currentPath);
  const status = document.createElement("div");
  status.className = "workspace-path-status";
  status.dataset.workspacePathStatus = "true";
  status.title = path;

  const fileName = document.createElement("span");
  fileName.className = "workspace-path-file";
  fileName.textContent = workspaceFileName(state.workspace.currentPath);

  const fullPath = document.createElement("span");
  fullPath.className = "workspace-path-full";
  fullPath.textContent = path;

  status.append(fileName, fullPath);
  return status;
}

export function renderMenu(rootEl: HTMLElement, state: MenuState): void {
  const openMenu = rootEl.querySelector<HTMLButtonElement>('button[data-action="menu-toggle"][aria-expanded="true"]')?.dataset.menu;
  rootEl.className = "workspace-menu-bar";
  rootEl.setAttribute("role", "menubar");
  rootEl.replaceChildren(
    menuGroup("file", "File", [menuButton("file-browser-load", "Load workspace..."), menuButton("file-browser-export", "Export workspace...")]),
    menuGroup("help", "Help", [menuButton("help-show", "Show help")]),
    workspacePathStatus(state),
  );
  if (openMenu === "file" || openMenu === "help") {
    rootEl.querySelector<HTMLButtonElement>(`button[data-action="menu-toggle"][data-menu="${openMenu}"]`)?.setAttribute("aria-expanded", "true");
    const panel = rootEl.querySelector<HTMLElement>(`[data-menu-panel="${openMenu}"]`);
    if (panel) panel.hidden = false;
  }
}

export function renderHelpModal(rootEl: HTMLElement): void {
  const backdrop = document.createElement("div");
  backdrop.className = "help-backdrop";
  backdrop.dataset.region = "help-backdrop";

  const dialog = document.createElement("article");
  dialog.className = "help-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "workspace-help-title");
  dialog.tabIndex = -1;

  const header = document.createElement("header");
  const title = document.createElement("h2");
  title.id = "workspace-help-title";
  title.textContent = "Help";
  const close = menuButton("help-close", "Close");
  header.append(title, close);

  const body = document.createElement("pre");
  body.textContent = WORKSPACE_HELP_TEXT;

  dialog.append(header, body);
  backdrop.append(dialog);
  rootEl.replaceChildren(backdrop);
  dialog.focus();
}

export function closeHelpModal(rootEl: HTMLElement): void {
  rootEl.replaceChildren();
}
