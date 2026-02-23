import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getSupabase, getUserId } from "../auth.js";
import { generateEmbedding } from "../embedding.js";
import {
  formatSearchResult,
  type QuestionHit,
  type AnswerHit,
} from "../format.js";

export function registerSearchContextTool(server: McpServer): void {
  server.registerTool(
    "search_user_context",
    {
      title: "ユーザーコンテキスト検索",
      description: `ユーザーの質問と回答のデータベースを検索します。
ユーザーの考え・価値観・経験・知識を理解するために使います。

使用場面:
- アドバイスや提案をする前に、ユーザーの価値観・原則を確認したいとき
- 意思決定の場面で、過去の判断基準や経験を参照したいとき
- 「私のスタイルで」「私らしく」など、ユーザーの好みを把握したいとき
- ユーザーの背景（専門分野、関心、目標）を理解したいとき

検索戦略（組み合わせ可能）:
- query のみ: セマンティック検索（意味的に近い内容を幅広く取得）
- keywords を追加: ハイブリッド検索（意味的類似 + キーワード一致で精度向上）
- tags/statuses/pinned: フィルタで結果を絞り込み

target の使い分け:
- "questions": 質問の一覧を見たいとき（最新回答も付属）
- "answers": 回答の内容を重点的に調べたいとき
- "all": 幅広く情報を集めたいとき（デフォルト）`,
      inputSchema: z.object({
        query: z.string().describe("検索クエリ（セマンティック検索に使用）"),
        keywords: z
          .array(z.string())
          .optional()
          .describe("キーワード部分一致"),
        target: z
          .enum(["questions", "answers", "all"])
          .default("all")
          .describe("検索対象"),
        tags: z.array(z.string()).optional().describe("タグでフィルタ"),
        statuses: z
          .array(z.string())
          .optional()
          .describe("ステータスでフィルタ（省略時: active, paused）"),
        pinned: z.boolean().optional().describe("ピン留めされた質問のみ"),
        limit: z
          .number()
          .min(1)
          .max(50)
          .default(10)
          .describe("取得件数上限"),
      }),
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async ({ query, keywords, target, tags, statuses, pinned, limit }) => {
      const supabase = await getSupabase();
      const userId = await getUserId();
      const embeddingStr = await generateEmbedding(query);

      const questions: QuestionHit[] = [];
      const answers: AnswerHit[] = [];
      const promises: PromiseLike<void>[] = [];

      if (target !== "answers") {
        promises.push(
          supabase
            .rpc("search_questions", {
              p_user_id: userId,
              p_keywords: keywords ?? null,
              p_embedding: embeddingStr,
              p_vector_threshold: 0.3,
              p_statuses: statuses ?? ["active", "paused"],
              p_tags: tags ?? null,
              p_date_from: null,
              p_date_to: null,
              p_pinned: pinned ?? null,
              p_limit: limit ?? 10,
            })
            .then(({ data }) => {
              if (data) questions.push(...data);
            })
        );
      }

      if (target !== "questions") {
        promises.push(
          supabase
            .rpc("search_answers", {
              p_user_id: userId,
              p_keywords: keywords ?? null,
              p_embedding: embeddingStr,
              p_vector_threshold: 0.3,
              p_sources: null,
              p_date_from: null,
              p_date_to: null,
              p_exclude_question_ids: null,
              p_limit: limit ?? 10,
            })
            .then(({ data }) => {
              if (data) answers.push(...data);
            })
        );
      }

      await Promise.all(promises);

      return {
        content: [
          {
            type: "text" as const,
            text: formatSearchResult({ questions, answers }),
          },
        ],
      };
    }
  );
}
