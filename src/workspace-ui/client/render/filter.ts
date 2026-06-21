import { collectTagCounts } from "../../shared/filter.js";
import type { AppState } from "../state.js";

function ensureSection(rootEl: HTMLElement): HTMLElement {
  let section = rootEl.querySelector<HTMLElement>(':scope > .filter-panel[data-region="filter"]');
  if (section) {
    return section;
  }

  section = document.createElement("section");
  section.className = "filter-panel";
  section.dataset.region = "filter";

  const header = document.createElement("header");
  header.className = "filter-header";
  header.textContent = "Filter";

  const tags = document.createElement("div");
  tags.className = "filter-tags";
  tags.dataset.region = "filter-tags";

  const keywordRow = document.createElement("label");
  keywordRow.className = "filter-keyword-row";
  const keywordLabel = document.createElement("span");
  keywordLabel.textContent = "Keyword";

  const keyword = document.createElement("input");
  keyword.type = "text";
  keyword.className = "filter-keyword";
  keyword.dataset.region = "filter-keyword";
  keyword.placeholder = "keyword (comma-separated terms)";
  keywordRow.append(keywordLabel, keyword);

  const logic = document.createElement("button");
  logic.type = "button";
  logic.className = "filter-logic-toggle";
  logic.dataset.action = "toggle-logic";

  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "filter-clear";
  clear.dataset.action = "filter-clear";
  clear.textContent = "Clear";

  keywordRow.append(logic, clear);

  section.append(header, tags, keywordRow);
  rootEl.replaceChildren(section);
  return section;
}

export function renderFilter(rootEl: HTMLElement, state: AppState): void {
  const section = ensureSection(rootEl);
  const tagsRoot = section.querySelector<HTMLElement>('[data-region="filter-tags"]');
  const keyword = section.querySelector<HTMLInputElement>('[data-region="filter-keyword"]');
  const logic = section.querySelector<HTMLButtonElement>('[data-action="toggle-logic"]');
  const tagOptions = collectTagCounts(state.workspace);
  const selectedTags = new Set(state.filter.selectedTags.map((tag) => tag.toLowerCase()));

  if (tagsRoot) {
    tagsRoot.replaceChildren();
    if (tagOptions.length === 0) {
      const empty = document.createElement("span");
      empty.className = "filter-empty";
      empty.textContent = "(no tags)";
      tagsRoot.append(empty);
    } else {
      for (const option of tagOptions) {
        const label = document.createElement("label");
        label.className = "filter-tag";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.dataset.action = "toggle-tag";
        checkbox.dataset.tag = option.tag;
        checkbox.checked = selectedTags.has(option.tag.toLowerCase());

        const text = document.createElement("span");
        text.textContent = option.tag;

        label.append(checkbox, text);
        tagsRoot.append(label);
      }
    }
  }

  if (keyword) {
    const keywordRaw = state.filter.keywordRaw ?? "";
    if (keyword.value !== keywordRaw) {
      keyword.value = keywordRaw;
    }
  }
  if (logic) {
    logic.textContent = state.filter.logic;
  }
}
