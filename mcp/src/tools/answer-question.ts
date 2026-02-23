import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getSupabase, getUserId } from "../auth.js";

export function registerAnswerQuestionTool(server: McpServer): void {
  server.registerTool(
    "answer_question",
    {
      title: "質問への回答書き込み",
      description: `ユーザーの質問に対して回答を書き込みます。
ユーザーとの会話で重要な気づきや洞察が生まれた時に使います。

使用前に必ずユーザーの承認を得てください。

【回答のルール】
- answer は140文字以内で、端的に核心を突く回答にする
- ユーザー自身の言葉を活かした回答にする
- description には回答の背景・根拠・詳細な説明を書く
- question_id は search_user_context や list_questions で取得した ID を使う`,
      inputSchema: z.object({
        question_id: z.string().describe("対象の質問 ID"),
        answer: z.string().max(140).describe("回答（140文字以内）"),
        description: z
          .string()
          .max(300)
          .optional()
          .describe("回答の詳細説明（300文字以内）"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async ({ question_id, answer, description }) => {
      const supabase = await getSupabase();
      const userId = await getUserId();

      const { error: insertError } = await supabase.from("answers").insert({
        question_id,
        user_id: userId,
        answer,
        description: description ?? null,
        source: "mcp",
      });

      if (insertError)
        throw new Error(`回答の保存に失敗: ${insertError.message}`);

      const { data: questionData } = await supabase
        .from("questions")
        .select("question")
        .eq("id", question_id)
        .single();

      const questionText = questionData?.question ?? question_id;

      return {
        content: [
          {
            type: "text" as const,
            text: `回答を保存しました:\n質問: ${questionText}\n回答: ${answer}`,
          },
        ],
      };
    }
  );
}
