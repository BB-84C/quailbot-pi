export const workspaceUiClientJs = String.raw`
const app = document.getElementById("app");
const FIXTURE_WIDTH = 800;
const FIXTURE_HEIGHT = 500;
const MODES = ["select", "draw-roi", "pick-anchor"];

const state = {
  token: app?.dataset.token ?? "",
  workspaceJson: {},
  selected: null,
  dirty: false,
  mode: "select",
  statusText: "Loading workspace...",
  workspacePath: "",
  validationHash: "",
  lastSavedHash: "",
  pendingActivation: null,
  importCliName: "",
  importAdded: [],
  importSkipped: [],
  importConflicts: [],
  importResolutions: {},
  captureFrame: null,
  collapsedGroups: [],
};

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value) {
  return isRecord(value) ? value : {};
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function arrayOfRecords(value) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function asString(value) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function booleanValue(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}

function normalizeWorkspaceJson(input) {
  const parsedRoot = cloneJson(record(input));
  const gui = record(parsedRoot.GUI);
  const root = isRecord(parsedRoot.GUI)
    ? {
        ...gui,
        ...parsedRoot,
        groups: gui.groups ?? parsedRoot.groups,
        rois: gui.rois ?? parsedRoot.rois,
        anchors: gui.anchors ?? parsedRoot.anchors,
        cli_params: gui.cli_params ?? parsedRoot.cli_params,
        tools: gui.tools ?? parsedRoot.tools,
      }
    : parsedRoot;

  delete root.GUI;
  root.groups = arrayOfRecords(root.groups).map((group) => cloneJson(group));
  root.rois = arrayOfRecords(root.rois).map((roi) => cloneJson(roi));
  root.anchors = arrayOfRecords(root.anchors).map((anchor) => cloneJson(anchor));

  if (isRecord(root.cli_params)) {
    const cliParams = cloneJson(root.cli_params);
    const parameterContainer = record(cliParams.parameters);
    const actionContainer = record(cliParams.action_commands);
    cliParams.parameters = { ...parameterContainer, items: arrayOfRecords(parameterContainer.items).map((item) => cloneJson(item)) };
    cliParams.action_commands = { ...actionContainer, items: arrayOfRecords(actionContainer.items).map((item) => cloneJson(item)) };
    root.cli_params = cliParams;
  }

  return root;
}

function workspacePayload() {
  return normalizeWorkspaceJson(state.workspaceJson);
}

function ensureVisualArrays() {
  if (!Array.isArray(state.workspaceJson.groups)) state.workspaceJson.groups = [];
  if (!Array.isArray(state.workspaceJson.rois)) state.workspaceJson.rois = [];
  if (!Array.isArray(state.workspaceJson.anchors)) state.workspaceJson.anchors = [];
}

function ensureCliSections() {
  if (!isRecord(state.workspaceJson.cli_params)) {
    state.workspaceJson.cli_params = {};
  }
  const cliParams = state.workspaceJson.cli_params;
  if (!isRecord(cliParams.parameters)) cliParams.parameters = {};
  if (!Array.isArray(cliParams.parameters.items)) cliParams.parameters.items = [];
  if (!isRecord(cliParams.action_commands)) cliParams.action_commands = {};
  if (!Array.isArray(cliParams.action_commands.items)) cliParams.action_commands.items = [];
  return cliParams;
}

function groups() {
  ensureVisualArrays();
  return state.workspaceJson.groups;
}

function rois() {
  ensureVisualArrays();
  return state.workspaceJson.rois;
}

function anchors() {
  ensureVisualArrays();
  return state.workspaceJson.anchors;
}

function parameterItems() {
  return ensureCliSections().parameters.items;
}

function actionItems() {
  return ensureCliSections().action_commands.items;
}

function visualItems() {
  return [...groups(), ...rois(), ...anchors()];
}

function itemGroupName(item) {
  return asString(item.parent) ?? asString(item.group);
}

function currentCliName() {
  const cliParams = record(state.workspaceJson.cli_params);
  return asString(cliParams.cli_name) ?? asString(cliParams.CLI_Name) ?? state.importCliName ?? "default";
}

function selectedGroupName() {
  if (!state.selected) return undefined;
  if (state.selected.kind === "group") return state.selected.name;
  const item = selectedItem();
  return item ? itemGroupName(item) : undefined;
}

function canvasFrame() {
  const frame = record(state.captureFrame);
  return {
    width: Math.max(1, numberValue(frame.imageWidth, FIXTURE_WIDTH)),
    height: Math.max(1, numberValue(frame.imageHeight, FIXTURE_HEIGHT)),
    href: asString(frame.href),
  };
}

function groupCollapsed(groupName) {
  return Array.isArray(state.collapsedGroups) && state.collapsedGroups.includes(groupName);
}

function toggleGroupCollapse(groupName) {
  const collapsed = new Set(Array.isArray(state.collapsedGroups) ? state.collapsedGroups : []);
  if (collapsed.has(groupName)) {
    collapsed.delete(groupName);
  } else {
    collapsed.add(groupName);
  }
  state.collapsedGroups = [...collapsed];
  setStatus((collapsed.has(groupName) ? 'Collapsed ' : 'Expanded ') + 'group ' + groupName + '.');
  renderShell();
}

function findNamed(items, name) {
  return items.find((item) => asString(item.name) === name);
}

function selectedItem() {
  if (!state.selected) return undefined;
  switch (state.selected.kind) {
    case "group":
      return findNamed(groups(), state.selected.name);
    case "roi":
      return findNamed(rois(), state.selected.name);
    case "anchor":
      return findNamed(anchors(), state.selected.name);
    case "parameter":
      return findNamed(parameterItems(), state.selected.name);
    case "action":
      return findNamed(actionItems(), state.selected.name);
    default:
      return undefined;
  }
}

function selectItem(kind, name) {
  state.selected = { kind, name };
}

function ensureSelection() {
  const selected = selectedItem();
  if (selected) {
    return;
  }

  const fallback = rois()[0] ?? anchors()[0] ?? groups()[0] ?? parameterItems()[0] ?? actionItems()[0];
  if (!fallback) {
    state.selected = null;
    return;
  }

  const name = asString(fallback.name);
  if (!name) {
    state.selected = null;
    return;
  }

  if (fallback === rois()[0]) {
    selectItem("roi", name);
  } else if (fallback === anchors()[0]) {
    selectItem("anchor", name);
  } else if (fallback === groups()[0]) {
    selectItem("group", name);
  } else if (fallback === parameterItems()[0]) {
    selectItem("parameter", name);
  } else {
    selectItem("action", name);
  }
}

function nextUniqueName(prefix) {
  let index = 1;
  while (visualItems().some((item) => asString(item.name) === prefix + "-" + index)) {
    index += 1;
  }
  return prefix + "-" + index;
}

function setDirty(value) {
  state.dirty = value;
  if (value) {
    state.validationHash = '';
    state.lastSavedHash = '';
    state.pendingActivation = null;
  }
}

function panel(title, className, tools, body) {
  return '<section class="panel ' + className + '">'
    + '<div class="panel-header"><div class="panel-title">' + title + '</div><div class="panel-tools">' + tools + '</div></div>'
    + '<div class="panel-body">' + body + '</div>'
    + '</section>';
}

function itemButton(kind, name, title, meta, extraClass) {
  const selected = state.selected && state.selected.kind === kind && state.selected.name === name;
  return '<button class="tree-item ' + (selected ? 'is-selected ' : '') + (extraClass ?? '') + '"'
    + ' type="button" data-action="select-item" data-kind="' + escapeAttr(kind) + '" data-name="' + escapeAttr(name) + '">'
    + '<span class="tree-item-title">' + escapeHtml(title) + '</span>'
    + '<span class="tree-item-meta">' + escapeHtml(meta) + '</span>'
    + '</button>';
}

function renderGroupBranch(groupName) {
  const group = findNamed(groups(), groupName);
  if (!group) return "";

  const childGroups = groups().filter((candidate) => itemGroupName(candidate) === groupName).map((candidate) => asString(candidate.name)).filter(Boolean);
  const childRois = rois().filter((roi) => itemGroupName(roi) === groupName);
  const childAnchors = anchors().filter((anchor) => itemGroupName(anchor) === groupName);
  const hasChildren = childGroups.length + childRois.length + childAnchors.length > 0;
  const collapsed = groupCollapsed(groupName);

  return '<li class="tree-node group-branch ' + (collapsed ? 'is-collapsed' : '') + '">'
    + '<div class="tree-group-row">'
    + '<button class="tree-toggle" type="button" data-action="toggle-group-collapse" data-name="' + escapeAttr(groupName) + '" aria-expanded="' + String(!collapsed) + '" aria-label="' + (collapsed ? 'Expand ' : 'Collapse ') + 'group ' + escapeAttr(groupName) + '"' + (hasChildren ? '' : ' disabled') + '>' + (collapsed ? '+' : '-') + '</button>'
    + itemButton('group', groupName, groupName, booleanValue(group.active, true) ? 'group' : 'group | inactive', 'group-node')
    + '</div>'
    + '<ul class="tree-children" aria-hidden="' + String(collapsed) + '">'
    + childGroups.map((name) => renderGroupBranch(name)).join('')
    + childRois.map((roi) => renderVisualLeaf('roi', roi, 'roi')).join('')
    + childAnchors.map((anchor) => renderVisualLeaf('anchor', anchor, 'anchor')).join('')
    + '</ul>'
    + '</li>';
}

function renderVisualLeaf(kind, item, label) {
  const name = asString(item.name) ?? label;
  return '<li class="tree-node">' + itemButton(kind, name, name, label + (booleanValue(item.active, true) ? '' : ' | inactive'), kind + '-node') + '</li>';
}

function renderTreeSection(title, content) {
  return '<section class="tree-section"><h3>' + escapeHtml(title) + '</h3>' + content + '</section>';
}

function renderWorkspaceTree() {
  const rootGroups = groups().filter((group) => itemGroupName(group) === undefined).map((group) => asString(group.name)).filter(Boolean);
  const ungroupedRois = rois().filter((roi) => itemGroupName(roi) === undefined);
  const ungroupedAnchors = anchors().filter((anchor) => itemGroupName(anchor) === undefined);

  return '<div class="tree-toolbar">'
    + '<button type="button" class="toolbar-button" data-action="add-group">Add Group</button>'
    + '<button type="button" class="toolbar-button" data-action="add-roi">Add ROI</button>'
    + '<button type="button" class="toolbar-button" data-action="add-anchor">Add Anchor</button>'
    + '</div>'
    + '<div class="tree-scroll">'
    + renderTreeSection('Groups', '<ul class="tree-list">' + rootGroups.map((name) => renderGroupBranch(name)).join('') + '</ul>')
    + renderTreeSection('Ungrouped ROIs', '<ul class="tree-list">' + ungroupedRois.map((roi) => renderVisualLeaf('roi', roi, 'roi')).join('') + '</ul>')
    + renderTreeSection('Ungrouped Anchors', '<ul class="tree-list">' + ungroupedAnchors.map((anchor) => renderVisualLeaf('anchor', anchor, 'anchor')).join('') + '</ul>')
    + renderTreeSection('CLI Parameters', '<ul class="tree-list">' + parameterItems().map((item) => '<li class="tree-node">' + itemButton('parameter', asString(item.name) ?? 'parameter', asString(item.name) ?? 'parameter', currentCliName() + ':parameter', 'parameter-node') + '</li>').join('') + '</ul>')
    + renderTreeSection('CLI Actions', '<ul class="tree-list">' + actionItems().map((item) => '<li class="tree-node">' + itemButton('action', asString(item.name) ?? 'action', asString(item.name) ?? 'action', currentCliName() + ':action', 'action-node') + '</li>').join('') + '</ul>')
    + '</div>';
}

function renderModeButton(mode, label) {
  return '<button type="button" class="toolbar-button ' + (state.mode === mode ? 'is-active' : '') + '" data-action="set-mode" data-mode="' + escapeAttr(mode) + '">' + escapeHtml(label) + '</button>';
}

function renderCanvas() {
  const frame = canvasFrame();
  const roiMarkup = rois().map((roi) => {
    const name = asString(roi.name) ?? 'roi';
    const selected = state.selected && state.selected.kind === 'roi' && state.selected.name === name;
    const x = numberValue(roi.x, 80);
    const y = numberValue(roi.y, 80);
    const w = Math.max(1, numberValue(roi.w, 160));
    const h = Math.max(1, numberValue(roi.h, 120));
    return '<g class="canvas-overlay roi-overlay ' + (selected ? 'is-selected' : '') + '">'
      + '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" data-action="select-item" data-kind="roi" data-name="' + escapeAttr(name) + '"></rect>'
      + '<text x="' + (x + 8) + '" y="' + (y + 18) + '">' + escapeHtml(name) + '</text>'
      + '</g>';
  }).join('');

  const anchorMarkup = anchors().map((anchor) => {
    const name = asString(anchor.name) ?? 'anchor';
    const selected = state.selected && state.selected.kind === 'anchor' && state.selected.name === name;
    const x = numberValue(anchor.x, 320);
    const y = numberValue(anchor.y, 180);
    return '<g class="canvas-overlay anchor-overlay ' + (selected ? 'is-selected' : '') + '">'
      + '<circle cx="' + x + '" cy="' + y + '" r="9" data-action="select-item" data-kind="anchor" data-name="' + escapeAttr(name) + '"></circle>'
      + '<text x="' + (x + 14) + '" y="' + (y - 12) + '">' + escapeHtml(name) + '</text>'
      + '</g>';
  }).join('');

  const gridLines = [];
  for (let x = 100; x < frame.width; x += 100) {
    gridLines.push('<line x1="' + x + '" y1="0" x2="' + x + '" y2="' + frame.height + '"></line>');
  }
  for (let y = 100; y < frame.height; y += 100) {
    gridLines.push('<line x1="0" y1="' + y + '" x2="' + frame.width + '" y2="' + y + '"></line>');
  }
  const imageMarkup = frame.href
    ? '<image class="workspace-capture" href="' + escapeAttr(state.captureFrame.href) + '" x="0" y="0" width="' + frame.width + '" height="' + frame.height + '" preserveAspectRatio="none"></image>'
    : '<text class="capture-missing" x="24" y="42">No .quailbot-pi/workspace-capture.png loaded</text>';

  return '<div class="mode-strip">'
    + renderModeButton('select', 'Select')
    + renderModeButton('draw-roi', 'Draw ROI')
    + renderModeButton('pick-anchor', 'Pick Anchor')
    + '</div>'
    + '<div class="canvas-scroller">'
    + '<div class="canvas-stage">'
    + '<svg class="workspace-canvas" viewBox="0 0 ' + frame.width + ' ' + frame.height + '" preserveAspectRatio="xMidYMid meet">'
    + '<rect class="canvas-backdrop" x="0" y="0" width="' + frame.width + '" height="' + frame.height + '" data-action="canvas-click"></rect>'
    + imageMarkup
    + '<g class="canvas-grid">' + gridLines.join('') + '</g>'
    + '<g class="canvas-frame"><rect x="16" y="16" width="' + Math.max(1, frame.width - 32) + '" height="' + Math.max(1, frame.height - 32) + '"></rect></g>'
    + roiMarkup
    + anchorMarkup
    + '</svg>'
    + '</div>'
    + '</div>'
    + '<div class="canvas-hint">Mode ' + escapeHtml(state.mode) + '. In draw/pick modes, click the capture image to add a new ROI or anchor.</div>';
}

function renderField(label, body) {
  return '<label class="field"><span>' + escapeHtml(label) + '</span>' + body + '</label>';
}

function renderNumberField(kind, name, field, value) {
  return '<input type="number" step="1" value="' + escapeAttr(String(value)) + '" data-action="edit-number" data-kind="' + escapeAttr(kind) + '" data-name="' + escapeAttr(name) + '" data-field="' + escapeAttr(field) + '">';
}

function renderSelectionEditor() {
  const item = selectedItem();
  if (!state.selected || !item) {
    return '<p class="empty-state">Select a group, ROI, anchor, parameter, or action to inspect it.</p>';
  }

  const name = asString(item.name) ?? state.selected.name;
  if (state.selected.kind === 'roi') {
    return '<section class="editor-block"><h3>ROI Geometry</h3><div class="field-grid">'
      + renderField('x', renderNumberField('roi', name, 'x', numberValue(item.x, 0)))
      + renderField('y', renderNumberField('roi', name, 'y', numberValue(item.y, 0)))
      + renderField('w', renderNumberField('roi', name, 'w', Math.max(1, numberValue(item.w, 1))))
      + renderField('h', renderNumberField('roi', name, 'h', Math.max(1, numberValue(item.h, 1))))
      + '</div></section>';
  }

  if (state.selected.kind === 'anchor') {
    return '<section class="editor-block"><h3>Anchor Geometry</h3><div class="field-grid">'
      + renderField('x', renderNumberField('anchor', name, 'x', numberValue(item.x, 0)))
      + renderField('y', renderNumberField('anchor', name, 'y', numberValue(item.y, 0)))
      + '</div></section>';
  }

  return '<section class="editor-block"><h3>' + escapeHtml(state.selected.kind) + '</h3><pre class="json-preview">' + escapeHtml(JSON.stringify(item, null, 2)) + '</pre></section>';
}

function renderInspector() {
  const activationHash = !state.dirty ? state.lastSavedHash : '';
  return '<section class="editor-block"><h3>Workspace Actions</h3><div class="field-grid single-column">'
    + renderField('target path', '<input type="text" value="' + escapeAttr(state.workspacePath) + '" data-action="set-target-path">')
    + '</div><div class="button-row">'
    + '<button type="button" class="toolbar-button" data-action="validate-workspace">Validate</button>'
    + '<button type="button" class="toolbar-button" data-action="save-workspace">Save</button>'
    + '<button type="button" class="toolbar-button" data-action="request-activation"' + (activationHash ? '' : ' disabled') + '>Request Activation</button>'
    + '</div></section>'
    + renderSelectionEditor()
    + '<section class="editor-block"><h3>UI State</h3><pre class="json-preview">' + escapeHtml(JSON.stringify({
      selected: state.selected,
      dirty: state.dirty,
      mode: state.mode,
      validationHash: state.validationHash,
      lastSavedHash: state.lastSavedHash,
      pendingActivation: state.pendingActivation,
      captureFrame: state.captureFrame,
    }, null, 2)) + '</pre></section>';
}

function renderConflictRow(conflict) {
  const currentValue = state.importResolutions[conflict.ref] ?? '';
  return '<tr>'
    + '<td>' + escapeHtml(conflict.ref) + '</td>'
    + '<td><pre class="table-json">' + escapeHtml(JSON.stringify(conflict.existing, null, 2)) + '</pre></td>'
    + '<td><pre class="table-json">' + escapeHtml(JSON.stringify(conflict.imported, null, 2)) + '</pre></td>'
    + '<td><select data-action="set-conflict-resolution" data-ref="' + escapeAttr(conflict.ref) + '">'
    + '<option value=""' + (currentValue === '' ? ' selected' : '') + '>Choose</option>'
    + '<option value="existing"' + (currentValue === 'existing' ? ' selected' : '') + '>Keep existing</option>'
    + '<option value="imported"' + (currentValue === 'imported' ? ' selected' : '') + '>Use imported</option>'
    + '<option value="skip"' + (currentValue === 'skip' ? ' selected' : '') + '>Skip</option>'
    + '</select></td>'
    + '</tr>';
}

function renderImportPanel() {
  return '<section class="editor-block"><h3>CLI Capability Import</h3><div class="field-grid single-column">'
    + renderField('cli name', '<input type="text" value="' + escapeAttr(state.importCliName || currentCliName()) + '" data-action="set-cli-name">')
    + '</div><div class="button-row">'
    + '<button type="button" class="toolbar-button" data-action="import-cli">Import CLI</button>'
    + '<button type="button" class="toolbar-button" data-action="apply-import-resolutions"' + (state.importConflicts.length ? '' : ' disabled') + '>Apply Choices</button>'
    + '</div></section>'
    + '<section class="editor-block"><h3>Import Summary</h3><pre class="json-preview">' + escapeHtml(JSON.stringify({ added: state.importAdded, skipped: state.importSkipped, conflicts: state.importConflicts.map((conflict) => conflict.ref) }, null, 2)) + '</pre></section>'
    + '<section class="editor-block"><h3>Conflict Table</h3>'
    + (state.importConflicts.length
      ? '<div class="import-conflicts"><table><thead><tr><th>ref</th><th>existing</th><th>imported</th><th>resolution</th></tr></thead><tbody>'
        + state.importConflicts.map((conflict) => renderConflictRow(conflict)).join('')
        + '</tbody></table></div>'
      : '<p class="empty-state">No CLI import conflicts are staged.</p>')
    + '</section>';
}

function renderShell() {
  if (!app) return;
  ensureSelection();
  const dirtyBadge = state.dirty ? '<span class="status-badge dirty">dirty</span>' : '<span class="status-badge clean">clean</span>';
  app.innerHTML = '<div class="workspace-shell">'
    + '<header class="workspace-header">'
    + '<div><h1>Quailbot Workspace Calibrator</h1><div class="workspace-status">' + escapeHtml(state.statusText) + '</div></div>'
    + '<div class="status-badges">' + dirtyBadge + '<span class="status-badge mode">mode ' + escapeHtml(state.mode) + '</span></div>'
    + '</header>'
    + '<main class="workspace-main">'
    + panel('Workspace Tree', 'tree-panel', '', renderWorkspaceTree())
    + panel('Calibration Canvas', 'canvas-panel', '', renderCanvas())
    + '<div class="panel-stack">'
    + panel('Inspector', 'inspector-panel', '', renderInspector())
    + panel('Import CLI', 'import-panel', '', renderImportPanel())
    + '</div>'
    + '</main>'
    + '</div>';
}

function setStatus(message) {
  state.statusText = message;
}

async function fetchJson(path, init) {
  const response = await fetch(path, init);
  const body = await response.json();
  if (!response.ok || !body.ok) {
    throw new Error(body.error || ('request failed: ' + path));
  }
  return body;
}

async function loadWorkspace() {
  const body = await fetchJson('/api/workspace?token=' + encodeURIComponent(state.token));
  state.workspaceJson = normalizeWorkspaceJson(body.workspaceJson);
  state.workspacePath = body.summary.path;
  state.validationHash = '';
  state.lastSavedHash = body.summary.hash;
  state.pendingActivation = null;
  state.importCliName = body.summary.cli.default_cli_name;
  state.importAdded = [];
  state.importSkipped = [];
  state.importConflicts = [];
  state.importResolutions = {};
  state.captureFrame = body.captureFrame ?? null;
  state.collapsedGroups = [];
  setDirty(false);
  setStatus(body.summary.path + ' | sha256 ' + body.summary.hash.slice(0, 12));
  ensureSelection();
  renderShell();
}

async function validateWorkspace() {
  const payload = workspacePayload();
  setStatus('Validating workspace candidate...');
  renderShell();
  const body = await fetchJson('/api/validate?token=' + encodeURIComponent(state.token), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ workspaceJson: payload }),
  });
  state.workspaceJson = normalizeWorkspaceJson(payload);
  state.validationHash = body.hash;
  setStatus('Validated ' + body.summary.path + ' | sha256 ' + body.hash.slice(0, 12));
  renderShell();
}

async function saveWorkspace() {
  const payload = workspacePayload();
  setStatus('Saving workspace JSON...');
  renderShell();
  const body = await fetchJson('/api/write?token=' + encodeURIComponent(state.token), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-quailbot-workspace-ui-token': state.token,
    },
    body: JSON.stringify({ workspaceJson: payload, targetPath: state.workspacePath }),
  });
  state.workspaceJson = normalizeWorkspaceJson(payload);
  state.workspacePath = body.targetPath;
  state.validationHash = body.hash;
  state.lastSavedHash = body.hash;
  setDirty(false);
  setStatus('Saved ' + body.targetPath + ' | sha256 ' + body.hash.slice(0, 12));
  renderShell();
}

async function requestActivation() {
  const expectedHash = state.lastSavedHash;
  if (state.dirty || !expectedHash) {
    throw new Error('save a clean workspace before requesting activation');
  }
  setStatus('Staging pending activation...');
  renderShell();
  const body = await fetchJson('/api/request-activation?token=' + encodeURIComponent(state.token), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-quailbot-workspace-ui-token': state.token,
    },
    body: JSON.stringify({ targetPath: state.workspacePath, expectedHash }),
  });
  state.pendingActivation = body.pendingWorkspaceActivation;
  setStatus('Pending activation requested for ' + body.pendingWorkspaceActivation.targetPath);
  renderShell();
}

async function importCliCapabilities() {
  const cliName = (state.importCliName || currentCliName()).trim();
  if (!cliName) {
    throw new Error('CLI name is required before import');
  }

  const before = JSON.stringify(record(state.workspaceJson.cli_params));
  setStatus('Importing CLI capabilities from ' + cliName + '...');
  renderShell();
  const body = await fetchJson('/api/import-cli?token=' + encodeURIComponent(state.token), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-quailbot-workspace-ui-token': state.token,
    },
    body: JSON.stringify({
      cliName,
      workspaceJson: workspacePayload(),
      resolutions: state.importResolutions,
    }),
  });
  state.workspaceJson = normalizeWorkspaceJson(body.workspaceJson);
  state.importCliName = cliName;
  state.importAdded = Array.isArray(body.added) ? body.added : [];
  state.importSkipped = Array.isArray(body.skipped) ? body.skipped : [];
  state.importConflicts = Array.isArray(body.conflicts) ? body.conflicts : [];
  if (JSON.stringify(record(state.workspaceJson.cli_params)) !== before) {
    setDirty(true);
  }
  setStatus(state.importConflicts.length ? 'CLI import found ' + state.importConflicts.length + ' conflict(s).' : 'CLI import merged into draft workspace.');
  renderShell();
}

function addGroup() {
  const name = nextUniqueName('group');
  const group = { name, active: true };
  const parent = selectedGroupName();
  if (parent && state.selected && state.selected.kind === 'group') {
    group.parent = parent;
  }
  groups().push(group);
  selectItem('group', name);
  setDirty(true);
  setStatus('Added group ' + name);
  renderShell();
}

function addRoi(x, y) {
  const name = nextUniqueName('roi');
  const roi = { name, active: true, x: x ?? 120, y: y ?? 80, w: 180, h: 120 };
  const groupName = selectedGroupName();
  if (groupName) roi.group = groupName;
  rois().push(roi);
  selectItem('roi', name);
  setDirty(true);
  setStatus('Added ROI ' + name);
  renderShell();
}

function addAnchor(x, y) {
  const name = nextUniqueName('anchor');
  const anchor = { name, active: true, x: x ?? 320, y: y ?? 220 };
  const groupName = selectedGroupName();
  if (groupName) anchor.group = groupName;
  if (state.selected && state.selected.kind === 'roi') {
    anchor.linked_ROIs = [state.selected.name];
  }
  anchors().push(anchor);
  selectItem('anchor', name);
  setDirty(true);
  setStatus('Added anchor ' + name);
  renderShell();
}

function canvasPoint(node, event) {
  const svg = node.ownerSVGElement || node.closest('svg');
  const frame = canvasFrame();
  const viewport = canvasViewport(svg, frame);
  const width = viewport.width || frame.width;
  const height = viewport.height || frame.height;
  const x = Math.max(0, Math.min(frame.width, Math.round(((event.clientX - viewport.left) / width) * frame.width)));
  const y = Math.max(0, Math.min(frame.height, Math.round(((event.clientY - viewport.top) / height) * frame.height)));
  return { x, y };
}

function canvasViewport(svg, frame) {
  const rect = svg.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return { left: rect.left, top: rect.top, width: frame.width, height: frame.height };
  }

  const scale = Math.min(rect.width / frame.width, rect.height / frame.height);
  const renderedWidth = frame.width * scale;
  const renderedHeight = frame.height * scale;
  const renderedLeft = rect.left + (rect.width - renderedWidth) / 2;
  const renderedTop = rect.top + (rect.height - renderedHeight) / 2;
  return { left: renderedLeft, top: renderedTop, width: renderedWidth, height: renderedHeight };
}

function updateNumericField(kind, name, field, rawValue) {
  const numeric = Math.round(Number(rawValue));
  if (!Number.isFinite(numeric)) {
    return;
  }

  let target;
  if (kind === 'roi') target = findNamed(rois(), name);
  if (kind === 'anchor') target = findNamed(anchors(), name);
  if (!target) return;

  target[field] = (field === 'w' || field === 'h') ? Math.max(1, numeric) : numeric;
  setDirty(true);
  setStatus('Updated ' + kind + ' ' + name + ' ' + field + '.');
  renderShell();
}

async function handleAction(actionNode, event) {
  switch (actionNode.dataset.action) {
    case 'select-item':
      selectItem(actionNode.dataset.kind, actionNode.dataset.name);
      setStatus('Selected ' + actionNode.dataset.kind + ' ' + actionNode.dataset.name + '.');
      renderShell();
      return;
    case 'set-mode':
      state.mode = MODES.includes(actionNode.dataset.mode) ? actionNode.dataset.mode : MODES[0];
      setStatus('Mode set to ' + state.mode + '.');
      renderShell();
      return;
    case 'toggle-group-collapse':
      toggleGroupCollapse(actionNode.dataset.name);
      return;
    case 'add-group':
      addGroup();
      return;
    case 'add-roi':
      addRoi();
      return;
    case 'add-anchor':
      addAnchor();
      return;
    case 'validate-workspace':
      await validateWorkspace();
      return;
    case 'save-workspace':
      await saveWorkspace();
      return;
    case 'request-activation':
      await requestActivation();
      return;
    case 'import-cli':
      await importCliCapabilities();
      return;
    case 'apply-import-resolutions':
      await importCliCapabilities();
      return;
    case 'canvas-click': {
      const point = canvasPoint(actionNode, event);
      if (state.mode === 'draw-roi') {
        addRoi(Math.max(0, point.x - 90), Math.max(0, point.y - 60));
      } else if (state.mode === 'pick-anchor') {
        addAnchor(point.x, point.y);
      } else {
        state.selected = null;
        setStatus('Canvas selected.');
        renderShell();
      }
      return;
    }
  }
}

function bindEvents() {
  if (!app) return;

  app.addEventListener('click', (event) => {
    const target = event.target;
    if (!target || typeof target.closest !== 'function') {
      return;
    }
    const actionNode = target.closest('[data-action]');
    if (!actionNode) {
      return;
    }
    void handleAction(actionNode, event).catch(reportError);
  });

  app.addEventListener('change', (event) => {
    const target = event.target;
    if (!target || !target.dataset) {
      return;
    }

    switch (target.dataset.action) {
      case 'edit-number':
        updateNumericField(target.dataset.kind, target.dataset.name, target.dataset.field, target.value);
        return;
      case 'set-target-path':
        state.workspacePath = String(target.value || '').trim();
        setDirty(true);
        setStatus('Updated target path.');
        renderShell();
        return;
      case 'set-cli-name':
        state.importCliName = String(target.value || '').trim();
        setStatus('Updated CLI import target.');
        renderShell();
        return;
      case 'set-conflict-resolution':
        state.importResolutions[target.dataset.ref] = String(target.value || '');
        setStatus('Staged CLI conflict choice for ' + target.dataset.ref + '.');
        renderShell();
        return;
    }
  });
}

function reportError(error) {
  setStatus(error instanceof Error ? error.message : String(error));
  renderShell();
}

bindEvents();
renderShell();
loadWorkspace().catch(reportError);
`;
