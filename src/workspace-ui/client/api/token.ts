export function workspaceUiToken(): string {
  return document.head.querySelector('meta[name="quailbot-workspace-ui-token"]')?.getAttribute("content") ?? "";
}

export function jsonHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const token = workspaceUiToken();
  if (token) {
    headers["x-quailbot-workspace-ui-token"] = token;
  }
  return headers;
}
