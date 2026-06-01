export type QuailbotToolResult = {
  ok: boolean;
  action: string;
  action_input: unknown;
  primary_result: unknown;
  linked_observation?: unknown;
};
