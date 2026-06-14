export const workspaceUiCss = String.raw`
:root {
  color-scheme: dark;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #0b1020;
  color: #e6edf3;
}

* {
  box-sizing: border-box;
}

html,
body {
  width: 100%;
  height: 100dvh;
  margin: 0;
  overflow: hidden;
}

body {
  background: radial-gradient(circle at top left, #172554 0, #0b1020 36rem);
}

.workspace-shell {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  height: 100dvh;
  overflow: hidden;
}

.workspace-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.28);
  background: rgba(15, 23, 42, 0.86);
}

.workspace-header h1 {
  margin: 0;
  font-size: clamp(1rem, 1.6vw, 1.35rem);
  letter-spacing: 0.01em;
}

.workspace-status {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #93c5fd;
  font-size: 0.85rem;
}

.workspace-main {
  display: grid;
  grid-template-columns: clamp(16rem, 22vw, 26rem) minmax(22rem, 1fr) clamp(18rem, 26vw, 32rem);
  gap: 0.75rem;
  min-width: 0;
  min-height: 0;
  padding: 0.75rem;
  overflow: hidden;
}

.panel { min-width: 0; min-height: 0; overflow: auto; }

.panel {
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 0.875rem;
  background: rgba(15, 23, 42, 0.78);
  box-shadow: 0 1.25rem 3rem rgba(2, 6, 23, 0.28);
}

.panel-stack {
  display: grid;
  grid-template-rows: minmax(0, 1fr) minmax(10rem, auto);
  gap: 0.75rem;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.panel-header {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 0.75rem 0.875rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(15, 23, 42, 0.94);
  font-weight: 700;
}

.panel-body {
  padding: 0.875rem;
}

.canvas-placeholder {
  display: grid;
  min-height: min(36rem, 100%);
  place-items: center;
  border: 1px dashed rgba(147, 197, 253, 0.44);
  border-radius: 0.75rem;
  color: #bfdbfe;
}

pre {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: #cbd5e1;
}

@media (max-width: 56rem) {
  .workspace-main {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(12rem, 28vh) minmax(18rem, 1fr) minmax(12rem, 30vh);
  }
}
`;
