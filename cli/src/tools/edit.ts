import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { structuredPatch } from "diff";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { ToolError } from "./errors.js";
import { defineTool } from "./definition.js";

const execFileAsync = promisify(execFile);

interface PatchHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

interface GitDiffInfo {
  filename: string;
  status: "modified" | "added";
  additions: number;
  deletions: number;
  changes: number;
  patch: string;
}

export interface EditOutput {
  filePath: string;
  oldString: string;
  newString: string;
  structuredPatch: PatchHunk[];
  userModified: boolean;
  replaceAll: boolean;
  gitDiff?: GitDiffInfo;
}

function hashContent(content: string): string {
  return createHash("md5").update(content).digest("hex");
}

function generateStructuredPatch(
  filePath: string,
  oldContent: string,
  newContent: string,
): PatchHunk[] {
  const patch = structuredPatch(filePath, filePath, oldContent, newContent);
  return patch.hunks.map((h) => ({
    oldStart: h.oldStart,
    oldLines: h.oldLines,
    newStart: h.newStart,
    newLines: h.newLines,
    lines: h.lines,
  }));
}

async function getGitDiff(filePath: string): Promise<GitDiffInfo | undefined> {
  try {
    const { stdout } = await execFileAsync("git", ["diff", "--", filePath], {
      timeout: 5000,
    });
    if (!stdout.trim()) return undefined;
    const additions = (stdout.match(/^\+[^+]/gm) ?? []).length;
    const deletions = (stdout.match(/^-[^-]/gm) ?? []).length;
    return {
      filename: filePath,
      status: "modified",
      additions,
      deletions,
      changes: additions + deletions,
      patch: stdout,
    };
  } catch {
    return undefined;
  }
}

const inputSchema = z.object({
  file_path: z.string().describe("ファイルの絶対パス"),
  old_string: z.string().describe("置換対象の文字列（ユニークであること）"),
  new_string: z.string().describe("置換後の文字列"),
  replace_all: z
    .boolean()
    .optional()
    .describe("全出現箇所を置換するか（デフォルト: false）"),
});

export const EditTool = defineTool({
  name: "Edit",
  category: "write",
  description: `既存ファイルの部分編集（文字列置換）を行います。
- 編集前に必ず Read でファイルを読んでおくこと（未読ならエラー）
- Read 出力のインデント（タブ/スペース）を正確に保持すること
- old_string はファイル内でユニークであること（複数箇所にある場合はエラー）
  → コンテキストを多く含めてユニークにするか、replace_all: true を使用
- replace_all はファイル全体のリネーム・一括置換に使用
- 既存ファイルの編集には Write でなくこのツールを優先すること`,
  inputSchema,
  execute: async (input, ctx) => {
    return executeEdit(input, ctx.session.agent.readFiles);
  },
});

async function executeEdit(
  args: {
    file_path: string;
    old_string: string;
    new_string: string;
    replace_all?: boolean;
  },
  readFiles: Map<string, string>,
): Promise<EditOutput> {
  if (!readFiles.has(args.file_path)) {
    throw new ToolError(
      "Edit",
      "FILE_NOT_READ",
      `${args.file_path} を編集する前に確認が必要です`,
    );
  }

  const content = await readFile(args.file_path, "utf-8");

  const currentHash = hashContent(content);
  const savedHash = readFiles.get(args.file_path) ?? "";
  const userModified = savedHash !== "" && currentHash !== savedHash;

  if (!content.includes(args.old_string)) {
    throw new ToolError(
      "Edit",
      "OLD_STRING_NOT_FOUND",
      `old_string がファイル内に見つかりません`,
    );
  }

  if (!args.replace_all) {
    const firstIndex = content.indexOf(args.old_string);
    const lastIndex = content.lastIndexOf(args.old_string);
    if (firstIndex !== lastIndex) {
      throw new ToolError(
        "Edit",
        "OLD_STRING_NOT_UNIQUE",
        `old_string がファイル内に複数箇所あります`,
      );
    }
  }

  let newContent: string;

  if (args.replace_all) {
    newContent = content.split(args.old_string).join(args.new_string);
  } else {
    newContent = content.replace(args.old_string, args.new_string);
  }

  await writeFile(args.file_path, newContent, "utf-8");

  readFiles.set(args.file_path, hashContent(newContent));

  const patches = generateStructuredPatch(args.file_path, content, newContent);
  const gitDiff = await getGitDiff(args.file_path);

  return {
    filePath: args.file_path,
    oldString: args.old_string,
    newString: args.new_string,
    structuredPatch: patches,
    userModified,
    replaceAll: args.replace_all ?? false,
    gitDiff,
  };
}
