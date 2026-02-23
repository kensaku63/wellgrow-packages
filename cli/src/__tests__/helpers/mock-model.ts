import type { LanguageModel } from "ai";
import type { AgentLoopCallbacks } from "../../core/agent-loop.js";

export interface MockTurn {
  text?: string;
  toolCalls?: Array<{
    name: string;
    args: Record<string, unknown>;
  }>;
  error?: Error;
}

/**
 * AI SDK v6 の LanguageModelV3 に準拠したモックモデル。
 * ターンごとの応答を配列で定義し、streamText から利用可能。
 */
export function createMockModel(turns: MockTurn[]): LanguageModel {
  let turnIndex = 0;

  return {
    specificationVersion: "v3",
    modelId: "mock-model",
    provider: "mock",
    supportedUrls: {},

    async doGenerate() {
      throw new Error("Mock model: doGenerate not implemented — use doStream");
    },

    async doStream() {
      const turn = turns[turnIndex++];
      if (!turn) throw new Error("Mock model: no more turns defined");

      if (turn.error) {
        const error = turn.error;
        const stream = new ReadableStream({
          pull(controller) {
            controller.error(error);
          },
        });
        return { stream, rawCall: { rawPrompt: null, rawSettings: {} } };
      }

      const parts: Array<Record<string, unknown>> = [];
      const textId = `text_${turnIndex}`;

      if (turn.text) {
        parts.push({ type: "text-start", id: textId });
        parts.push({ type: "text-delta", id: textId, delta: turn.text });
        parts.push({ type: "text-end", id: textId });
      }

      for (const tc of turn.toolCalls ?? []) {
        const callId = `call_${turnIndex}_${tc.name}`;
        parts.push({
          type: "tool-call",
          toolCallId: callId,
          toolName: tc.name,
          input: JSON.stringify(tc.args),
        });
      }

      const hasToolCalls = (turn.toolCalls?.length ?? 0) > 0;

      parts.push({
        type: "finish",
        finishReason: {
          unified: hasToolCalls ? "tool-calls" : "stop",
          raw: undefined,
        },
        usage: {
          inputTokens: { total: 10, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 20, text: undefined, reasoning: undefined },
        },
      });

      let partIndex = 0;
      const stream = new ReadableStream({
        pull(controller) {
          if (partIndex < parts.length) {
            controller.enqueue(parts[partIndex++]);
          } else {
            controller.close();
          }
        },
      });

      return { stream, rawCall: { rawPrompt: null, rawSettings: {} } };
    },
  } as unknown as LanguageModel;
}

export function createNoopCallbacks(): AgentLoopCallbacks {
  return {
    onMessageUpdate: () => {},
  };
}
