import type { ToolResultPart } from "ai";
import type { ToolRegistry, ToolHandlerContext } from "../tools/registry.js";
import type { ToolUIEvent } from "../tools/definition.js";
import type { ToolPipeline } from "../tools/pipeline.js";
import type { MessagePart } from "../ui/message-list.js";
import type {
  ApprovalRequest,
  ApprovalDecision,
} from "../ui/approval-prompt.js";
import { addAllowedMcp } from "../config/index.js";
import { formatToolError } from "../tools/errors.js";
import { logToolCall, logToolResult } from "../logging.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ToolApprovalDecision =
  | {
      decision: "allow";
      updatedInput?: Record<string, unknown>;
      additionalContext?: string;
    }
  | { decision: "deny"; reason: string }
  | { decision: "ask" };

export interface ToolExecutionHooks {
  beforeExecute?: (
    toolCall: ToolCall,
    meta: { category: string; source: string },
  ) => Promise<ToolApprovalDecision>;
  afterExecute?: (
    toolCall: ToolCall,
    result: { success: boolean; output?: unknown; error?: string },
  ) => Promise<{ feedback?: string } | void>;
  onPermissionRequest?: (
    toolCall: ToolCall,
    meta: { category: string; source: string },
  ) => Promise<{
    behavior: "allow" | "deny";
    updatedInput?: Record<string, unknown>;
  } | null>;
}

