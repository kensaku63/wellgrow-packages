import {
  createSessionContext,
  type SessionContext,
} from "../../core/context.js";
import type {
  ToolExecutionContext,
  ErasedToolDefinition,
} from "../../tools/definition.js";
import {
  createToolRegistryBuilder,
  type ToolRegistry,
} from "../../tools/registry.js";
import {
  createToolPipeline,
  type ToolPipeline,
  type Mode,
} from "../../tools/pipeline.js";

export function createTestSessionContext(
  overrides: Partial<Pick<SessionContext, "cwd">> = {},
): SessionContext {
  const ctx = createSessionContext();
  if (overrides.cwd) ctx.cwd = overrides.cwd;
  return ctx;
}

export function createTestToolContext(
  overrides: { cwd?: string; toolCallId?: string } = {},
): ToolExecutionContext {
  const session = createTestSessionContext({ cwd: overrides.cwd });
  return {
    session,
    toolCallId: overrides.toolCallId ?? "test-call-id",
  };
}

export function createToolRegistry(
  tools: ErasedToolDefinition[],
  ctx: SessionContext,
): ToolRegistry {
  return createToolRegistryBuilder(ctx).addBuiltinTools(tools).build();
}

export function createTestPipeline(mode: Mode = "auto"): ToolPipeline {
  return createToolPipeline({ mode });
}
