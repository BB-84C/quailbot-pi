declare global {
  interface Window {
    __quailbotToken?: string;
  }
}

export interface CliImportResponse {
  ok: boolean;
  payload?: unknown;
  usedSubcommand: "capabilities" | "capacities" | "" | string;
  error?: string;
}

export async function postCliImport(cliName: string, declaredCliNames: string[]): Promise<CliImportResponse> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (window.__quailbotToken) {
    headers["x-quailbot-token"] = window.__quailbotToken;
  }
  const response = await fetch("/api/cli-import", {
    method: "POST",
    headers,
    body: JSON.stringify({ cliName, declaredCliNames }),
  });
  return (await response.json()) as CliImportResponse;
}
