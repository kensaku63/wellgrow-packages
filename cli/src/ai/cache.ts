import type { ModelMessage } from "ai";

const ANTHROPIC_CACHE_BREAKPOINT = {
  anthropic: { cacheControl: { type: "ephemeral" as const } },
};

export interface TurnUsage {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens?: number;
  cacheReadTokens?: number;
}

/**
 * Prepend a cached system message and place a cache breakpoint
 * on the last user/tool message so the conversation prefix is reused.
 *
 * Breakpoint placement (Anthropic caches everything from the start
 * up to each breakpoint):
 *   1. system message  — static per session
 *   2. last user/tool  — growing conversation prefix
 */
export function prepareCachedMessages(
  system: string,
  messages: readonly ModelMessage[],
): ModelMessage[] {
  const systemMessage: ModelMessage = {
    role: "system",
    content: system,
    providerOptions: ANTHROPIC_CACHE_BREAKPOINT,
  };

  let lastBreakpointIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const role = messages[i].role;
    if (role === "user" || role === "tool") {
      lastBreakpointIdx = i;
      break;
    }
  }

  const cached = messages.map((msg, i) => {
    if (i !== lastBreakpointIdx) return msg;
    return {
      ...msg,
      providerOptions: {
        ...(msg.providerOptions ?? {}),
        ...ANTHROPIC_CACHE_BREAKPOINT,
      },
    } as ModelMessage;
  });

  return [systemMessage, ...cached];
}
