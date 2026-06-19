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
      const selectedTags = state.filter.selectedTags.includes(tag)
        ? state.filter.selectedTags.filter((selected) => selected !== tag)
        : [...state.filter.selectedTags, tag];
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
