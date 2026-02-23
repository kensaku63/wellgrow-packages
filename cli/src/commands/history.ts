import { Command } from "commander";
import { listHistory, getSessionContent } from "../core/history.js";

export function registerHistoryCommand(program: Command): void {
  const historyCmd = program
    .command("history")
    .description("セッション履歴");

  historyCmd
    .argument("[session-id]", "セッションIDで詳細表示")
    .action(async (sessionId?: string) => {
      if (sessionId) {
        const content = await getSessionContent(sessionId);
        if (content) {
          console.log(content);
        } else {
          console.error(`セッション ${sessionId} が見つかりません`);
        }
        return;
      }

      const entries = await listHistory();
      if (entries.length === 0) {
        console.log("履歴がありません");
        return;
      }

      for (const entry of entries) {
        const date = new Date(entry.timestamp).toLocaleString("ja-JP");
        console.log(`${date}  ${entry.model}  ${entry.summary}`);
        console.log(`  ID: ${entry.session_id}`);
      }
    });
}
