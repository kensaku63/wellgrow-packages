import { writeFile, readFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
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

export interface WriteOutput {
  type: "create" | "update";
  filePath: string;
  structuredPatch: PatchHunk[];
  gitDiff?: GitDiffInfo;
}

const inputSchema = z.object({
  file_path: z.string().describe("ファイルの絶対パス"),
  content: z.string().describe("ファイルの全内容"),
});

export const WriteTool = defineTool({
  name: "Write",
  category: "write",
  description: `ファイルを新規作成または全体上書きします。
- 既存ファイルの編集には Edit を優先してください
- 既存ファイルを上書きする場合、先に Read で内容を確認してください（未読ならエラー）
- 親ディレクトリが存在しない場合は自動作成されます
- ドキュメントファイル（.md, README）は明示的に要求されない限り作成しないでください
- ファイルパスは絶対パスで指定してください`,
  inputSchema,
  execute: async (input, ctx) => {
    return executeWrite(input, ctx.session.agent.readFiles);
  },
});

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

async function getGitDiff(filePath: string, status: "modified" | "added"): Promise<GitDiffInfo | undefined> {
  try {
    const { stdout } = await execFileAsync("git", ["diff", "--", filePath], {
      timeout: 5000,
    });
    if (!stdout.trim()) return undefined;
    const additions = (stdout.match(/^\+[^+]/gm) ?? []).length;
    const deletions = (stdout.match(/^-[^-]/gm) ?? []).length;
    return {
      filename: filePath,
      status,
      additions,
      deletions,
      changes: additions + deletions,
      patch: stdout,
    };
  } catch {
    return undefined;
  }
}

async function executeWrite(
  args: { file_path: string; content: string },
  readFiles: Map<string, string>,
): Promise<WriteOutput> {
  let originalContent: string | null = null;

  try {
    originalContent = await readFile(args.file_path, "utf-8");
  } catch {
    originalContent = null;
  }

  const isUpdate = originalContent !== null;

  if (isUpdate && !readFiles.has(args.file_path)) {
    throw new ToolError(
      "Write",
      "FILE_NOT_READ",
      `${args.file_path} を上書きする前に確認が必要です`,
    );
  }

  await mkdir(dirname(args.file_path), { recursive: true });
  await writeFile(args.file_path, args.content, "utf-8");

  const hash = createHash("md5").update(args.content).digest("hex");
  readFiles.set(args.file_path, hash);

  const patches = generateStructuredPatch(
    args.file_path,
    originalContent ?? "",
    args.content,
  );

  const gitDiff = await getGitDiff(
    args.file_path,
    isUpdate ? "modified" : "added",
  );

  return {
    type: isUpdate ? "update" : "create",
    filePath: args.file_path,
    structuredPatch: patches,
    gitDiff,
  };
}
