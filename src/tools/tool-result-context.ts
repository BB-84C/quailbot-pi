import type { QuailbotToolResult } from "./tool-result.js";
import {
  buildQuailbotToolContent,
  DEFAULT_RECENT_FULL_CLI_RESULT_COUNT,
  DEFAULT_RECENT_FULL_SKILL_RESULT_COUNT,
  type ProjectionOptions,
  isDirectCliAction,
  isSkillAction,
} from "./tool-result-projection.js";

export type ToolResultContextPolicy = {
  recentFullCliResultCount?: number;
  recentFullSkillResultCount?: number;
  recentImageResultCount?: number;
  summaryMaxChars?: number;
  fullMaxChars?: number;
};

const DEFAULT_RECENT_IMAGE_RESULT_COUNT = 1;

export type ToolResultMessageLike = {
  content?: unknown;
  details?: unknown;
};

type ImageContentLike = {
  type: "image";
  data: string;
  mimeType: string;
};

const WORKSPACE_CONTEXT_HEADER = "WORKSPACE (Quailbot active workspace)";

export function projectQuailbotContextMessages<T extends ToolResultMessageLike>(
  messages: T[],
  policy?: ToolResultContextPolicy,
): T[];
export function projectQuailbotContextMessages<T>(
  messages: T[],
  policy?: ToolResultContextPolicy,
): T[];
export function projectQuailbotContextMessages<T>(
  messages: T[],
  policy: ToolResultContextPolicy = {},
): T[] {
  const recentFullLimit = nonNegativeInteger(policy.recentFullCliResultCount, DEFAULT_RECENT_FULL_CLI_RESULT_COUNT);
  const recentFullSkillLimit = nonNegativeInteger(
    policy.recentFullSkillResultCount,
    DEFAULT_RECENT_FULL_SKILL_RESULT_COUNT,
  );
  const recentImageLimit = nonNegativeInteger(policy.recentImageResultCount, DEFAULT_RECENT_IMAGE_RESULT_COUNT);
  const input = messages.filter((message) => !isLegacyWorkspaceContextMessage(message));
  const output = [...input];
  let directCliResultsSeen = 0;
  let skillResultsSeen = 0;
  let imageResultsSeen = 0;

  for (let index = input.length - 1; index >= 0; index -= 1) {
    const message = input[index];
    const result = quailbotToolResultOrUndefined(isRecord(message) ? message.details : undefined);
    if (result === undefined) {
      continue;
    }

    const directCli = isDirectCliAction(result.action);
    const skill = isSkillAction(result.action);
    const mode =
      (directCli && directCliResultsSeen < recentFullLimit) || (skill && skillResultsSeen < recentFullSkillLimit)
        ? "recent-full"
        : "summary";
    if (directCli) {
      directCliResultsSeen += 1;
    }
    if (skill) {
      skillResultsSeen += 1;
    }

    const images = isRecord(message) ? imageContent(message) : [];
    const keepImages = images.length > 0 && imageResultsSeen < recentImageLimit;
    if (images.length > 0) {
      imageResultsSeen += 1;
    }

    output[index] = {
      ...(message as Record<string, unknown>),
      content: [
        {
          type: "text",
          text: buildQuailbotToolContent(result, projectionOptions(mode, policy)),
        },
        ...(keepImages ? images : []),
      ],
    } as T;
  }

  return output;
}

function projectionOptions(mode: "summary" | "recent-full", policy: ToolResultContextPolicy): ProjectionOptions {
  return {
    mode,
    summaryMaxChars: policy.summaryMaxChars,
    fullMaxChars: policy.fullMaxChars,
  };
}

function quailbotToolResultOrUndefined(value: unknown): QuailbotToolResult | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (typeof value.ok !== "boolean" || typeof value.action !== "string") {
    return undefined;
  }

  if (!Object.hasOwn(value, "action_input") || !Object.hasOwn(value, "primary_result")) {
    return undefined;
  }

  return value as QuailbotToolResult;
}

function imageContent(message: ToolResultMessageLike): ImageContentLike[] {
  if (!Array.isArray(message.content)) {
    return [];
  }

  return message.content.filter((item): item is ImageContentLike => {
    if (!isRecord(item)) {
      return false;
    }

    return item.type === "image" && typeof item.data === "string" && typeof item.mimeType === "string";
  });
}

function isLegacyWorkspaceContextMessage(value: unknown): boolean {
  return (
    isRecord(value) &&
    value.customType === "quailbot-context" &&
    typeof value.content === "string" &&
    value.content.trimStart().startsWith(WORKSPACE_CONTEXT_HEADER)
  );
}

function nonNegativeInteger(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
