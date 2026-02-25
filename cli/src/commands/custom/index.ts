import { Command } from "commander";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { discoverCommands, getCommandsDir } from "./loader.js";

export function registerCommandsCommand(program: Command): void {
  const cmds = program
    .command("commands")
    .description("カスタムコマンドの管理");

  cmds
    .command("list")
    .alias("ls")
    .description("利用可能なコマンドを一覧表示")
    .action(async () => {
      const commands = await discoverCommands();
      const dir = getCommandsDir();

      if (commands.length === 0) {
        process.stdout.write(
          `カスタムコマンドはありません。\n${dir}/ に .md ファイルを作成してください。\n`,
        );
        return;
      }

      process.stdout.write(`\n${commands.length} 個のコマンド (${dir}):\n\n`);
      for (const cmd of commands) {
        const argHint =
          cmd.args.length > 0
            ? ` ${cmd.args.map((a) => (a.required ? `<${a.name}>` : `[${a.name}]`)).join(" ")}`
            : "";
        process.stdout.write(`  /${cmd.name}${argHint}\n    ${cmd.description}\n\n`);
      }
    });

  cmds
    .command("show <name>")
    .description("コマンドの詳細を表示")
    .action(async (name: string) => {
      const dir = getCommandsDir();
      const filePath = join(dir, `${name}.md`);

      let content: string;
      try {
        content = await readFile(filePath, "utf-8");
      } catch {
        process.stderr.write(`コマンド "${name}" が見つかりません。\n`);
        process.exitCode = 1;
        return;
      }

      process.stdout.write(content);
      process.stdout.write("\n");
    });
}
