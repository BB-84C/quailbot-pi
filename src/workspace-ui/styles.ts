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

.disconnected-banner {
  border-bottom: 1px solid rgba(248, 113, 113, 0.35);
  background: rgba(127, 29, 29, 0.72);
  color: #fee2e2;
  padding: 0.65rem 1rem;
  font-weight: 700;
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
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 0.875rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(15, 23, 42, 0.94);
  font-weight: 700;
}

.panel-title {
  min-width: 0;
}

.panel-tools {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.panel-body {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
  min-height: 0;
  padding: 0.875rem;
  overflow: auto;
}

.canvas-placeholder {
  display: grid;
  min-height: min(36rem, 100%);
  place-items: center;
  border: 1px dashed rgba(147, 197, 253, 0.44);
  border-radius: 0.75rem;
  color: #bfdbfe;
}

.status-badges,
.button-row,
.tree-toolbar,
.mode-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.status-badge,
.toolbar-button {
  border-radius: 999px;
  border: 1px solid rgba(147, 197, 253, 0.28);
  background: rgba(30, 41, 59, 0.92);
  color: #e2e8f0;
  padding: 0.45rem 0.75rem;
  font: inherit;
}

.toolbar-button {
  cursor: pointer;
}

.toolbar-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.toolbar-button.danger {
  border-color: rgba(248, 113, 113, 0.45);
  color: #fecaca;
}

.toolbar-button.is-active,
.tree-item.is-selected {
  border-color: rgba(96, 165, 250, 0.9);
  background: rgba(30, 64, 175, 0.48);
}

.status-badge.dirty {
  border-color: rgba(251, 191, 36, 0.5);
  color: #fde68a;
}

.status-badge.clean {
  border-color: rgba(74, 222, 128, 0.38);
  color: #bbf7d0;
}

.tree-scroll,
.canvas-scroller,
.import-conflicts,
.json-preview,
.table-json {
  min-width: 0;
  min-height: 0;
  overflow: auto;
}

.tree-section {
  display: grid;
  gap: 0.5rem;
}

.tree-section h3,
.editor-block h3 {
  margin: 0;
  font-size: 0.9rem;
  color: #bfdbfe;
}

.tree-list,
.tree-children {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.375rem;
}

.tree-children {
  padding-left: 1rem;
  margin-top: 0.375rem;
}

.tree-node.is-collapsed > .tree-children {
  display: none;
}

.tree-group-row {
  display: flex;
  align-items: stretch;
  gap: 0.375rem;
}

.tree-group-row .tree-item {
  flex: 1 1 auto;
}

.tree-toggle {
  flex: 0 0 2.25rem;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 0.75rem;
  background: rgba(15, 23, 42, 0.68);
  color: #bfdbfe;
  cursor: pointer;
  font: inherit;
}

.tree-toggle:disabled {
  cursor: default;
  opacity: 0.45;
}

.tree-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  text-align: left;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 0.75rem;
  padding: 0.65rem 0.75rem;
  background: rgba(15, 23, 42, 0.68);
  color: #e2e8f0;
}

.tree-active-toggle,
.tree-item-main {
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.tree-active-toggle {
  flex: 0 0 auto;
  color: #bfdbfe;
}

.tree-active-toggle:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.tree-item-main {
  min-width: 0;
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  text-align: left;
}

.tree-item.is-forced-active {
  border-color: rgba(250, 204, 21, 0.48);
}

.tree-item-title,
.tree-item-meta {
  min-width: 0;
}

.tree-item-meta {
  font-size: 0.8rem;
  color: #93c5fd;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}

.field-grid.single-column {
  grid-template-columns: minmax(0, 1fr);
}

.field {
  display: grid;
  gap: 0.35rem;
  min-width: 0;
  color: #cbd5e1;
}

.field input,
.field select,
.editor-block select[multiple] {
  width: 100%;
  min-width: 0;
  border-radius: 0.625rem;
  border: 1px solid rgba(148, 163, 184, 0.24);
  background: rgba(2, 6, 23, 0.72);
  color: #e2e8f0;
  padding: 0.55rem 0.65rem;
  font: inherit;
}

.editor-block {
  display: grid;
  gap: 0.75rem;
}

.empty-state,
.canvas-hint {
  margin: 0;
  color: #93c5fd;
}

.canvas-stage {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  border: 1px solid rgba(147, 197, 253, 0.24);
  border-radius: 0.875rem;
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.96), rgba(30, 41, 59, 0.9));
}

.workspace-canvas {
  display: block;
  width: 100%;
  height: auto;
  min-height: 20rem;
}

.canvas-grid line,
.canvas-frame rect {
  stroke: rgba(148, 163, 184, 0.16);
  stroke-width: 1;
  fill: none;
}

.canvas-grid {
  pointer-events: none;
}

.canvas-frame {
  pointer-events: none;
}

.canvas-backdrop {
  fill: rgba(15, 23, 42, 0.82);
}

.workspace-capture {
  opacity: 0.92;
  pointer-events: none;
}

.capture-missing {
  fill: #93c5fd;
  font-size: 20px;
  opacity: 0.85;
  pointer-events: none;
}

.roi-overlay rect {
  fill: rgba(59, 130, 246, 0.22);
  stroke: rgba(147, 197, 253, 0.92);
  stroke-width: 2;
}

.roi-drag-preview {
  fill: rgba(6, 182, 212, 0.18);
  stroke: #00d1ff;
  stroke-width: 2;
  pointer-events: none;
}

.anchor-overlay circle {
  fill: rgba(251, 191, 36, 0.9);
  stroke: rgba(245, 158, 11, 0.92);
  stroke-width: 2;
}

.canvas-overlay.is-selected rect,
.canvas-overlay.is-selected circle {
  stroke: rgba(250, 204, 21, 1);
  stroke-width: 3;
}

.canvas-overlay text {
  fill: #f8fafc;
  font: 600 14px Inter, ui-sans-serif, system-ui, sans-serif;
  paint-order: stroke;
  stroke: rgba(15, 23, 42, 0.88);
  stroke-width: 3px;
}

.import-conflicts table {
  width: 100%;
  border-collapse: collapse;
}

.import-conflicts th,
.import-conflicts td {
  vertical-align: top;
  text-align: left;
  padding: 0.5rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
}

.table-json {
  max-height: 12rem;
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

  .field-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
`;
