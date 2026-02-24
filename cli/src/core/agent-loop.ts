import {
  streamText,
  type ModelMessage,
  type ToolModelMessage,
} from "ai";
import type { LanguageModel } from "ai";
import type { MessagePart } from "../ui/message-list.js";
import { evaluateRetry, sleep } from "../ai/retry.js";
import { prepareCachedMessages, type TurnUsage } from "../ai/cache.js";
import {
  logRequest,
  logResponse,
  logUsage,
  logRetry,
} from "../logging.js";
import {
  executeToolCalls,
  type ToolExecutorConfig,
  type ToolExecutorCallbacks,
  type ToolCall,
} from "./tool-executor.js";

export type {
  ToolCall,
  ToolExecutorConfig,
  ToolExecutorCallbacks,
} from "./tool-executor.js";

const DEFAULT_MAX_TURNS = 100;
const TEXT_FLUSH_INTERVAL = 30;
const FIRST_FLUSH_INTERVAL = 4;
const TEXT_PART_SPLIT_THRESHOLD = 1500;

export interface AgentLoopCallbacks extends ToolExecutorCallbacks {
  onRetry?: (attempt: number, maxRetries: number, delayMs: number) => void;
  onContextExceeded?: () => void;
  onUsage?: (usage: TurnUsage) => void;
}

export interface AgentLoopConfig extends ToolExecutorConfig {
  model: LanguageModel;
  system: string;
  maxTurns?: number;
  maxRetries?: number;
  maxOutputTokens?: number;
  isAbortedByUser?: () => boolean;
}

export async function runAgentLoop(
  messages: ModelMessage[],
  config: AgentLoopConfig,
  callbacks: AgentLoopCallbacks,
): Promise<{ fullText: string; parts: MessagePart[] }> {
  let turnsUsed = 0;
  const maxTurns = config.maxTurns ?? DEFAULT_MAX_TURNS;
  let fullText = "";
  const parts: MessagePart[] = [];

  while (turnsUsed < maxTurns) {
    if (turnsUsed > 0) {
      parts.push({ type: "step-start" });
      callbacks.onMessageUpdate([...parts]);
    }

    const turnResult = await executeTurn(messages, config, callbacks, parts);

    fullText += turnResult.text;

    if (turnResult.finishReason !== "tool-calls") {
      break;
    }

    const toolResults = await executeToolCalls(
      turnResult.toolCalls,
      parts,
      config,
      callbacks,
    );

    const toolMessage: ToolModelMessage = {
      role: "tool",
      content: toolResults,
    };
    messages.push(toolMessage);

    turnsUsed++;
  }

  return { fullText, parts };
}

// ---------------------------------------------------------------------------
// Turn execution with retry
// ---------------------------------------------------------------------------

interface TurnResult {
  text: string;
  finishReason: string;
  toolCalls: ToolCall[];
}

async function executeTurn(
  messages: ModelMessage[],
  config: AgentLoopConfig,
  callbacks: AgentLoopCallbacks,
  parts: MessagePart[],
): Promise<TurnResult> {
  const maxRetries = config.maxRetries ?? 2;
  let attempt = 0;

  while (true) {
    try {
      return await streamTurn(messages, config, callbacks, parts);
    } catch (error) {
      const retryResult = evaluateRetry(error, attempt, {
        maxRetries,
        isAbortedByUser: config.isAbortedByUser,
      });

      if (retryResult.isUserAborted) {
        return { text: "", finishReason: "stop", toolCalls: [] };
      }

      if (retryResult.isContextExceeded) {
        callbacks.onContextExceeded?.();
        return {
          text: retryResult.errorMessage,
          finishReason: "stop",
          toolCalls: [],
        };
      }

      if (!retryResult.shouldRetry) {
        throw error;
      }

      callbacks.onRetry?.(attempt + 1, maxRetries, retryResult.delay);
      if (config.logFile) {
        logRetry(config.logFile, attempt + 1, maxRetries, retryResult.delay);
      }
      await sleep(retryResult.delay);
      attempt++;
    }
  }
}

// ---------------------------------------------------------------------------
// Streaming helpers
// ---------------------------------------------------------------------------

function appendText(parts: MessagePart[], text: string): void {
  const last = parts[parts.length - 1];
  if (last?.type === "text" && last.state === "streaming") {
    last.text += text;
    if (last.text.length > TEXT_PART_SPLIT_THRESHOLD) {
      const splitPos = findParagraphBoundary(last.text);
      if (splitPos > 0) {
        const remainder = last.text.slice(splitPos);
        last.text = last.text.slice(0, splitPos);
        last.state = "done";
        parts.push({ type: "text", text: remainder, state: "streaming" });
      }
    }
  } else {
    parts.push({ type: "text", text, state: "streaming" });
  }
}

