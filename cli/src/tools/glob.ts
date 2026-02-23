import { glob } from "glob";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { GLOB_MAX_FILES } from "./constants.js";
import { ToolError } from "./errors.js";
import { defineTool } from "./definition.js";

export interface GlobOutput {
  numFiles: number;
  filenames: string[];
  truncated: boolean;
  durationMs: number;
}

const inputSchema = z.object({
  pattern: z
    .string()
    .describe("glob パターン（例: '*.ts', 'src/**/*.tsx'）"),
  path: z.string().optional().describe("検索ディレクトリの絶対パス"),
});

export const GlobTool = defineTool({
  name: "Glob",
  category: "read",
  description: `ファイル名パターンでファイルを検索します（ファイル内容は見ません）。
- ファイル検索には必ず Glob を使い、Bash で find を実行しないでください
- '**/' で始まらないパターンは自動的に '**/' が付与されます（例: '*.ts' → '**/*.ts'）
- 結果は更新日時順（最新が先）、上限100件
- node_modules と .git は自動除外
- ファイル名や拡張子でファイルを探すときに使用してください`,
  inputSchema,
  execute: async (input, ctx) => {
    return executeGlob(input, ctx.session.cwd);
  },
});

async function executeGlob(
  args: { pattern: string; path?: string },
  sessionCwd: string,
): Promise<GlobOutput> {
  const startTime = Date.now();
  const cwd = resolve(args.path ?? sessionCwd);

  try {
    await stat(cwd);
  } catch {
    throw new ToolError("Glob", "FILE_NOT_FOUND", `検索ディレクトリが見つかりません: ${cwd}`);
  }

  let pattern = args.pattern;
  if (!pattern.startsWith("**/") && !pattern.startsWith("/")) {
    pattern = `**/${pattern}`;
  }

  const files = await glob(pattern, {
    cwd,
    absolute: true,
    nodir: true,
    dot: false,
    ignore: ["**/node_modules/**", "**/.git/**"],
  });

  const withStats = await Promise.all(
    files.map(async (f) => {
      try {
        const s = await stat(f);
        return { path: f, mtime: s.mtimeMs };
      } catch {
        return { path: f, mtime: 0 };
      }
    }),
  );
  withStats.sort((a, b) => b.mtime - a.mtime);

  const truncated = withStats.length > GLOB_MAX_FILES;
  const result = withStats.slice(0, GLOB_MAX_FILES).map((f) => f.path);

  return {
    numFiles: result.length,
    filenames: result,
    truncated,
    durationMs: Date.now() - startTime,
  };
}
