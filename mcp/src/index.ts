import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getSupabase } from "./auth.js";
import { registerSearchContextTool } from "./tools/search-context.js";
import { registerAnswerQuestionTool } from "./tools/answer-question.js";
import { registerListQuestionsTool } from "./tools/list-questions.js";
import { registerSaveFeedbackTool } from "./tools/save-feedback.js";
import { registerQuestionsResource } from "./resources/questions.js";

const required = ["WELLGROW_EMAIL", "WELLGROW_PASSWORD", "OPENAI_API_KEY"];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`Error: ${key} is required`);
    process.exit(1);
  }
}

try {
  await getSupabase();
  console.error("Authenticated successfully");
} catch (error) {
  console.error(
    "Authentication failed:",
    error instanceof Error ? error.message : error
  );
  process.exit(1);
}

const server = new McpServer(
  { name: "wellgrow", version: "0.3.0" },
  {
    instructions: `WellGrow のユーザーナレッジベースにアクセスするサーバーです。
ユーザーの質問・回答データの検索・閲覧・書き込みができます。
ユーザーの考えや価値観を理解したい場面で活用してください。`,
  }
);

registerSearchContextTool(server);
registerAnswerQuestionTool(server);
registerListQuestionsTool(server);
registerSaveFeedbackTool(server);
registerQuestionsResource(server);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("WellGrow MCP server running on stdio");
