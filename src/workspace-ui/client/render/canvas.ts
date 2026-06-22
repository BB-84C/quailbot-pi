import { effectiveScale, roiToCanvasRect, screenToCanvas } from "../../shared/geometry.js";
import { workspaceUiToken } from "../api/token.js";
import type { AppState, TreeItemKey } from "../state.js";

const SVG_NS = "http://www.w3.org/2000/svg";

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag);
}

function singleSelectedOverlay(selected: TreeItemKey[]): TreeItemKey | null {
  const item = selected.length === 1 ? selected[0] : null;
  return item?.kind === "roi" || item?.kind === "anchor" ? item : null;
}

function setAttrs(el: Element, attrs: Record<string, string | number>): void {
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, String(value));
  }
}

function renderKey(state: AppState, renderedWidth: number, renderedHeight: number): string {
  const frame = state.canvas.frame;
  return frame ? [frame.captureId, state.canvas.viewport.width, state.canvas.viewport.height, renderedWidth, renderedHeight].join(":") : "empty";
}

function dynamicOverlaySelector(): string {
  return ".canvas-roi, .canvas-anchor, .canvas-draft-roi";
}

function clearDynamicOverlays(content: SVGGElement): void {
  for (const node of content.querySelectorAll(dynamicOverlaySelector())) {
    node.remove();
  }
}

function appendSelectedOverlay(content: SVGGElement, state: AppState, scale: number): void {
  const frame = state.canvas.frame;
  if (!frame) return;
  const overlay = singleSelectedOverlay(state.tree.selected);
  if (overlay?.kind === "roi") {
    const roi = state.workspace.rois.find((item) => item.name === overlay.name);
    if (!roi) return;
    const rectData = roiToCanvasRect(frame, scale, roi);
    const rect = svgEl("rect");
    rect.classList.add("canvas-roi", "canvas-roi--selected");
    rect.dataset.name = roi.name;
    setAttrs(rect, {
      x: rectData.left,
      y: rectData.top,
      width: rectData.width,
      height: rectData.height,
      fill: "none",
      stroke: "#00d1ff",
      "stroke-width": 2,
    });
    content.append(rect);
    return;
  }
  if (overlay?.kind !== "anchor") return;
  const anchor = state.workspace.anchors.find((item) => item.name === overlay.name);
  if (!anchor) return;
  const point = screenToCanvas(frame, scale, anchor);
  const group = svgEl("g");
  group.classList.add("canvas-anchor", "canvas-anchor--selected");
  group.dataset.name = anchor.name;

  const h = svgEl("line");
  h.classList.add("canvas-anchor-line");
  setAttrs(h, { x1: point.x - 8, y1: point.y, x2: point.x + 8, y2: point.y, stroke: "#ffcc00", "stroke-width": 2 });
  const v = svgEl("line");
  v.classList.add("canvas-anchor-line");
  setAttrs(v, { x1: point.x, y1: point.y - 8, x2: point.x, y2: point.y + 8, stroke: "#ffcc00", "stroke-width": 2 });
  const circle = svgEl("circle");
  circle.classList.add("canvas-anchor-circle");
  setAttrs(circle, { cx: point.x, cy: point.y, r: 4, fill: "none", stroke: "#ffcc00", "stroke-width": 2 });
  group.append(h, v, circle);
  content.append(group);
}

function appendDraftOverlay(content: SVGGElement, state: AppState): void {
  if (!state.canvas.draftDrag) return;
  const { startCanvas, currentCanvas } = state.canvas.draftDrag;
  const draft = svgEl("rect");
  draft.classList.add("canvas-draft-roi");
  const x = Math.min(startCanvas.x, currentCanvas.x);
  const y = Math.min(startCanvas.y, currentCanvas.y);
  const width = Math.abs(currentCanvas.x - startCanvas.x);
  const height = Math.abs(currentCanvas.y - startCanvas.y);
  setAttrs(draft, { x, y, width, height, fill: "none", stroke: "#00d1ff", "stroke-width": 2 });
  content.append(draft);
}

function buildCanvasShell(rootEl: HTMLElement, state: AppState, renderedWidth: number, renderedHeight: number): SVGGElement {
  const frame = state.canvas.frame;
  if (!frame) throw new Error("cannot build canvas shell without a capture frame");

  const viewport = document.createElement("div");
  viewport.className = "canvas-viewport";
  viewport.style.width = `${state.canvas.viewport.width}px`;
  viewport.style.height = `${state.canvas.viewport.height}px`;
  viewport.style.overflow = "hidden";

  const svg = svgEl("svg");
  svg.classList.add("canvas-svg");
  setAttrs(svg, { viewBox: `0 0 ${renderedWidth} ${renderedHeight}`, width: renderedWidth, height: renderedHeight });

  const content = svgEl("g");
  content.classList.add("canvas-content");

  const image = svgEl("image");
  image.classList.add("canvas-image");
  setAttrs(image, { x: 0, y: 0, width: renderedWidth, height: renderedHeight });
  image.setAttribute("href", captureAssetHref(frame.captureId));
  content.append(image);

  svg.append(content);
  viewport.append(svg);
  rootEl.replaceChildren(viewport);
  return content;
}

export function renderCanvas(rootEl: HTMLElement, state: AppState): void {
  rootEl.classList.add("canvas-root");

  if (!state.canvas.frame) {
    rootEl.dataset.canvasRenderKey = "empty";
    rootEl.replaceChildren();
    const empty = document.createElement("div");
    empty.className = "canvas-empty";
    empty.textContent = "No capture yet";
    rootEl.append(empty);
    return;
  }

  const frame = state.canvas.frame;
  const scale = effectiveScale(frame, { ...state.canvas.viewport, zoom: state.canvas.zoom });
  const renderedWidth = frame.imageWidth * scale;
  const renderedHeight = frame.imageHeight * scale;
  const key = renderKey(state, renderedWidth, renderedHeight);
  let content = rootEl.querySelector<SVGGElement>(".canvas-content");
  if (rootEl.dataset.canvasRenderKey !== key || !content) {
    content = buildCanvasShell(rootEl, state, renderedWidth, renderedHeight);
    rootEl.dataset.canvasRenderKey = key;
  }

  content.setAttribute("transform", `translate(-${Math.trunc(state.canvas.pan.x)} -${Math.trunc(state.canvas.pan.y)})`);
  clearDynamicOverlays(content);
  appendSelectedOverlay(content, state, scale);
  appendDraftOverlay(content, state);
}

function captureAssetHref(captureId: string): string {
  const token = workspaceUiToken();
  const params = new URLSearchParams({ captureId });
  if (token) params.set("token", token);
  return `/assets/workspace-capture?${params.toString()}`;
}
