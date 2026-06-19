import { jsonHeaders } from "./token.js";

export interface CliImportResponse {
  ok: boolean;
  payload?: unknown;
  usedSubcommand: "capabilities" | "capacities" | "" | string;
  error?: string;
}

export async function postCliImport(cliName: string, declaredCliNames: string[]): Promise<CliImportResponse> {
  const response = await fetch("/api/cli-import", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ cliName, declaredCliNames }),
  });
  return (await response.json()) as CliImportResponse;
}
