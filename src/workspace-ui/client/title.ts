import type { AppState } from "./state.js";

export function workspaceFileName(path: string): string {
  const trimmed = path.trim().replace(/[\\/]+$/, "");
  if (!trimmed) return "workspace.json";
  const slash = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  const name = slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
  return name || "workspace.json";
}

function modeStatus(state: AppState): string {
  if (state.canvas.mode === "draw_roi") return "Draw ROI: click+drag on screenshot";
  if (state.canvas.mode === "pick_anchor") return "Pick anchor: click on screenshot";
  return "idle";
}

export function workspaceDocumentTitle(state: AppState): string {
  return `Workspace Calibrator - ${workspaceFileName(state.workspace.currentPath)} - ${modeStatus(state)}`;
}
