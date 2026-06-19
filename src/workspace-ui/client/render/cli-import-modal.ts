import { cliParamToJson } from "../../shared/model.js";
import { buildCliConflictReport } from "../../shared/cli-import.js";
import type { AppState } from "../state.js";

function keysText(payload: Record<string, unknown>): string {
  return Object.keys(payload).join(", ");
}

export function renderCliImportModal(rootEl: HTMLElement, state: AppState): void {
  rootEl.replaceChildren();
  if (!state.cliImport.modalOpen) {
    return;
  }

  const backdrop = document.createElement("div");
  backdrop.className = "cli-import-backdrop";
  backdrop.dataset.action = "cli-import-cancel";

  const modal = document.createElement("section");
  modal.className = "cli-import-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.tabIndex = -1;

  const title = document.createElement("h2");
  title.textContent = `CLI Import — ${state.cliImport.conflicts.length} conflict(s) on \`CLI_Name, name\``;
  modal.append(title);

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  thead.innerHTML = "<tr><th>CLI_Name</th><th>name</th><th>Existing keys</th><th>Loaded keys</th></tr>";
  const tbody = document.createElement("tbody");
  for (const conflict of state.cliImport.conflicts) {
    const row = document.createElement("tr");
    for (const text of [
      conflict.cli_name,
      conflict.name,
      keysText(cliParamToJson(conflict.existing)),
      keysText(cliParamToJson(conflict.loaded)),
    ]) {
      const cell = document.createElement("td");
      cell.textContent = text;
      row.append(cell);
    }
    tbody.append(row);
  }
  table.append(thead, tbody);
  modal.append(table);

  const details = document.createElement("details");
  details.open = true;
  const summary = document.createElement("summary");
  summary.textContent = "Show field diff";
  const pre = document.createElement("pre");
  pre.textContent = buildCliConflictReport(state.cliImport.conflicts);
  details.append(summary, pre);
  modal.append(details);

  const footer = document.createElement("footer");
  for (const [action, text] of [
    ["cli-import-keep", "Keep existing"],
    ["cli-import-use-loaded", "Use loaded"],
    ["cli-import-cancel", "Cancel"],
  ] as const) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.action = action;
    button.textContent = text;
    footer.append(button);
  }
  modal.append(footer);
  rootEl.append(backdrop, modal);

  rootEl.querySelector<HTMLButtonElement>('button[data-action="cli-import-cancel"]')?.focus();
}
