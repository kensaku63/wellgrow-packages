import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { z } from "zod";
import { MAX_READ_LINES, LINE_TRUNCATION } from "./constants.js";
import { defineTool } from "./definition.js";

export interface ReadOutput {
  filePath: string;
  content: string;
  numLines: number;
  startLine: number;
  totalLines: number;
}

const inputSchema = z.object({
  file_path: z.string().describe("ファイルの絶対パス"),
  offset: z
    .number()
    .optional()
    .describe("開始行番号（1-indexed、負の値は末尾からの相対位置）"),
  limit: z.number().optional().describe("読み取り行数"),
});

export const ReadTool = defineTool({
  name: "Read",
  category: "read",
  description: `ファイルの内容を読み取ります。
- テキストファイルのみ対応（ディレクトリは読み取れません）
- デフォルトで先頭2000行まで読み取り、2000文字を超える行は切り詰められます
- 出力は LINE_NUMBER|LINE_CONTENT 形式（行番号は1から開始）
- offset に負の値を指定すると末尾からの相対位置で読み取ります
- 大きなファイルは offset + limit で部分読み取り可能
- 複数ファイルを並列で読み取ることを推奨します
- ファイルパスは絶対パスで指定してください
- 存在しないファイルを読もうとするとエラーが返ります`,
  inputSchema,
  execute: async (input, ctx) => {
    const raw = await readFile(input.file_path, "utf-8");
    ctx.session.agent.readFiles.set(
      input.file_path,
      createHash("md5").update(raw).digest("hex"),
    );
    return formatReadOutput(input.file_path, raw, input.offset, input.limit);
  },
});

function formatReadOutput(
  filePath: string,
  raw: string,
  offset?: number,
  limit?: number,
): ReadOutput {
  const lines = raw.split("\n");
  const totalLines = lines.length;

  let startLine: number;
  if (offset !== undefined) {
    startLine = offset < 0 ? Math.max(1, totalLines + offset + 1) : offset;
  } else {
    startLine = 1;
  }

  const effectiveLimit = Math.min(limit ?? MAX_READ_LINES, MAX_READ_LINES);
  const endLine = Math.min(startLine + effectiveLimit - 1, totalLines);
  const selectedLines = lines.slice(startLine - 1, endLine);

  const formatted = selectedLines
    .map((line, i) => {
      const lineNum = String(startLine + i).padStart(6, " ");
      const truncated =
        line.length > LINE_TRUNCATION
          ? line.slice(0, LINE_TRUNCATION) + "..."
          : line;
      return `${lineNum}|${truncated}`;
    })
    .join("\n");

  return {
    filePath,
    content: formatted,
    numLines: selectedLines.length,
    startLine,
    totalLines,
  };
}
