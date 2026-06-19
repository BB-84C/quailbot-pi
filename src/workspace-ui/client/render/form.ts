import type { CliParamDraft } from "../../shared/model.js";
import type { AppState, FormFieldKey } from "../state.js";
import { groupComboboxOptions, selectionSummary, shouldShowField, type SelectionSummary } from "../selectors/form.js";

const fieldOrder: FormFieldKey[] = ["name", "x", "y", "w", "h", "tags", "description"];

function labelForField(field: FormFieldKey): string {
  if (field === "w") return "Width";
  if (field === "h") return "Height";
  return field[0]!.toUpperCase() + field.slice(1);
}

function kindLabel(state: AppState, summary: Extract<SelectionSummary, { kind: "single" }>): string {
  if (summary.itemKind === "roi") return "ROI (Observation)";
  if (summary.itemKind === "anchor") return "Anchor (Action click point)";
  if (summary.itemKind === "group") return "Group (Folder)";
  const cli = state.workspace.cliParams.find((item) => item.name === summary.name) as CliParamDraft | undefined;
  return cli?.action_cmd ? "CLI Action" : "CLI Parameter";
}

function valueFor(state: AppState, summary: Extract<SelectionSummary, { kind: "single" }>, field: FormFieldKey): string {
  return state.form.buffers[field] ?? summary.fields[field] ?? "";
}

function setControlValue(control: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  if (control.value !== value) {
    control.value = value;
  }
}

function appendNotice(rootEl: HTMLElement, state: AppState): void {
  rootEl.querySelector(".form-notice")?.remove();
  if (!state.form.lastCycleRejection) return;
  const notice = document.createElement("div");
  notice.className = "form-notice form-notice--warning";
  notice.textContent = "A group cannot be its own parent.";
  rootEl.prepend(notice);
}

function renderGroupSelect(select: HTMLSelectElement, state: AppState): void {
  const options = groupComboboxOptions(state);
  select.replaceChildren();
  for (const item of options) {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.display;
    option.selected = item.selected;
    if (item.value === "(mixed)") {
      option.disabled = true;
    }
    select.append(option);
  }
}

function createGroupRow(state: AppState): HTMLElement {
  const row = document.createElement("label");
  row.className = "form-row form-row--group";
  const text = document.createElement("span");
  text.textContent = "Group";
  const select = document.createElement("select");
  select.dataset.field = "group";
  renderGroupSelect(select, state);
  row.append(text, select);
  return row;
}

function buildField(summary: Extract<SelectionSummary, { kind: "single" }>, field: FormFieldKey, value: string, readOnly: boolean): HTMLElement {
  const row = document.createElement("label");
  row.className = "form-row";
  const label = document.createElement("span");
  label.textContent = labelForField(field);
  if (field === "description") {
    const textarea = document.createElement("textarea");
    textarea.dataset.field = field;
    textarea.value = value;
    textarea.readOnly = readOnly;
    row.append(label, textarea);
    return row;
  }
  const input = document.createElement("input");
  input.dataset.field = field;
  input.value = value;
  input.readOnly = readOnly;
  if (summary.itemKind === "cli") {
    input.setAttribute("aria-readonly", "true");
  }
  row.append(label, input);
  return row;
}

function updateExisting(rootEl: HTMLElement, state: AppState, summary: SelectionSummary): boolean {
  if (summary.kind === "none") return false;
  if (summary.kind === "multi") {
    const header = rootEl.querySelector<HTMLElement>(".form-header");
    if (!header) return false;
    header.textContent = `Multiple items (${summary.count})`;
    const select = rootEl.querySelector<HTMLSelectElement>('select[data-field="group"]');
    if (select) renderGroupSelect(select, state);
    appendNotice(rootEl, state);
    return true;
  }
  const header = rootEl.querySelector<HTMLElement>(".form-header");
  if (!header) return false;
  header.textContent = kindLabel(state, summary);
  for (const field of fieldOrder) {
    const value = valueFor(state, summary, field);
    const control = rootEl.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-field="${field}"]`);
    if (control) setControlValue(control, value);
  }
  const select = rootEl.querySelector<HTMLSelectElement>('select[data-field="group"]');
  if (select) renderGroupSelect(select, state);
  appendNotice(rootEl, state);
  return true;
}

function buildForm(rootEl: HTMLElement, state: AppState, summary: SelectionSummary, key: string): void {
  rootEl.dataset.formKey = key;
  rootEl.classList.add("selected-form");
  rootEl.replaceChildren();

  if (summary.kind === "none") {
    const empty = document.createElement("p");
    empty.className = "form-empty";
    empty.textContent = "Select an item to inspect it";
    rootEl.append(empty);
    return;
  }

  const header = document.createElement("h2");
  header.className = "form-header";
  rootEl.append(header);

  if (summary.kind === "multi") {
    header.textContent = `Multiple items (${summary.count})`;
    rootEl.append(createGroupRow(state));
    appendNotice(rootEl, state);
    return;
  }

  header.textContent = kindLabel(state, summary);
  const grid = document.createElement("div");
  grid.className = "form-grid";
  for (const field of fieldOrder) {
    if (!shouldShowField(summary.itemKind, field)) continue;
    grid.append(buildField(summary, field, valueFor(state, summary, field), summary.itemKind === "cli"));
  }
  rootEl.append(grid);

  if (summary.itemKind === "cli") {
    const stub = document.createElement("p");
    stub.className = "form-cli-stub";
    stub.textContent = "CLI metadata frame in next phase";
    rootEl.append(stub);
    return;
  }

  rootEl.append(createGroupRow(state));
  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.disabled = true;
  deleteButton.title = "Wired in next phase";
  deleteButton.textContent = "Delete Selected";
  rootEl.append(deleteButton);
  appendNotice(rootEl, state);
}

export function renderForm(rootEl: HTMLElement, state: AppState): void {
  const summary = selectionSummary(state);
  const key = summary.kind === "single" ? `single:${summary.itemKind}` : summary.kind;
  if (rootEl.dataset.formKey !== key || !updateExisting(rootEl, state, summary)) {
    buildForm(rootEl, state, summary, key);
  }
}