function findParagraphBoundary(text: string): number {
  let fenceCount = 0;
  let lastSafeSplit = -1;
  let i = 0;
  while (i < text.length) {
    if (text.startsWith("```", i)) {
      fenceCount++;
      i += 3;
      continue;
    }
    if (text.startsWith("\n\n", i) && fenceCount % 2 === 0) {
      lastSafeSplit = i;
    }
    i++;
  }
  return lastSafeSplit > 0 ? lastSafeSplit : -1;
}

function appendReasoning(parts: MessagePart[], text: string): void {
  const last = parts[parts.length - 1];
  if (last?.type === "reasoning" && last.state === "streaming") {
    last.text += text;
  } else {
    parts.push({ type: "reasoning", text, state: "streaming" });
  }
}

function finalizeStreamingParts(parts: MessagePart[]): void {
  for (const p of parts) {
    if (
      (p.type === "text" || p.type === "reasoning") &&
      p.state === "streaming"
    ) {
      p.state = "done";
    }
  }
}

// ---------------------------------------------------------------------------
// Single streaming turn
// ---------------------------------------------------------------------------

async function streamTurn(
  messages: ModelMessage[],
  config: AgentLoopConfig,
  callbacks: AgentLoopCallbacks,
  parts: MessagePart[],
): Promise<TurnResult> {
  const turnStart = Date.now();
  const modelId =
    typeof config.model === "string"
      ? config.model
      : config.model.modelId;

  if (config.logFile) {
    logRequest(config.logFile, modelId);
  }

  const cachedMessages = prepareCachedMessages(config.system, messages);

  const result = streamText({
    model: config.model,
    messages: cachedMessages,
    tools: config.registry.schemas,
    maxOutputTokens: config.maxOutputTokens,
    abortSignal: config.abortSignal,
    maxRetries: 0,
  });

  let text = "";
  const toolCalls: ToolCall[] = [];
  let textBuffer = "";
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let isFirstTextChunk = true;

  function flushTextBuffer(): void {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (!textBuffer) return;
    appendText(parts, textBuffer);
    textBuffer = "";
    callbacks.onMessageUpdate([...parts]);
  }

  for await (const chunk of result.fullStream) {
    switch (chunk.type) {
      case "text-delta":
        text += chunk.text;
        textBuffer += chunk.text;
        if (!flushTimer) {
          const interval = isFirstTextChunk ? FIRST_FLUSH_INTERVAL : TEXT_FLUSH_INTERVAL;
          isFirstTextChunk = false;
          flushTimer = setTimeout(flushTextBuffer, interval);
        }
        break;

      case "reasoning-delta":
        flushTextBuffer();
        appendReasoning(parts, chunk.text);
        callbacks.onMessageUpdate([...parts]);
        break;

      case "tool-call":
        flushTextBuffer();
        toolCalls.push({
          toolCallId: chunk.toolCallId,
          toolName: chunk.toolName,
          args: chunk.input as Record<string, unknown>,
        });
        parts.push({
          type: "tool",
          toolCallId: chunk.toolCallId,
          toolName: chunk.toolName,
          state: "input-available",
          input: chunk.input,
        });
        callbacks.onMessageUpdate([...parts]);
        break;

      case "source": {
        flushTextBuffer();
        const src = chunk as unknown as Record<string, unknown>;
        if ("url" in src && typeof src.url === "string") {
          parts.push({
            type: "source-url",
            url: src.url,
            title: typeof src.title === "string" ? src.title : undefined,
          });
          callbacks.onMessageUpdate([...parts]);
        }
        break;
      }
    }
  }

  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (textBuffer) {
    appendText(parts, textBuffer);
    textBuffer = "";
  }
  finalizeStreamingParts(parts);
  callbacks.onMessageUpdate([...parts]);

  const [response, finishReason, usage] = await Promise.all([
    result.response,
    result.finishReason,
    result.usage,
  ]);
  messages.push(...(response.messages as ModelMessage[]));

  const turnUsage: TurnUsage = {
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    cacheWriteTokens: usage.inputTokenDetails.cacheWriteTokens ?? undefined,
    cacheReadTokens: usage.inputTokenDetails.cacheReadTokens ?? undefined,
  };
  callbacks.onUsage?.(turnUsage);

  if (config.logFile) {
    logResponse(config.logFile, 200, Date.now() - turnStart);
    logUsage(config.logFile, turnUsage);
  }

  return { text, finishReason, toolCalls };
}
