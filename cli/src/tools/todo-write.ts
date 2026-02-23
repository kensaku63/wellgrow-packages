import { z } from "zod";
import { defineTool } from "./definition.js";

export interface TodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed";
  activeForm: string;
}

export interface TodoWriteOutput {
  oldTodos: TodoItem[];
  newTodos: TodoItem[];
}

const inputSchema = z.object({
  todos: z
    .array(
      z.object({
        content: z.string().describe("TODO の内容"),
        status: z
          .enum(["pending", "in_progress", "completed"])
          .describe("ステータス"),
        activeForm: z
          .string()
          .describe(
            "進行中のスピナー表示テキスト（例: 'ファイルを読み取り中'）",
          ),
      }),
    )
    .describe("TODO アイテムの配列（リスト全体を毎回上書き）"),
});

export const TodoWriteTool = defineTool({
  name: "TodoWrite",
  category: "internal",
  description: `タスクリストを管理します。リスト全体を毎回上書きする設計です。
複雑な複数ステップのタスク（3ステップ以上）の追跡に使用してください。
- 3段階ステータス: pending → in_progress → completed
- 同時に in_progress にするのは1つだけにすること
- activeForm は in_progress 時のスピナー表示テキスト（例: "ファイルを読み取り中"）
- 単純なタスク（1-2ステップ）には使用しないでください`,
  inputSchema,
  execute: (input, ctx) => {
    return executeWriteTodos(ctx.session.agent, {
      todos: input.todos as TodoItem[],
    });
  },
  uiHooks: {
    onComplete: (_input, output) => ({
      type: "todoUpdate" as const,
      todos: output.newTodos,
    }),
  },
});

function executeWriteTodos(
  state: { todos: TodoItem[] },
  args: { todos: TodoItem[] },
): TodoWriteOutput {
  const oldTodos = [...state.todos];
  state.todos = args.todos;
  return { oldTodos, newTodos: state.todos };
}

export function getCurrentTodos(state: { todos: TodoItem[] }): TodoItem[] {
  return state.todos;
}
