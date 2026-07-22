import type { CliParamDraft } from "../../shared/model.js";
import type { AppState, CliSafetyField, FormFieldKey } from "../state.js";
import {
  cliMetaVisibility,
  cliPayloadPreviewText,
  cliSafetyFields,
  groupComboboxOptions,
  isFieldEnabled,
  linkedControlsEnabled,
  linkedFrameMode,
  linkedListEntries,
  linkedPickerOptions,
  selectionSummary,
  shouldShowField,
  type LinkedFrameMode,
  type SelectionSummary,
} from "../selectors/form.js";

const topFieldOrder: FormFieldKey[] = ["name", "x", "y", "w", "h", "tags"];
const editableFieldOrder: FormFieldKey[] = [...topFieldOrder, "description"];

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

function setCheckboxValue(control: HTMLInputElement, value: boolean): void {
  if (control.checked !== value) {
    control.checked = value;
  }
}

function selectedCli(state: AppState, summary: Extract<SelectionSummary, { kind: "single" }>): CliParamDraft | null {
  if (summary.itemKind !== "cli") return null;
  return state.workspace.cliParams.find((item) => item.name === summary.name) ?? null;
}

function formStructureKey(state: AppState, summary: SelectionSummary): string {
  if (summary.kind !== "single") return summary.kind;
  if (summary.itemKind !== "cli") return `single:${summary.itemKind}`;
  const cli = selectedCli(state, summary);
  if (!cli) return "single:cli:none";
  const visibility = cliMetaVisibility(cli);
  const safety = cliSafetyFields.map((field) => `${field}:${visibility.safetyFieldsEnabled[field] ? "1" : "0"}`).join(",");
  return [
    "single:cli",
    linkedFrameMode(state),
    visibility.showWritable ? "w" : "-",
    visibility.showSafetyMode ? "mode" : "-",
    visibility.showGetDesc ? "get" : "-",
    visibility.showSetDesc ? "set" : "-",
    visibility.rampEnabledVisible ? "ramp" : "-",
    safety,
  ].join(":");
}

function linkedTitle(mode: Exclude<LinkedFrameMode, "none">): string {
  if (mode === "anchor") return "Linked Observables (anchor)";
  if (mode === "cli_action") return "Linked Observables (cli action)";
  return "Linked Observables (cli parameter)";
}