export interface ToolCall {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

export interface ToolExecutorConfig {
  registry: ToolRegistry;
  pipeline: ToolPipeline;
  executionHooks?: ToolExecutionHooks;
  abortSignal?: AbortSignal;
  logFile?: string | null;
}

export interface ToolExecutorCallbacks {
  onMessageUpdate: (parts: MessagePart[]) => void;
  onToolUIEvent?: (event: ToolUIEvent) => void;
  onApprovalRequest?: (request: ApprovalRequest) => Promise<ApprovalDecision>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function updateToolPart(
  parts: MessagePart[],
  toolCallId: string,
  state: "output-available" | "output-error" | "output-denied",
  output?: unknown,
  errorText?: string,
): void {
  const idx = parts.findIndex(
    (p) => p.type === "tool" && p.toolCallId === toolCallId,
  );
  if (idx >= 0) {
    const part = parts[idx] as Extract<MessagePart, { type: "tool" }>;
    parts[idx] = { ...part, state, output, errorText };
  }
}

function approvalDecisionToToolDecision(
  ad: ApprovalDecision,
): ToolApprovalDecision {
  if (ad.action === "allow") {
    return { decision: "allow" };
  }
  return { decision: "deny", reason: "ユーザーがツールの実行を拒否しました" };
}

async function requestApproval(
  tc: ToolCall,
  meta: { category: string; source: string },
  pipeline: ToolPipeline,
  callbacks: ToolExecutorCallbacks,
): Promise<ToolApprovalDecision> {
  if (!callbacks.onApprovalRequest) {
    return { decision: "allow" };
  }

  const decision = await callbacks.onApprovalRequest({
    toolCallId: tc.toolCallId,
    toolName: tc.toolName,
    args: tc.args,
    source: meta.source,
    category: meta.category,
  });

  if (decision.action === "allow" && meta.source === "mcp") {
    const serverName = tc.toolName.split("__")[1];
    if (serverName) {
      pipeline.markMcpAllowed(serverName);
      await addAllowedMcp(serverName).catch(() => {});
    }
  }

  return approvalDecisionToToolDecision(decision);
}

function toToolOutput(value: unknown): ToolResultPart["output"] {
  if (typeof value === "string") {
    return { type: "text" as const, value };
  }
  return { type: "json" as const, value: value as import("ai").JSONValue };
}

// ---------------------------------------------------------------------------
// Single tool execution
// ---------------------------------------------------------------------------

async function executeSingleTool(
  tc: ToolCall,
  parts: MessagePart[],
  config: ToolExecutorConfig,
  callbacks: ToolExecutorCallbacks,
  needsApproval: boolean,
): Promise<ToolResultPart> {
  const { registry, pipeline, executionHooks } = config;
  const handler = registry.handlers[tc.toolName];

  if (!handler) {
    const errorMsg = `不明なツール: ${tc.toolName}`;
    updateToolPart(parts, tc.toolCallId, "output-error", undefined, errorMsg);
    callbacks.onMessageUpdate([...parts]);
    return {
      type: "tool-result",
      toolCallId: tc.toolCallId,
      toolName: tc.toolName,
      output: { type: "error-text", value: `Error: ${errorMsg}` },
    };
  }

  const meta = registry.getMeta(tc.toolName);
  const metaInfo = {
    category: meta?.category ?? "execute",
    source: meta?.source ?? "builtin",
  };

  // PreToolUse runs first — can deny early or escalate to user approval
  if (executionHooks?.beforeExecute) {
    const hookResult = await executionHooks.beforeExecute(tc, metaInfo);
    if (hookResult.decision === "deny") {
      updateToolPart(
        parts,
        tc.toolCallId,
        "output-denied",
        undefined,
        hookResult.reason,
      );
      callbacks.onMessageUpdate([...parts]);
      return pipeline.createDeniedResult(
        tc.toolCallId,
        tc.toolName,
        hookResult.reason,
      );
    }

    if (hookResult.decision === "ask") {
      needsApproval = true;
    }

    if (hookResult.decision === "allow" && hookResult.updatedInput) {
      tc = { ...tc, args: { ...tc.args, ...hookResult.updatedInput } };
    }
  }

  if (needsApproval) {
    let approved = false;

    if (executionHooks?.onPermissionRequest) {
      const hookDecision = await executionHooks.onPermissionRequest(
        tc,
        metaInfo,
      );
      if (hookDecision) {
        if (hookDecision.behavior === "deny") {
          const reason = "フックにより拒否されました";
          updateToolPart(parts, tc.toolCallId, "output-denied", undefined, reason);
          callbacks.onMessageUpdate([...parts]);
          return pipeline.createDeniedResult(tc.toolCallId, tc.toolName, reason);
        }
        if (hookDecision.updatedInput) {
          tc = { ...tc, args: { ...tc.args, ...hookDecision.updatedInput } };
        }
        approved = true;
      }
    }

    if (!approved) {
      const approval = await requestApproval(tc, metaInfo, pipeline, callbacks);
      if (approval.decision === "deny") {
        updateToolPart(
          parts,
          tc.toolCallId,
          "output-denied",
          undefined,
          approval.reason,
        );
        callbacks.onMessageUpdate([...parts]);
        return pipeline.createDeniedResult(
          tc.toolCallId,
          tc.toolName,
          approval.reason,
        );
      }
    }
  }

  try {
    const toolStart = Date.now();
    if (config.logFile) {
      const detail =
        tc.toolName === "Bash"
          ? `command="${(tc.args as { command: string }).command}"`
          : "";
      logToolCall(config.logFile, tc.toolName, detail);
    }

    const handlerCtx: ToolHandlerContext = {
      toolCallId: tc.toolCallId,
      abortSignal: config.abortSignal,
    };
    const resultPromise = handler(tc.args, handlerCtx);

    const uiHooks = meta?.uiHooks;
    const startEvent = uiHooks?.onStart?.(tc.args, tc.toolCallId);
    if (startEvent && callbacks.onToolUIEvent) {
      callbacks.onToolUIEvent(startEvent);
    }

    const toolResult = await resultPromise;
    updateToolPart(parts, tc.toolCallId, "output-available", toolResult);
    callbacks.onMessageUpdate([...parts]);

    if (config.logFile) {
      logToolResult(config.logFile, tc.toolName, "success", Date.now() - toolStart);
    }

    const completeEvent = uiHooks?.onComplete?.(tc.args, toolResult);
    if (completeEvent && callbacks.onToolUIEvent) {
      callbacks.onToolUIEvent(completeEvent);
    }

    const afterResult = await executionHooks?.afterExecute?.(tc, {
      success: true,
      output: toolResult,
    });

    const output = toToolOutput(toolResult);
    if (afterResult?.feedback) {
      const feedbackOutput = toToolOutput(
        `${typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult)}\n\n[Hook feedback]: ${afterResult.feedback}`,
      );
      return {
        type: "tool-result",
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        output: feedbackOutput,
      };
    }

    return {
      type: "tool-result",
      toolCallId: tc.toolCallId,
      toolName: tc.toolName,
      output,
    };
  } catch (error) {
    const errorMsg = formatToolError(error);
    updateToolPart(parts, tc.toolCallId, "output-error", undefined, errorMsg);
    callbacks.onMessageUpdate([...parts]);

    const afterResult = await executionHooks?.afterExecute?.(tc, {
      success: false,
      error: errorMsg,
    });

    const errorOutput = afterResult?.feedback
      ? `${errorMsg}\n\n[Hook feedback]: ${afterResult.feedback}`
      : errorMsg;

    return {
      type: "tool-result",
      toolCallId: tc.toolCallId,
      toolName: tc.toolName,
      output: { type: "error-text", value: errorOutput },
    };
  }
}

// ---------------------------------------------------------------------------
// Batch tool execution (classify → parallel auto / sequential approval)
// ---------------------------------------------------------------------------

export async function executeToolCalls(
  toolCalls: ToolCall[],
  parts: MessagePart[],
  config: ToolExecutorConfig,
  callbacks: ToolExecutorCallbacks,
): Promise<ToolResultPart[]> {
  const { registry, pipeline } = config;

  const autoApprove: ToolCall[] = [];
  const needsApproval: ToolCall[] = [];
  const blocked: { tc: ToolCall; reason: string }[] = [];

  for (const tc of toolCalls) {
    const meta = registry.getMeta(tc.toolName);
    const evaluation = pipeline.evaluate(tc.toolName, meta, tc.args);
    switch (evaluation.action) {
      case "block":
        blocked.push({ tc, reason: evaluation.reason });
        break;
      case "auto":
        autoApprove.push(tc);
        break;
      case "approve":
        needsApproval.push(tc);
        break;
    }
  }

  const blockedResults: ToolResultPart[] = blocked.map(({ tc, reason }) => {
    updateToolPart(parts, tc.toolCallId, "output-denied", undefined, reason);
    callbacks.onMessageUpdate([...parts]);
    return pipeline.createDeniedResult(tc.toolCallId, tc.toolName, reason);
  });

  const autoResults = await Promise.all(
    autoApprove.map((tc) =>
      executeSingleTool(tc, parts, config, callbacks, false),
    ),
  );

  const sequentialResults: ToolResultPart[] = [];
  for (const tc of needsApproval) {
    const result = await executeSingleTool(tc, parts, config, callbacks, true);
    sequentialResults.push(result);
  }

  const resultMap = new Map<string, ToolResultPart>();
  for (const r of [...blockedResults, ...autoResults, ...sequentialResults]) {
    resultMap.set(r.toolCallId, r);
  }
  return toolCalls.map((tc) => resultMap.get(tc.toolCallId)!);
}
