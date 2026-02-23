import { Command } from "commander";
import {
  loadConfig,
  updateConfigField,
  ConfigLoadError,
} from "../config/index.js";

export function registerConfigCommand(program: Command): void {
  const configCmd = program
    .command("config")
    .description("設定の管理");

  configCmd
    .command("show")
    .description("現在の設定を表示")
    .action(async () => {
      try {
        const config = await loadConfig();
        console.log(JSON.stringify(config, null, 2));
      } catch (error) {
        if (error instanceof ConfigLoadError) {
          console.error(error.message);
          return;
        }
        throw error;
      }
    });

  configCmd
    .command("model")
    .description("デフォルトモデルを変更")
    .argument("[model-id]", "設定するモデルID")
    .action(async (modelId?: string) => {
      try {
        if (!modelId) {
          const readline = await import("node:readline");
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          modelId = await new Promise<string>((resolve) => {
            rl.question("モデルID (例: claude-sonnet-4-20250514, gemini-2.5-pro): ", (answer: string) => {
              rl.close();
              resolve(answer.trim());
            });
          });
        }

        if (!modelId) {
          console.error("モデルIDを指定してください");
          return;
        }

        await updateConfigField("default", "model", modelId);
        console.log(`デフォルトモデルを ${modelId} に変更しました。`);
      } catch (error) {
        if (error instanceof ConfigLoadError) {
          console.error(error.message);
          return;
        }
        console.error("設定ファイルの更新に失敗しました。");
      }
    });

  configCmd
    .action(async () => {
      try {
        const config = await loadConfig();
        console.log(`モデル:       ${config.default.model}`);
        console.log(`プロバイダー: ${config.default.provider}`);
        console.log(`エージェント: ${config.default.agent}`);
        console.log(`モード:       ${config.default.mode}`);
      } catch (error) {
        if (error instanceof ConfigLoadError) {
          console.error(error.message);
          return;
        }
        throw error;
      }
    });
}
