import type { AppState, TreeItemKey } from "../state.js";
import { renderedTreeRows } from "../reducers/tree.js";

function isSelected(selected: TreeItemKey[], kind: string, name: string): boolean {
  return selected.some((item) => item.kind === kind && item.name === name);
}

function isActiveAnchor(active: TreeItemKey | null, kind: string, name: string): boolean {
  return Boolean(active && active.kind === kind && active.name === name);
}

export function renderItemsTree(rootEl: HTMLElement, state: AppState): void {
  rootEl.classList.add("items-tree");
  rootEl.setAttribute("role", "tree");
  rootEl.tabIndex = rootEl.tabIndex < 0 ? 0 : rootEl.tabIndex;
  rootEl.replaceChildren();

  const list = document.createElement("ul");
  list.className = "tree-list";
  list.setAttribute("role", "presentation");

  for (const row of renderedTreeRows(state)) {
    const item = document.createElement("li");
    item.className = "tree-row";
    item.dataset.kind = row.kind;
    item.dataset.name = row.name;
    item.dataset.key = `${row.kind}:${row.name}`;
    item.dataset.depth = String(row.depth);
    item.setAttribute("role", "treeitem");
    if (isSelected(state.tree.selected, row.kind, row.name)) {
      item.classList.add("tree-row--selected");
      item.setAttribute("aria-selected", "true");
    } else {
      item.setAttribute("aria-selected", "false");
    }
    if (isActiveAnchor(state.tree.activeAnchor, row.kind, row.name)) {
      item.classList.add("tree-row--active");
    }
    if (row.forced) {
      item.classList.add("tree-row--forced-active");
    }

    const guides = document.createElement("span");
    guides.className = "tree-depth-guides";
    guides.setAttribute("aria-hidden", "true");
    for (let index = 0; index < Math.max(0, row.depth); index += 1) {
      const guide = document.createElement("span");
      guide.className = "tree-depth-guide";
      guides.append(guide);
    }

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "tree-toggle";
    toggle.dataset.region = "toggle";
    toggle.textContent = row.active ? "[x]" : "[ ]";
    toggle.disabled = row.forced;
    toggle.setAttribute("aria-label", `${row.active ? "Disable" : "Enable"} ${row.name}`);

    const body = document.createElement("span");
    body.className = "tree-body";
    body.dataset.region = "body";
    body.textContent = `${row.tag} ${row.displayName}`;

    item.append(guides, toggle, body);
    list.append(item);
  }

  rootEl.append(list);
}