function setDisabled(control: HTMLInputElement | HTMLSelectElement | HTMLButtonElement, disabled: boolean): void {
  control.disabled = disabled;
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

function labelTextForSafetyField(field: CliSafetyField): string {
  return field;
}

function buildField(field: FormFieldKey, value: string, enabled: boolean): HTMLElement {
  const row = document.createElement("label");
  row.className = "form-row";
  if (!enabled) row.classList.add("form-row--disabled");
  const label = document.createElement("span");
  label.textContent = labelForField(field);
  if (field === "description") {
    const textarea = document.createElement("textarea");
    textarea.dataset.field = field;
    textarea.value = value;
    textarea.disabled = !enabled;
    row.append(label, textarea);
    return row;
  }
  const input = document.createElement("input");
  input.dataset.field = field;
  input.value = value;
  input.disabled = !enabled;
  row.append(label, input);
  return row;
}

function buildDescriptionRow(state: AppState, summary: Extract<SelectionSummary, { kind: "single" }>): HTMLElement | null {
  if (!shouldShowField(summary.itemKind, "description")) return null;
  return buildField("description", valueFor(state, summary, "description"), isFieldEnabled(summary.itemKind, "description"));
}

function buildDisabledMultiField(field: FormFieldKey): HTMLElement {
  const row = document.createElement("label");
  row.className = "form-row form-row--disabled";
  const label = document.createElement("span");
  label.textContent = labelForField(field);
  if (field === "description") {
    const textarea = document.createElement("textarea");
    textarea.dataset.field = field;
    textarea.value = "";
    textarea.disabled = true;
    row.append(label, textarea);
    return row;
  }
  const input = document.createElement("input");
  input.dataset.field = field;
  input.value = "";
  input.disabled = true;
  row.append(label, input);
  return row;
}

function buildDisabledEmptyField(field: FormFieldKey): HTMLElement {
  return buildDisabledMultiField(field);
}

function buildCliTextarea(className: string, metaKey: "getCmdDescription" | "setCmdDescription", labelText: string, value: string): HTMLElement {
  const row = document.createElement("label");
  row.className = `form-row ${className}`;
  const label = document.createElement("span");
  label.textContent = labelText;
  const textarea = document.createElement("textarea");
  textarea.dataset.cliMeta = metaKey;
  textarea.value = value;
  row.append(label, textarea);
  return row;
}

function buildCliMetadataBlock(state: AppState, cli: CliParamDraft): HTMLElement {
  const visibility = cliMetaVisibility(cli);
  const block = document.createElement("section");
  block.className = "cli-meta-block";
  const title = document.createElement("h3");
  title.textContent = "CLI Metadata";
  block.append(title);

  if (visibility.showWritable) {
    const row = document.createElement("label");
    row.className = "form-row cli-meta-writable";
    const text = document.createElement("span");
    text.textContent = "Writable";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.dataset.cliMeta = "writable";
    input.checked = state.form.cliMeta.writable ?? Boolean(cli.writable);
    row.append(text, input);
    block.append(row);
  }

  if (visibility.showSafetyMode) {
    const row = document.createElement("label");
    row.className = "form-row cli-meta-safety-mode";
    const text = document.createElement("span");
    text.textContent = "Safety mode";
    const select = document.createElement("select");
    select.dataset.cliMeta = "safetyMode";
    for (const value of ["alwaysAllowed", "guarded", "blocked"] as const) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      option.selected = (state.form.cliMeta.safetyMode ?? cli.safety_mode) === value;
      select.append(option);
    }
    row.append(text, select);
    block.append(row);
  }

  if (visibility.showGetDesc) {
    block.append(buildCliTextarea("cli-meta-get-desc", "getCmdDescription", "get_cmd description", state.form.cliMeta.getCmdDescription ?? String(cli.get_cmd?.description ?? "")));
  }

  if (visibility.showSetDesc) {
    block.append(buildCliTextarea("cli-meta-set-desc", "setCmdDescription", "set_cmd description", state.form.cliMeta.setCmdDescription ?? String(cli.set_cmd?.description ?? "")));
  }

  if (!visibility.showSafetyMode) {
    for (const field of cliSafetyFields) {
      const row = document.createElement("label");
      row.className = `form-row cli-meta-safety-${field}`;
      const text = document.createElement("span");
      text.textContent = labelTextForSafetyField(field);
      const input = document.createElement("input");
      input.type = "number";
      input.dataset.cliSafetyField = field;
      input.value = state.form.cliMeta.safety?.[field] ?? String(cli.safety?.[field] ?? "");
      input.disabled = !visibility.safetyFieldsEnabled[field];
      row.append(text, input);
      block.append(row);
    }
  }

  if (visibility.rampEnabledVisible) {
    const row = document.createElement("label");
    row.className = "form-row cli-meta-ramp-enabled";
    const text = document.createElement("span");
    text.textContent = "ramp_enabled";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.dataset.cliMeta = "rampEnabled";
    input.checked = state.form.cliMeta.safetyRampEnabled ?? Boolean(cli.safety?.ramp_enabled);
    row.append(text, input);
    block.append(row);
  }

  const preview = document.createElement("pre");
  preview.className = "cli-meta-payload-preview";
  preview.textContent = cliPayloadPreviewText(cli);
  block.append(preview);

  return block;
}

