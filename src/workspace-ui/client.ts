export const workspaceUiClientJs = String.raw`
const app = document.getElementById("app");
const token = app?.dataset.token ?? "";

function panel(title, className, body) {
  return '<section class="panel ' + className + '"><div class="panel-header">' + title + '</div><div class="panel-body">' + body + '</div></section>';
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderShell(summaryText) {
  if (!app) return;
  app.innerHTML = '<div class="workspace-shell">'
    + '<header class="workspace-header"><h1>Quailbot Workspace Calibrator</h1><div class="workspace-status">' + escapeHtml(summaryText) + '</div></header>'
    + '<main class="workspace-main">'
    + panel('Workspace Tree', 'tree-panel', '<pre id="workspace-tree">Loading workspace summary...</pre>')
    + panel('Calibration Canvas', 'canvas-panel', '<div class="canvas-placeholder">Image/ROI calibration surface reserved for Task 6.</div>')
    + '<div class="panel-stack">'
    + panel('Inspector', 'inspector-panel', '<pre id="workspace-inspector">Select a workspace item to inspect.</pre>')
    + panel('Import CLI', 'import-panel', '<p>CLI capability import will be expanded in Task 6.</p>')
    + '</div>'
    + '</main></div>';
}

async function loadWorkspaceSummary() {
  renderShell('Loading...');
  const response = await fetch('/api/workspace?token=' + encodeURIComponent(token));
  const body = await response.json();
  if (!response.ok || !body.ok) {
    throw new Error(body.error || 'workspace summary failed');
  }
  const summary = body.summary;
  renderShell(summary.path + ' | sha256 ' + summary.hash.slice(0, 12));
  document.getElementById('workspace-tree').textContent = JSON.stringify({
    active_rois: summary.active_rois,
    active_anchors: summary.active_anchors,
    cli: summary.cli,
  }, null, 2);
  document.getElementById('workspace-inspector').textContent = JSON.stringify(summary, null, 2);
}

loadWorkspaceSummary().catch((error) => {
  renderShell('Workspace load failed');
  const tree = document.getElementById('workspace-tree');
  if (tree) tree.textContent = error instanceof Error ? error.message : String(error);
});
`;
