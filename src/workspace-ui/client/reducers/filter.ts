import { filterTerms } from "../../shared/filter.js";
import type { Action } from "../actions.js";
import type { AppState } from "../state.js";

export function filterReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "FILTER_TOGGLE_TAG": {
      const tag = action.payload.tag.trim().toLowerCase();
      if (!tag) {
        return state;
      }
      const isSelected = state.filter.selectedTags.includes(tag);
      const shouldSelect = action.payload.selected ?? !isSelected;
      if (shouldSelect === isSelected) {
        return state;
      }
      const selectedTags = shouldSelect ? [...state.filter.selectedTags, tag] : state.filter.selectedTags.filter((selected) => selected !== tag);
      return { ...state, filter: { ...state.filter, selectedTags } };
    }
    case "FILTER_KEYWORD_CHANGED": {
      const keywordRaw = action.payload.text;
      return { ...state, filter: { ...state.filter, keywordRaw, terms: filterTerms(keywordRaw) } };
    }
    case "FILTER_TOGGLE_LOGIC":
      return { ...state, filter: { ...state.filter, logic: state.filter.logic === "AND" ? "OR" : "AND" } };
    case "FILTER_CLEAR":
      return { ...state, filter: { ...state.filter, selectedTags: [], keywordRaw: "", terms: [] } };
    default:
      return state;
  }
}
