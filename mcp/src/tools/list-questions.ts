import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getSupabase } from "../auth.js";
import { formatQuestionList } from "../format.js";

export function registerListQuestionsTool(server: McpServer): void {
  server.registerTool(
    "list_questions",
    {
      title: "質問一覧取得",
      description: `ユーザーの質問一覧を取得します。ステータスやタグでフィルタ可能。
質問の ID を確認したいときや、ユーザーがどんな質問を持っているか把握したいときに使います。
answer_question で回答を書き込む前に、対象の question_id を確認する用途にも使えます。`,
      inputSchema: z.object({
        status: z
          .array(z.string())
          .optional()
          .default(["active", "paused"])
          .describe("ステータスでフィルタ"),
        tags: z.array(z.string()).optional().describe("タグでフィルタ"),
        pinned: z.boolean().optional().describe("ピン留めされた質問のみ"),
        limit: z
          .number()
          .min(1)
          .max(50)
          .default(20)
          .describe("取得件数上限"),
      }),
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async ({ status, tags, pinned, limit }) => {
      const supabase = await getSupabase();

      let query = supabase
        .from("questions")
        .select(
          "id, question, tags, status, importance, pinned, created_at, updated_at"
        )
        .in("status", status ?? ["active", "paused"])
        .order("updated_at", { ascending: false })
        .limit(limit ?? 20);

      if (tags?.length) {
        query = query.overlaps("tags", tags);
      }
      if (pinned !== undefined) {
        query = query.eq("pinned", pinned);
      }

      const { data, error } = await query;
      if (error) throw new Error(`質問取得に失敗: ${error.message}`);

      return {
        content: [
          {
            type: "text" as const,
            text: formatQuestionList(data ?? []),
          },
        ],
      };
    }
  );
}
