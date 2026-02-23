import { Command } from "commander";
import {
  readFile,
  readdir,
  mkdir,
  cp,
  rm,
  mkdtemp,
  stat,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir, tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import matter from "gray-matter";

const execFileAsync = promisify(execFile);
const WELLGROW_HOME = join(homedir(), ".wellgrow");
const SKILLS_DIR = join(WELLGROW_HOME, "skills");

const SKIP_DIRS = new Set([".git", "node_modules", ".github", ".husky"]);

export interface SkillInfo {
  name: string;
  description: string;
  sourceDir: string;
}

export function parseSource(source: string): { url: string; ref?: string } {
  if (source.startsWith("./") || source.startsWith("../")) {
    return { url: resolve(source) };
  }

  if (/^[\w.-]+\/[\w.-]+$/.test(source)) {
    return { url: `https://github.com/${source}.git` };
  }

  if (source.startsWith("https://") || source.startsWith("git@")) {
    const treeMatch = source.match(
      /github\.com\/([^/]+\/[^/]+)\/tree\/([^/]+)/,
    );
    if (treeMatch) {
      return {
        url: `https://github.com/${treeMatch[1]}.git`,
        ref: treeMatch[2],
      };
    }
    return { url: source.replace(/\/$/, "") };
  }

  return { url: resolve(source) };
}

export async function discoverSkillsInRepo(dir: string): Promise<SkillInfo[]> {
  const skills: SkillInfo[] = [];
  const seen = new Set<string>();

  async function scan(currentDir: string, depth: number): Promise<void> {
    if (depth > 3) return;

    try {
      const content = await readFile(join(currentDir, "SKILL.md"), "utf-8");
      const { data } = matter(content);
      if (data.name && data.description && !seen.has(data.name as string)) {
        seen.add(data.name as string);
        skills.push({
          name: data.name as string,
          description: (data.description as string).trim(),
          sourceDir: currentDir,
        });
      }
      return;
    } catch {
      // No SKILL.md here — scan subdirectories
    }

    try {
      const entries = await readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue;
        await scan(join(currentDir, entry.name), depth + 1);
      }
    } catch {
      // Can't read directory
    }
  }

  await scan(dir, 0);
  return skills;
}

async function fetchSource(
  source: string,
): Promise<{ dir: string; isTemp: boolean }> {
  const parsed = parseSource(source);

  if (!parsed.url.startsWith("https://") && !parsed.url.startsWith("git@")) {
    return { dir: parsed.url, isTemp: false };
  }

  const tmpDir = await mkdtemp(join(tmpdir(), "wellgrow-skills-"));
  const args = ["clone", "--depth", "1"];
  if (parsed.ref) {
    args.push("--branch", parsed.ref);
  }
  args.push(parsed.url, tmpDir);

  try {
    await execFileAsync("git", args, { timeout: 30_000 });
  } catch (error) {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    throw new Error(
      `リポジトリのクローンに失敗: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return { dir: tmpDir, isTemp: true };
}

export function registerSkillsCommand(program: Command): void {
  const skills = program
    .command("skills")
    .description("スキルの管理");

  // --- add ---
  skills
    .command("add <source>")
    .description("GitHub リポジトリからスキルをインストール")
    .option("-s, --skill <names...>", "特定のスキルのみインストール")
    .option("-l, --list", "インストールせずにスキル一覧を表示")
    .action(async (source: string, opts: { skill?: string[]; list?: boolean }) => {
      process.stdout.write(`\n📦 ${source} からスキルを取得中...\n`);

      let fetched: { dir: string; isTemp: boolean } | null = null;
      try {
        fetched = await fetchSource(source);

        const found = await discoverSkillsInRepo(fetched.dir);
        if (found.length === 0) {
          process.stderr.write("スキルが見つかりませんでした。\n");
          return;
        }

        if (opts.list) {
          process.stdout.write(
            `\n${found.length} 個のスキルが見つかりました:\n\n`,
          );
          for (const s of found) {
            process.stdout.write(`  ${s.name}\n    ${s.description}\n\n`);
          }
          return;
        }

        let toInstall = found;
        if (opts.skill) {
          const names = new Set(opts.skill);
          toInstall = found.filter((s) => names.has(s.name));
          const missing = opts.skill.filter(
            (n) => !found.some((s) => s.name === n),
          );
          if (missing.length > 0) {
            process.stderr.write(
              `⚠ 見つからないスキル: ${missing.join(", ")}\n`,
            );
          }
        }

        if (toInstall.length === 0) {
          process.stderr.write("インストールするスキルがありません。\n");
          return;
        }

        await mkdir(SKILLS_DIR, { recursive: true });

        process.stdout.write(
          `\n${toInstall.length} 個のスキルをインストール:\n\n`,
        );
        for (const skill of toInstall) {
          const dest = join(SKILLS_DIR, skill.name);
          await cp(skill.sourceDir, dest, { recursive: true, force: true });
          process.stdout.write(`  ✓ ${skill.name}\n`);
        }

        process.stdout.write(
          `\n✅ ${SKILLS_DIR} にインストールしました。\n`,
        );
      } catch (error) {
        process.stderr.write(
          `✗ ${error instanceof Error ? error.message : String(error)}\n`,
        );
        process.exitCode = 1;
      } finally {
        if (fetched?.isTemp) {
          await rm(fetched.dir, { recursive: true, force: true }).catch(
            () => {},
          );
        }
      }
    });

  // --- list ---
  skills
    .command("list")
    .alias("ls")
    .description("インストール済みスキルを一覧表示")
    .action(async () => {
      let dirs: string[];
      try {
        const entries = await readdir(SKILLS_DIR, { withFileTypes: true });
        dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
      } catch {
        dirs = [];
      }

      if (dirs.length === 0) {
        process.stdout.write("インストール済みのスキルはありません。\n");
        return;
      }

      process.stdout.write(`\n${dirs.length} 個のスキル (${SKILLS_DIR}):\n\n`);
      for (const name of dirs) {
        try {
          const content = await readFile(
            join(SKILLS_DIR, name, "SKILL.md"),
            "utf-8",
          );
          const { data } = matter(content);
          process.stdout.write(
            `  ${data.name ?? name}\n    ${(data.description as string | undefined)?.trim() ?? ""}\n\n`,
          );
        } catch {
          process.stdout.write(`  ${name}\n    (SKILL.md なし)\n\n`);
        }
      }
    });

  // --- remove ---
  skills
    .command("remove <name>")
    .alias("rm")
    .description("スキルを削除")
    .action(async (name: string) => {
      const skillDir = join(SKILLS_DIR, name);
      try {
        await stat(skillDir);
      } catch {
        process.stderr.write(`スキル "${name}" が見つかりません。\n`);
        process.exitCode = 1;
        return;
      }

      await rm(skillDir, { recursive: true, force: true });
      process.stdout.write(`✓ ${name} を削除しました。\n`);
    });
}
