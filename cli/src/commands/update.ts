import { Command } from "commander";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import chalk from "chalk";
import { getUpdateInfo } from "../update.js";

const execFileAsync = promisify(execFile);

export function registerUpdateCommand(program: Command): void {
  program
    .command("update")
    .description("CLI を最新バージョンに更新する")
    .action(async () => {
      process.stdout.write("最新バージョンを確認中...\n");

      const info = await getUpdateInfo();

      if (!info.latest) {
        process.stderr.write(
          chalk.red("npm レジストリに接続できませんでした。ネットワークを確認してください。\n"),
        );
        process.exit(1);
      }

      if (!info.updateAvailable) {
        process.stdout.write(
          chalk.green(`✓ 最新バージョンです (${info.current})\n`),
        );
        return;
      }

      process.stdout.write(
        `${chalk.dim(info.current)} → ${chalk.green(info.latest)} にアップデートします...\n`,
      );

      try {
        await execFileAsync("npm", ["install", "-g", "@wellgrow/cli@latest"], {
          timeout: 60_000,
        });
        process.stdout.write(
          chalk.green(`✓ @wellgrow/cli@${info.latest} にアップデートしました\n`),
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        process.stderr.write(
          chalk.red(`アップデートに失敗しました: ${msg}\n`),
        );
        process.stderr.write(
          chalk.dim("手動で実行してください: npm install -g @wellgrow/cli@latest\n"),
        );
        process.exit(1);
      }
    });
}
