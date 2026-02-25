import { Command } from "commander";
import { cp, mkdir, readdir, access, appendFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { checkRecommendedTools, toMarkdown } from "../config/recommended-tools.js";

const WELLGROW_HOME = join(homedir(), ".wellgrow");

function getTemplatesDir(): string {
  const thisDir = fileURLToPath(new URL(".", import.meta.url));
  return join(thisDir, "..", "templates");
}

const BUILTIN_AGENTS = ["joy", "wellgrow-onboarding"];

export async function runInit(): Promise<void> {
  const templatesDir = getTemplatesDir();

  await mkdir(join(WELLGROW_HOME, "agents"), { recursive: true });
  await mkdir(join(WELLGROW_HOME, "skills"), { recursive: true });
  await mkdir(join(WELLGROW_HOME, "hooks"), { recursive: true });
  await mkdir(join(WELLGROW_HOME, "mcp"), { recursive: true });
  await mkdir(join(WELLGROW_HOME, "commands"), { recursive: true });

  for (const agentName of BUILTIN_AGENTS) {
    const src = join(templatesDir, "agents", agentName);
    const dest = join(WELLGROW_HOME, "agents", agentName);
    try {
      await cp(src, dest, { recursive: true, force: true });
      process.stdout.write(`✓ ${agentName} を配置しました\n`);
    } catch (error) {
      process.stderr.write(
        `✗ ${agentName} の配置に失敗: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
  }

  const manualSrc = join(templatesDir, "manual");
  const manualDest = join(WELLGROW_HOME, "manual");
  try {
    await cp(manualSrc, manualDest, { recursive: true, force: true });
    process.stdout.write("✓ manual/ を配置しました\n");
  } catch (error) {
    process.stderr.write(
      `✗ manual/ の配置に失敗: ${error instanceof Error ? error.message : String(error)}\n`,
    );
  }

  await appendFile(join(WELLGROW_HOME, "manual", "recommended-tool.md"), toMarkdown(), "utf-8");

  const result = await checkRecommendedTools();
  if (result.missingCount > 0) {
    process.stdout.write(
      `\n💡 ${result.missingCount} 個の推奨ツールが未インストールです。\n` +
      `   wellgrow doctor で詳細を確認できます。\n`,
    );
  }
}

export async function autoInitIfNeeded(): Promise<void> {
  const agentsDir = join(WELLGROW_HOME, "agents");
  try {
    await access(agentsDir);
    const entries = await readdir(agentsDir);
    if (entries.length > 0) return;
  } catch {
    // directory doesn't exist
  }

  await runInit();
}

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("ビルトインエージェントと manual/ を配置/更新する")
    .action(async () => {
      await runInit();
    });
}
