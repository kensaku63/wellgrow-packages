import { z } from "zod";
import { defineTool } from "./definition.js";

export interface AskUserQuestion {
  question: string;
  header: string;
  options: { label: string; description: string; markdown?: string }[];
  multiSelect: boolean;
}

export interface AskUserAnswer {
  selected: string[];
  otherText?: string;
}

export interface AskUserOutput {
  questions: AskUserQuestion[];
  answers: Record<string, AskUserAnswer>;
}

interface PendingAskUser {
  toolCallId: string;
  questions: AskUserQuestion[];
  resolve: (answers: Record<string, AskUserAnswer>) => void;
  reject: (reason: Error) => void;
}

export interface AskUserState {
  pendingMap: Map<string, PendingAskUser>;
  pendingOrder: string[];
}

export function createAskUserState(): AskUserState {
  return { pendingMap: new Map(), pendingOrder: [] };
}

const inputSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z.string().describe("質問文"),
        header: z
          .string()
          .describe("ラベル（最大12文字、UIのチップ表示用）"),
        options: z
          .array(
            z.object({
              label: z.string().describe("選択肢のラベル"),
              description: z.string().describe("選択肢の説明"),
              markdown: z
                .string()
                .optional()
                .describe("プレビュー用マークダウン"),
            }),
          )
          .describe("選択肢（2-4個、「Other」は自動追加される）"),
        multiSelect: z.boolean().describe("複数選択を許可するか"),
      }),
    )
    .describe("質問リスト（1-4個）"),
});

export const AskUserTool = defineTool({
  name: "AskUser",
  category: "interactive",
  description: `ユーザーに選択肢付きの質問を投げます。
情報の収集、曖昧さの解消、好みの確認、意思決定の支援に使用してください。
- 1-4個の質問を一度に送信可能
- 各質問に2-4個の選択肢を設定（「Other」は自動追加されます）
- header はUIのラベル表示に使われます（最大12文字）
- markdown フィールドでコードプレビューなどのリッチ表示が可能`,
  inputSchema,
  execute: async (input, ctx) => {
    return executeAskUser(ctx.session.agent.askUser, {
      toolCallId: ctx.toolCallId,
      questions: input.questions,
    });
  },
  uiHooks: {
    onStart: (input, toolCallId) => ({
      type: "askUser" as const,
      toolCallId,
      questions: input.questions,
    }),
  },
});

function executeAskUser(
  state: AskUserState,
  args: { toolCallId: string; questions: AskUserQuestion[] },
): Promise<AskUserOutput> {
  return new Promise<AskUserOutput>((resolve, reject) => {
    const entry: PendingAskUser = {
      toolCallId: args.toolCallId,
      questions: args.questions,
      resolve: (answers) => resolve({ questions: args.questions, answers }),
      reject,
    };
    state.pendingMap.set(args.toolCallId, entry);
    state.pendingOrder.push(args.toolCallId);
  });
}

export function getNextPendingAskUser(
  state: AskUserState,
): { toolCallId: string; questions: AskUserQuestion[] } | null {
  if (state.pendingOrder.length === 0) return null;
  const id = state.pendingOrder[0];
  const entry = state.pendingMap.get(id);
  if (!entry) return null;
  return { toolCallId: entry.toolCallId, questions: entry.questions };
}

export function getPendingAskUserCount(state: AskUserState): number {
  return state.pendingOrder.length;
}

export function resolveAskUser(
  state: AskUserState,
  toolCallId: string,
  answers: Record<string, AskUserAnswer>,
): void {
  const entry = state.pendingMap.get(toolCallId);
  if (!entry) return;

  state.pendingMap.delete(toolCallId);
  const idx = state.pendingOrder.indexOf(toolCallId);
  if (idx !== -1) state.pendingOrder.splice(idx, 1);

  entry.resolve(answers);
}

export function cancelAllPendingAskUser(state: AskUserState): void {
  const error = new Error("AskUser cancelled");
  for (const entry of state.pendingMap.values()) {
    entry.reject(error);
  }
  state.pendingMap.clear();
  state.pendingOrder.length = 0;
}