function buildCliActionsDisplay(cli: CliParamDraft): HTMLElement {
  const fieldset = document.createElement("fieldset");
  fieldset.className = "cli-actions-display";
  const legend = document.createElement("legend");
  legend.textContent = "CLI Actions";
  fieldset.append(legend);
  for (const [label, value] of [
    ["get", cli.allow_get],
    ["set", cli.allow_set],
    ["ramp", cli.allow_ramp],
  ] as const) {
    const row = document.createElement("label");
    row.className = "cli-actions-display__item";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.dataset.cliAction = label;
    input.checked = Boolean(value);
    const text = document.createElement("span");
    text.textContent = label;
    row.append(input, text);
    fieldset.append(row);
  }
  if (cli.set_cmd === null && (cli.allow_set || cli.allow_ramp)) {
    const warning = document.createElement("p");
    warning.className = "cli-actions-display__warning";
    warning.textContent = "Set or ramp is enabled without a set_cmd; runtime CLI calls will fail until one is configured.";
    fieldset.append(warning);
  }
  return fieldset;
}

function populateLinkedFrame(frame: HTMLElement, state: AppState, mode: Exclude<LinkedFrameMode, "none">): void {
  const activeElement = document.activeElement instanceof HTMLElement && frame.contains(document.activeElement) ? document.activeElement : null;
  const activeRegion = activeElement?.dataset.region;
  const activeAction = activeElement?.dataset.action;
  const activeName = activeElement?.dataset.name;
  const activeSelection = activeElement instanceof HTMLInputElement ? { start: activeElement.selectionStart, end: activeElement.selectionEnd } : null;
  const enabled = linkedControlsEnabled(state);
  const options = linkedPickerOptions(state);
  const entries = linkedListEntries(state);
  const selectedOption = options.includes(state.form.linkedObs.pickerValue) ? state.form.linkedObs.pickerValue : (options[0] ?? "");
  frame.className = `linked-frame linked-frame--${mode}`;
  frame.setAttribute("aria-disabled", enabled ? "false" : "true");
  frame.replaceChildren();

  const title = document.createElement("h3");
  title.textContent = linkedTitle(mode);
  frame.append(title);

  const search = document.createElement("input");
  search.type = "search";
  search.dataset.region = "linked-search";
  search.placeholder = "Search observables";
  search.value = state.form.linkedObs.searchText;
  setDisabled(search, !enabled);
  frame.append(search);

  const pickerRow = document.createElement("div");
  pickerRow.className = "linked-picker-row";
  const picker = document.createElement("select");
  picker.dataset.region = "linked-picker";
  setDisabled(picker, !enabled || options.length === 0);
  for (const value of options) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    option.selected = value === selectedOption;
    picker.append(option);
  }
  if (selectedOption) {
    picker.value = selectedOption;
  }
  const add = document.createElement("button");
  add.type = "button";
  add.dataset.action = "linked-add";
  add.textContent = "Add";
  setDisabled(add, !enabled || !selectedOption);
  pickerRow.append(picker, add);
  frame.append(pickerRow);

  const list = document.createElement("ul");
  list.className = "linked-list";
  list.dataset.region = "linked-list";
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-multiselectable", "true");
  const selectedNames = new Set(state.form.linkedObs.selectedNames);
  for (const entry of entries) {
    const item = document.createElement("li");
    item.tabIndex = enabled ? 0 : -1;
    item.dataset.action = "linked-select";
    item.dataset.name = entry.name;
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", selectedNames.has(entry.name) ? "true" : "false");
    if (!entry.editable) {
      item.setAttribute("aria-disabled", "true");
    }
    const name = document.createElement("span");
    name.textContent = `${entry.name}${entry.editable ? "" : " (auto)"}`;
    item.append(name);
    list.append(item);
  }
  frame.append(list);

  const removeSelected = document.createElement("button");
  removeSelected.type = "button";
  removeSelected.dataset.action = "linked-remove-selected";
  removeSelected.textContent = "Remove selected";
  setDisabled(removeSelected, !enabled || state.form.linkedObs.selectedNames.length === 0);
  frame.append(removeSelected);

  if (mode === "cli") {
    const hint = document.createElement("p");
    hint.className = "linked-hint";
    hint.textContent = "Entries marked '(auto)' are implicit self-observables and cannot be removed.";
    frame.append(hint);
    const cli = state.tree.selected.length === 1 && state.tree.selected[0]?.kind === "cli" ? state.workspace.cliParams.find((item) => item.name === state.tree.selected[0]?.name) : null;
    if (cli) {
      frame.append(buildCliActionsDisplay(cli));
    }
  }

  if (activeRegion) {
    const next = frame.querySelector<HTMLElement>(`[data-region="${activeRegion}"]`);
    next?.focus();
    if (next instanceof HTMLInputElement && activeSelection) {
      next.setSelectionRange(activeSelection.start, activeSelection.end);
    }
  } else if (activeAction) {
    const selector = activeName ? `[data-action="${activeAction}"][data-name="${activeName}"]` : `[data-action="${activeAction}"]`;
    frame.querySelector<HTMLElement>(selector)?.focus();
  }
}

