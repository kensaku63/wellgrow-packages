import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { ToolError } from "./errors.js";
import { defineTool } from "./definition.js";

const execFileAsync = promisify(execFile);

export type GrepMode = "content" | "files_with_matches" | "count";

export interface GrepOutput {
  mode: GrepMode;
  numFiles: number;
  filenames: string[];
  content?: string;
  numLines?: number;
  numMatches?: number;
  appliedLimit?: number;
  appliedOffset?: number;
}

export interface GrepArgs {
  pattern: string;
  path?: string;
  glob?: string;
  output_mode?: GrepMode;
  before_context?: number;
  after_context?: number;
  context?: number;
  case_insensitive?: boolean;
  type?: string;
  head_limit?: number;
  offset?: number;
  multiline?: boolean;
}

const inputSchema = z.object({
  pattern: z.string().min(1).describe("正規表現パターン（ripgrep 構文）"),
  path: z.string().optional().describe("検索対象の絶対パス"),
  glob: z
    .string()
    .optional()
    .describe("ファイルフィルタ（例: '*.ts', '*.{ts,tsx}'）"),
  output_mode: z
    .enum(["content", "files_with_matches", "count"])
    .optional()
    .describe(
      "出力モード（デフォルト: files_with_matches）。content: マッチ行とコンテキストを返す。files_with_matches: マッチしたファイルパスのみ返す。count: ファイルごとのマッチ数を返す",
    ),
  before_context: z
    .number()
    .optional()
    .describe("マッチ前の行数（ripgrep -B）"),
  after_context: z
    .number()
    .optional()
    .describe("マッチ後の行数（ripgrep -A）"),
  context: z
    .number()
    .optional()
    .describe("前後のコンテキスト行数（ripgrep -C）"),
  case_insensitive: z
    .boolean()
    .optional()
    .describe("大文字小文字を区別しない（ripgrep -i）"),
  type: z
    .string()
    .optional()
    .describe("ファイルタイプ（rg --type、例: js, py, ts）"),
  head_limit: z
    .number()
    .optional()
    .describe(
      "結果の先頭N件に制限。content モードではマッチ行数、files_with_matches/count モードではファイル数が対象",
    ),
  offset: z
    .number()
    .optional()
    .describe(
      "先頭N件をスキップ。head_limit と組み合わせてページネーション的に使用可能",
    ),
  multiline: z
    .boolean()
    .optional()
    .describe("マルチライン検索モード（ripgrep -U --multiline-dotall）"),
});

export const GrepTool = defineTool({
  name: "Grep",
  category: "read",
  description: `ファイル内のテキストをパターンで検索します（ripgrep ベース）。
- テキスト検索には必ず Grep を使い、Bash で grep や rg を実行しないでください
- 正規表現構文をサポート（例: "log.*Error", "function\\s+\\w+"）
- リテラルのブレースはエスケープが必要（例: interface\\{\\}）
- output_mode のデフォルトは files_with_matches（ファイルパスのみ）
  - content: マッチ行とコンテキストを表示（before_context/after_context/context で行数指定）
  - count: ファイルごとのマッチ数を表示
- head_limit + offset でページネーション的な使い方が可能
- multiline: true で複数行にまたがるパターンを検索可能`,
  inputSchema,
  execute: async (input, ctx) => {
    return executeGrep(input, ctx.session.cwd);
  },
});

function parseRgOutput(
  stdout: string,
  mode: GrepMode,
  offset?: number,
  limit?: number,
): GrepOutput {
  const allLines = stdout.trim().split("\n").filter(Boolean);
  const appliedOffset = offset ?? 0;
  const appliedLimit = limit;

  if (mode === "files_with_matches") {
    let files = allLines;
    if (appliedOffset) files = files.slice(appliedOffset);
    if (appliedLimit) files = files.slice(0, appliedLimit);
    return { mode, numFiles: files.length, filenames: files, appliedOffset, appliedLimit };
  }

  if (mode === "count") {
    const entries = allLines.map((l) => {
      const lastColon = l.lastIndexOf(":");
      return {
        file: l.slice(0, lastColon),
        count: parseInt(l.slice(lastColon + 1)) || 0,
      };
    });
    const uniqueFiles = [...new Set(entries.map((e) => e.file))];
    const totalMatches = entries.reduce((sum, e) => sum + e.count, 0);
    return { mode, numFiles: uniqueFiles.length, filenames: uniqueFiles, numMatches: totalMatches, appliedOffset, appliedLimit };
  }

  let lines = allLines;
  if (appliedOffset) lines = lines.slice(appliedOffset);
  if (appliedLimit) lines = lines.slice(0, appliedLimit);
  const filenames = [
    ...new Set(
      lines
        .filter((l) => l.includes(":"))
        .map((l) => l.split(":")[0]),
    ),
  ];
  return { mode, numFiles: filenames.length, filenames, content: lines.join("\n"), numLines: lines.length, appliedOffset, appliedLimit };
}

async function executeGrep(args: GrepArgs, sessionCwd: string): Promise<GrepOutput> {
  const mode: GrepMode = args.output_mode ?? "files_with_matches";
  const rgArgs: string[] = [];

  if (mode === "files_with_matches") rgArgs.push("-l");
  if (mode === "count") rgArgs.push("--count");
  if (mode === "content") rgArgs.push("-n");
  if (args.case_insensitive) rgArgs.push("-i");
  if (args.before_context !== undefined) rgArgs.push("-B", String(args.before_context));
  if (args.after_context !== undefined) rgArgs.push("-A", String(args.after_context));
  if (args.context !== undefined) rgArgs.push("-C", String(args.context));
  if (args.glob) rgArgs.push("--glob", args.glob);
  if (args.type) rgArgs.push("--type", args.type);
  if (args.multiline) rgArgs.push("-U", "--multiline-dotall");

  rgArgs.push("--", args.pattern);
  rgArgs.push(args.path ?? sessionCwd);

  async function runRg(extraArgs: string[] = []): Promise<string> {
    const { stdout } = await execFileAsync("rg", [...extraArgs, ...rgArgs], {
      maxBuffer: 1024 * 1024,
    });
    return stdout;
  }

  try {
    const stdout = await runRg();
    return parseRgOutput(stdout, mode, args.offset, args.head_limit);
  } catch (error: unknown) {
    const err = error as { code?: number; stderr?: string };
    if (err.code === 1) {
      return { mode, numFiles: 0, filenames: [] };
    }

    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new ToolError("Grep", "COMMAND_NOT_FOUND", "ripgrep (rg) がインストールされていません");
    }

    const stderrStr = String(err.stderr ?? "");
    if (stderrStr.includes("EAGAIN") || (err as NodeJS.ErrnoException).code === "EAGAIN") {
      try {
        const stdout = await runRg(["-j1"]);
        return parseRgOutput(stdout, mode, args.offset, args.head_limit);
      } catch (retryError: unknown) {
        if ((retryError as { code?: number }).code === 1) {
          return { mode, numFiles: 0, filenames: [] };
        }
        throw retryError;
      }
    }

    throw error;
  }
}
