export type ToolErrorCode =
  | "FILE_NOT_READ"
  | "FILE_NOT_FOUND"
  | "PERMISSION_DENIED"
  | "VALIDATION_ERROR"
  | "OLD_STRING_NOT_FOUND"
  | "OLD_STRING_NOT_UNIQUE"
  | "COMMAND_NOT_FOUND"
  | "COMMAND_PERMISSION"
  | "SPAWN_ERROR"
  | "DISK_FULL"
  | "IS_DIRECTORY"
  | "OUTPUT_TOO_LARGE"
  | "INTERNAL_ERROR";

const RECOVERY_HINTS: Partial<Record<ToolErrorCode, string>> = {
  FILE_NOT_READ:
    "Read ツールで先にファイルを読んでください",
  FILE_NOT_FOUND:
    "Glob ツールでファイルパスを確認してください",
  PERMISSION_DENIED:
    "ファイルの権限を確認してください (ls -la)",
  OLD_STRING_NOT_FOUND:
    "Read ツールで最新の内容を確認してください",
  OLD_STRING_NOT_UNIQUE:
    "より多くのコンテキストを含めてユニークにするか、replace_all: true を使用してください",
  COMMAND_NOT_FOUND:
    "wellgrow doctor でツールのインストール状況を確認するか、別のコマンドを使用してください",
  COMMAND_PERMISSION:
    "ファイルの実行権限を確認してください (chmod +x)",
  OUTPUT_TOO_LARGE:
    "head_limit で制限するか、出力の少ないコマンドを使用してください",
};

export class ToolError extends Error {
  readonly code: ToolErrorCode;
  readonly tool: string;

  constructor(tool: string, code: ToolErrorCode, message: string) {
    const hint = RECOVERY_HINTS[code];
    const fullMessage = hint ? `${message}。${hint}` : message;
    super(fullMessage);
    this.name = "ToolError";
    this.tool = tool;
    this.code = code;
  }
}

function mapErrnoToToolError(
  err: NodeJS.ErrnoException,
): { code: ToolErrorCode; message: string } | null {
  switch (err.code) {
    case "ENOENT":
      return { code: "FILE_NOT_FOUND", message: `ファイルが見つかりません: ${err.path ?? err.message}` };
    case "EACCES":
    case "EPERM":
      return { code: "PERMISSION_DENIED", message: `アクセス権限がありません: ${err.path ?? err.message}` };
    case "EISDIR":
      return { code: "IS_DIRECTORY", message: `ディレクトリに対する操作はできません: ${err.path ?? err.message}` };
    case "ENOSPC":
      return { code: "DISK_FULL", message: "ディスク容量が不足しています" };
    case "ERR_CHILD_PROCESS_STDIO_MAXBUFFER":
      return { code: "OUTPUT_TOO_LARGE", message: "出力が大きすぎます" };
    default:
      return null;
  }
}

export function formatToolError(error: unknown): string {
  if (error instanceof ToolError) {
    return `Error: [${error.code}] ${error.message}`;
  }

  if (error && typeof error === "object" && "issues" in error) {
    const issues = (
      error as {
        issues: Array<{ path: (string | number)[]; message: string }>;
      }
    ).issues;
    const details = issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join(", ");
    return `Error: [VALIDATION_ERROR] 入力パラメータが不正です: ${details}`;
  }

  if (!error || typeof error !== "object") {
    return `Error: ツール実行エラー: ${String(error)}`;
  }

  const err = error as NodeJS.ErrnoException;

  const mapped = mapErrnoToToolError(err);
  if (mapped) {
    const hint = RECOVERY_HINTS[mapped.code];
    const base = `Error: [${mapped.code}] ${mapped.message}`;
    return hint ? `${base}。${hint}` : base;
  }

  return `Error: ${err.message ?? String(error)}`;
}