function buildLinkedFrame(state: AppState): HTMLElement | null {
  const mode = linkedFrameMode(state);
  if (mode === "none") return null;
  const frame = document.createElement("section");
  populateLinkedFrame(frame, state, mode);
  return frame;
}

function updateLinkedFrame(rootEl: HTMLElement, state: AppState): void {
  const existing = rootEl.querySelector<HTMLElement>(".linked-frame");
  const mode = linkedFrameMode(state);
  if (mode === "none") {
    existing?.remove();
    return;
  }
  if (existing) {
    populateLinkedFrame(existing, state, mode);
  }
}

function updateCliMetadata(rootEl: HTMLElement, state: AppState, cli: CliParamDraft): void {
  const writable = rootEl.querySelector<HTMLInputElement>('input[data-cli-meta="writable"]');
  if (writable) setCheckboxValue(writable, state.form.cliMeta.writable ?? Boolean(cli.writable));
  const safetyMode = rootEl.querySelector<HTMLSelectElement>('select[data-cli-meta="safetyMode"]');
  if (safetyMode) safetyMode.value = state.form.cliMeta.safetyMode ?? String(cli.safety_mode || "guarded");
  const getDesc = rootEl.querySelector<HTMLTextAreaElement>('textarea[data-cli-meta="getCmdDescription"]');
  if (getDesc) setControlValue(getDesc, state.form.cliMeta.getCmdDescription ?? String(cli.get_cmd?.description ?? ""));
  const setDesc = rootEl.querySelector<HTMLTextAreaElement>('textarea[data-cli-meta="setCmdDescription"]');
  if (setDesc) setControlValue(setDesc, state.form.cliMeta.setCmdDescription ?? String(cli.set_cmd?.description ?? ""));
  const visibility = cliMetaVisibility(cli);
  for (const field of cliSafetyFields) {
    const input = rootEl.querySelector<HTMLInputElement>(`input[data-cli-safety-field="${field}"]`);
    if (!input) continue;
    setControlValue(input, state.form.cliMeta.safety?.[field] ?? String(cli.safety?.[field] ?? ""));
    input.disabled = !visibility.safetyFieldsEnabled[field];
  }
  const rampEnabled = rootEl.querySelector<HTMLInputElement>('input[data-cli-meta="rampEnabled"]');
  if (rampEnabled) setCheckboxValue(rampEnabled, state.form.cliMeta.safetyRampEnabled ?? Boolean(cli.safety?.ramp_enabled));
  const preview = rootEl.querySelector<HTMLElement>(".cli-meta-payload-preview");
  if (preview) preview.textContent = cliPayloadPreviewText(cli);
}

