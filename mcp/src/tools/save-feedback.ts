import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getSupabase, getUserId } from "../auth.js";

const feedbackCategories = [
  "bug",
  "improvement",
  "praise",
  "question",
  "other",
] as const;

export function registerSaveFeedbackTool(server: McpServer): void {
  server.registerTool(
    "save_feedback",
    {
      title: "フィードバック送信",
      description: `WellGrow開発チームへフィードバックを送信します。

使用する場面:
- ユーザーがWellGrowへの改善提案・バグ報告・感想を伝えたいとき
- WellGrowのツール（search_user_context等）でエラーが発生したとき
- ユーザーがWellGrowの体験について言及したとき

重要: ユーザーがフィードバックの送信を意図していることを確認してから使用してください。
ツールエラーの報告を除き、ユーザーの承認なく送信しないでください。

カテゴリの選び方:
- bug: エラーやバグに関するもの
- improvement: 機能改善の提案やアイデア
- praise: 良かった点、満足した体験
- question: WellGrowに関する未解決の質問
- other: 上記に当てはまらないもの`,
      inputSchema: z.object({
        category: z
          .enum(feedbackCategories)
          .describe("フィードバックのカテゴリ"),
        message: z
          .string()
          .min(1)
          .max(2000)
          .describe(
            "フィードバックの内容。開発者が状況を理解できるように要約"
          ),
        user_message: z
          .string()
          .max(500)
          .optional()
          .describe("きっかけとなったユーザーの発言（原文を短く引用）"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async ({ category, message, user_message }) => {
      const supabase = await getSupabase();
      const userId = await getUserId();

      const context: Record<string, unknown> = {};
      if (user_message) context.user_message = user_message;

      const { error } = await supabase.from("feedbacks").insert({
        category,
        message,
        source: "mcp",
        user_id: userId,
        page_path: "mcp",
        context: Object.keys(context).length > 0 ? context : null,
      });

      if (error)
        throw new Error(`フィードバックの保存に失敗: ${error.message}`);

      return {
        content: [
          {
            type: "text" as const,
            text: `フィードバックを送信しました（${category}）`,
          },
        ],
      };
    }
  );
}
