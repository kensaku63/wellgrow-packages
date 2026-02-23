import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getSupabase } from "../auth.js";

export function registerQuestionsResource(server: McpServer): void {
  server.registerResource(
    "active-questions",
    "wellgrow://questions/active",
    {
      title: "アクティブな質問一覧",
      description: "ステータスが active の質問一覧。",
      mimeType: "application/json",
    },
    async (uri) => {
      const supabase = await getSupabase();
      const { data } = await supabase
        .from("questions")
        .select("id, question, tags, importance, pinned, updated_at")
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(50);

      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(data ?? [], null, 2),
          },
        ],
      };
    }
  );
}
