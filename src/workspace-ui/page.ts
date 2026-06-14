export function renderWorkspacePage(token: string): string {
  const attributeToken = escapeAttribute(token);
  const urlToken = encodeURIComponent(token);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Quailbot Workspace Calibrator</title>
    <link rel="stylesheet" href="/assets/styles.css?token=${urlToken}">
  </head>
  <body>
    <div id="app" data-token="${attributeToken}"></div>
    <script type="module" src="/assets/client.js?token=${urlToken}"></script>
  </body>
</html>`;
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
