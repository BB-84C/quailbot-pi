import { describe, expect, it } from "vitest";

import { formSelectionChanged } from "../../../src/workspace-ui/client/actions.js";
import { selectionSummary } from "../../../src/workspace-ui/client/selectors/form.js";
import { blur, ctrlKey, input, mountForm, selectedState, textarea, typeInto } from "./form-test-helpers.js";

describe("right-panel per-field undo/redo", () => {
  it("walks field history, preserves cursor, truncates redo, and resets on selection change", () => {
    const { root, store, dispatch } = mountForm(selectedState("roi", "roi-1"));

    typeInto(input(root, "name"), "a", 1);
    typeInto(input(root, "name"), "ab", 2);
    typeInto(input(root, "name"), "abc", 1);

    ctrlKey(input(root, "name"), "z");
    expect(input(root, "name").value).toBe("ab");
    expect(input(root, "name").selectionStart).toBe(2);
    expect(store.getState().workspace.rois[0]?.name).toBe("ab");

    ctrlKey(input(root, "name"), "z");
    expect(input(root, "name").value).toBe("a");
    expect(input(root, "name").selectionStart).toBe(1);
    expect(store.getState().workspace.rois[0]?.name).toBe("a");

    ctrlKey(input(root, "name"), "y");
    expect(input(root, "name").value).toBe("ab");
    expect(store.getState().workspace.rois[0]?.name).toBe("ab");

    typeInto(input(root, "name"), "az", 2);
    ctrlKey(input(root, "name"), "y");
    expect(input(root, "name").value).toBe("az");

    store.dispatch({ type: "TREE_CLICK_ITEM", payload: { kind: "anchor", name: "anchor-1", region: "body", modifiers: { ctrl: false, shift: false } } });
    dispatch(formSelectionChanged(selectionSummary(store.getState())));
    ctrlKey(input(root, "name"), "z");
    expect(input(root, "name").value).toBe("anchor-1");
  });

  it("uses blur-pushed history for description undo and redo", () => {
    const { root } = mountForm(selectedState("roi", "roi-1"));

    typeInto(textarea(root), "one", 3);
    expect(root.querySelector("textarea")?.value).toBe("one");
    typeInto(textarea(root), "one two", 7);
    blur(textarea(root));

    ctrlKey(textarea(root), "z");
    expect(textarea(root).value).toBe("one");
    ctrlKey(textarea(root), "y");
    expect(textarea(root).value).toBe("one two");
  });
});
