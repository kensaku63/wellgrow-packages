import type { ZodType } from "zod";
import type { SessionContext } from "../core/context.js";
import type { TodoItem } from "./todo-write.js";
import type { AskUserQuestion } from "./ask-user.js";

export type ToolCategory =
  | "read"
  | "write"
  | "execute"
  | "interactive"
  | "internal";

export interface ToolExecutionContext {
  session: SessionContext;
  toolCallId: string;
  abortSignal?: AbortSignal;
}

export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  category: ToolCategory;
  inputSchema: ZodType<TInput>;
  execute: (
    input: TInput,
    ctx: ToolExecutionContext,
  ) => Promise<TOutput> | TOutput;
  uiHooks?: {
    onStart?: (input: TInput, toolCallId: string) => ToolUIEvent | null;
    onComplete?: (input: TInput, output: TOutput) => ToolUIEvent | null;
  };
}

export type ToolUIEvent =
  | { type: "todoUpdate"; todos: TodoItem[] }
  | { type: "askUser"; toolCallId: string; questions: AskUserQuestion[] };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ErasedToolDefinition = ToolDefinition<any, any>;

export function defineTool<TInput, TOutput>(
  def: ToolDefinition<TInput, TOutput>,
): ToolDefinition<TInput, TOutput> {
  return def;
}
