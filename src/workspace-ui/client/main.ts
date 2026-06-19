import { effectiveScale, screenToCanvas } from "../shared/geometry.js";

declare global {
  interface Window {
    __quailbotWorkspaceUiReady?: boolean;
    __quailbotShared?: {
      effectiveScale: typeof effectiveScale;
      screenToCanvas: typeof screenToCanvas;
    };
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.__quailbotWorkspaceUiReady = true;
  window.__quailbotShared = { effectiveScale, screenToCanvas };
});
