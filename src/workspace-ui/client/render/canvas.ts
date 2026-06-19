import { effectiveScale, roiToCanvasRect, screenToCanvas } from "../../shared/geometry.js";
import type { AppState, TreeItemKey } from "../state.js";

const SVG_NS = "http://www.w3.org/2000/svg";

declare global {
  interface Window {
    __quailbotToken?: string;
  }
}

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag);
}

function isSelected(selected: TreeItemKey[], kind: TreeItemKey["kind"], name: string): boolean {
  return selected.some((item) => item.kind === kind && item.name === name);
}

function setAttrs(el: Element, attrs: Record<string, string | number>): void {
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, String(value));
  }
}

export function renderCanvas(rootEl: HTMLElement, state: AppState): void {
  rootEl.classList.add("canvas-root");
  rootEl.replaceChildren();

  if (!state.canvas.frame) {
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
  content.setAttribute("transform", `translate(-${Math.trunc(state.canvas.pan.x)} -${Math.trunc(state.canvas.pan.y)})`);

  const image = svgEl("image");
  image.classList.add("canvas-image");
  setAttrs(image, { x: 0, y: 0, width: renderedWidth, height: renderedHeight });
  image.setAttribute("href", captureAssetHref(frame.captureId));
  content.append(image);

  for (const roi of state.workspace.rois) {
    const rectData = roiToCanvasRect(frame, scale, roi);
    const rect = svgEl("rect");
    rect.classList.add("canvas-roi");
    if (isSelected(state.tree.selected, "roi", roi.name)) {
      rect.classList.add("canvas-roi--selected");
    }
    rect.dataset.name = roi.name;
    setAttrs(rect, { x: rectData.left, y: rectData.top, width: rectData.width, height: rectData.height });
    content.append(rect);
  }

  for (const anchor of state.workspace.anchors) {
    const point = screenToCanvas(frame, scale, anchor);
    const group = svgEl("g");
    group.classList.add("canvas-anchor");
    if (isSelected(state.tree.selected, "anchor", anchor.name)) {
      group.classList.add("canvas-anchor--selected");
    }
    group.dataset.name = anchor.name;

    const h = svgEl("line");
    h.classList.add("canvas-anchor-line");
    setAttrs(h, { x1: point.x - 8, y1: point.y, x2: point.x + 8, y2: point.y });
    const v = svgEl("line");
    v.classList.add("canvas-anchor-line");
    setAttrs(v, { x1: point.x, y1: point.y - 8, x2: point.x, y2: point.y + 8 });
    const circle = svgEl("circle");
    circle.classList.add("canvas-anchor-circle");
    setAttrs(circle, { cx: point.x, cy: point.y, r: 4 });
    group.append(h, v, circle);
    content.append(group);
  }

  if (state.canvas.draftDrag) {
    const { startCanvas, currentCanvas } = state.canvas.draftDrag;
    const draft = svgEl("rect");
    draft.classList.add("canvas-draft-roi");
    const x = Math.min(startCanvas.x, currentCanvas.x);
    const y = Math.min(startCanvas.y, currentCanvas.y);
    const width = Math.abs(currentCanvas.x - startCanvas.x);
    const height = Math.abs(currentCanvas.y - startCanvas.y);
    setAttrs(draft, { x, y, width, height });
    content.append(draft);
  }

  svg.append(content);
  viewport.append(svg);
  rootEl.append(viewport);
}

function captureAssetHref(captureId: string): string {
  const token = window.__quailbotToken ?? "";
  const params = new URLSearchParams({ captureId });
  if (token) params.set("token", token);
  return `/assets/workspace-capture?${params.toString()}`;
}
