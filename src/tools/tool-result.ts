export type QuailbotToolContent =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "image";
      data: string;
      mimeType: string;
    };

export type QuailbotToolResult = {
  ok: boolean;
  action: string;
  action_input: unknown;
  primary_result: unknown;
  linked_observation?: unknown;
  model_content?: QuailbotToolContent[];
};

export function attachModelContent<T extends QuailbotToolResult>(
  result: T,
  content: QuailbotToolContent[],
): T {
  if (content.length === 0) {
    return result;
  }

  Object.defineProperty(result, "model_content", {
    value: content,
    enumerable: false,
    configurable: true,
  });
  return result;
}

export function modelContent(result: QuailbotToolResult): QuailbotToolContent[] {
  return result.model_content ?? [];
}