function updateExisting(rootEl: HTMLElement, state: AppState, summary: SelectionSummary): boolean {
  if (summary.kind === "none") return false;
  if (summary.kind === "multi") {
    const header = rootEl.querySelector<HTMLElement>(".form-header");
    if (!header) return false;
    header.textContent = `Multiple items (${summary.count})`;
    for (const field of [...topFieldOrder, "description"] as FormFieldKey[]) {
      const control = rootEl.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-field="${field}"]`);
      if (control) {
        setControlValue(control, "");
        control.disabled = true;
      }
    }
    const select = rootEl.querySelector<HTMLSelectElement>('select[data-field="group"]');
    if (select) {
      renderGroupSelect(select, state);
      select.disabled = false;
    }
    appendNotice(rootEl, state);
    return true;
  }
  const header = rootEl.querySelector<HTMLElement>(".form-header");
  if (!header) return false;
  header.textContent = kindLabel(state, summary);
  for (const field of editableFieldOrder) {
    const value = valueFor(state, summary, field);
    const control = rootEl.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-field="${field}"]`);
    if (control) {
      setControlValue(control, value);
      control.disabled = !isFieldEnabled(summary.itemKind, field);
    }
  }
  const select = rootEl.querySelector<HTMLSelectElement>('select[data-field="group"]');
  if (select) renderGroupSelect(select, state);
  const cli = selectedCli(state, summary);
  if (cli) updateCliMetadata(rootEl, state, cli);
  updateLinkedFrame(rootEl, state);
  appendNotice(rootEl, state);
  return true;
}

function buildForm(rootEl: HTMLElement, state: AppState, summary: SelectionSummary, key: string): void {
  rootEl.dataset.formKey = key;
  rootEl.classList.add("selected-form");
  rootEl.replaceChildren();

  const header = document.createElement("h2");
  header.className = "form-header";
  rootEl.append(header);

  if (summary.kind === "none") {
    header.textContent = "";
    const grid = document.createElement("div");
    grid.className = "form-grid";
    for (const field of topFieldOrder) {
      grid.append(buildDisabledEmptyField(field));
    }
    rootEl.append(grid);
    const groupRow = createGroupRow(state);
    const groupSelect = groupRow.querySelector<HTMLSelectElement>('select[data-field="group"]');
    if (groupSelect) groupSelect.disabled = true;
    rootEl.append(groupRow);
    rootEl.append(buildDisabledEmptyField("description"));
    return;
  }

  if (summary.kind === "multi") {
    header.textContent = `Multiple items (${summary.count})`;
    const grid = document.createElement("div");
    grid.className = "form-grid";
    for (const field of topFieldOrder) {
      grid.append(buildDisabledMultiField(field));
    }
    rootEl.append(grid);
    rootEl.append(createGroupRow(state));
    rootEl.append(buildDisabledMultiField("description"));
    appendNotice(rootEl, state);
    return;
  }

  header.textContent = kindLabel(state, summary);
  const grid = document.createElement("div");
  grid.className = "form-grid";
  for (const field of topFieldOrder) {
    if (!shouldShowField(summary.itemKind, field)) continue;
    grid.append(buildField(field, valueFor(state, summary, field), isFieldEnabled(summary.itemKind, field)));
  }
  rootEl.append(grid);

  if (summary.itemKind === "cli") {
    rootEl.append(createGroupRow(state));
    const cli = selectedCli(state, summary);
    if (cli) {
      const linked = buildLinkedFrame(state);
      if (linked) rootEl.append(linked);
      const description = buildDescriptionRow(state, summary);
      if (description) rootEl.append(description);
      rootEl.append(buildCliMetadataBlock(state, cli));
    }
    return;
  }

  rootEl.append(createGroupRow(state));
  const linked = buildLinkedFrame(state);
  if (linked) rootEl.append(linked);
  const description = buildDescriptionRow(state, summary);
  if (description) rootEl.append(description);
  appendNotice(rootEl, state);
}

export function renderForm(rootEl: HTMLElement, state: AppState): void {
  const summary = selectionSummary(state);
  const key = formStructureKey(state, summary);
  if (rootEl.dataset.formKey !== key || !updateExisting(rootEl, state, summary)) {
    buildForm(rootEl, state, summary, key);
  }
}
