import { Command } from "commander";
import { platform } from "node:os";
import { checkRecommendedTools, type DoctorResult } from "../config/recommended-tools.js";

function getPackageManagerKey(): string {
  const os = platform();
  if (os === "darwin") return "brew";
  return "apt";
}

function formatDoctorResult(result: DoctorResult): string {
  const pmKey = getPackageManagerKey();
  const lines: string[] = [];

  lines.push("🩺 WellGrow Doctor — 推奨ツールチェック\n");

  for (const cat of result.categories) {
    lines.push(`  ${cat.label}`);
    for (const tool of cat.tools) {
      if (tool.installed) {
        const ver = tool.version ? ` (${tool.version})` : "";
        lines.push(`    ✅ ${tool.name}${ver} — ${tool.description}`);
      } else {
        const installCmd = tool.install[pmKey] ?? Object.values(tool.install)[0] ?? "";
        lines.push(`    ❌ ${tool.name} — ${tool.description}`);
        lines.push(`       → ${installCmd}`);
      }
    }
    lines.push("");
  }

  lines.push(
    `  結果: ${result.installedCount} インストール済 / ${result.missingCount} 未インストール`,
  );

  if (result.missingCount > 0) {
    lines.push("");
    lines.push("  一括インストール:");

    const missing = result.categories
      .flatMap((c) => c.tools)
      .filter((t) => !t.installed);

    if (pmKey === "brew") {
      const names = missing
        .map((t) => {
          const cmd = t.install.brew;
          if (!cmd) return null;
          return cmd.replace("brew install ", "");
        })
        .filter(Boolean);
      if (names.length > 0) {
        lines.push(`    brew install ${names.join(" ")}`);
      }
    } else {
      const aptTools = missing.filter((t) => t.install.apt?.startsWith("sudo apt"));
      const otherTools = missing.filter((t) => !t.install.apt?.startsWith("sudo apt"));

      if (aptTools.length > 0) {
        const names = aptTools
          .map((t) => t.install.apt!.replace("sudo apt install -y ", ""))
          .filter(Boolean);
        lines.push(`    sudo apt install -y ${names.join(" ")}`);
      }
      for (const t of otherTools) {
        const cmd = t.install.apt ?? Object.values(t.install)[0] ?? "";
        if (cmd) lines.push(`    ${cmd}`);
      }
    }
  }

  if (result.missingCount === 0) {
    lines.push("\n  🎉 すべての推奨ツールがインストール済みです！");
  }

  return lines.join("\n");
}

export async function runDoctor(): Promise<DoctorResult> {
  const result = await checkRecommendedTools();
  process.stdout.write(formatDoctorResult(result) + "\n");
  return result;
}

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("推奨ツールのインストール状況を確認する")
    .action(async () => {
      await runDoctor();
    });
}
