import { describe, it, expect } from "vitest";
import { ToolError, formatToolError } from "../../tools/errors.js";

describe("ToolError", () => {
  it("includes recovery hint when available", () => {
    const err = new ToolError("Edit", "FILE_NOT_READ", "ファイル未読");

    expect(err.message).toContain("ファイル未読");
    expect(err.message).toContain("Read ツールで先にファイルを読んでください");
    expect(err.code).toBe("FILE_NOT_READ");
    expect(err.tool).toBe("Edit");
    expect(err.name).toBe("ToolError");
  });

  it("omits hint when no recovery hint exists", () => {
    const err = new ToolError("Bash", "INTERNAL_ERROR", "内部エラー");

    expect(err.message).toBe("内部エラー");
    expect(err.code).toBe("INTERNAL_ERROR");
  });

  it.each([
    ["FILE_NOT_READ", "Read ツール"],
    ["FILE_NOT_FOUND", "Glob ツール"],
    ["OLD_STRING_NOT_FOUND", "Read ツール"],
    ["OLD_STRING_NOT_UNIQUE", "replace_all"],
    ["OUTPUT_TOO_LARGE", "head_limit"],
  ] as const)("includes correct hint for %s", (code, hintFragment) => {
    const err = new ToolError("Test", code, "テスト");
    expect(err.message).toContain(hintFragment);
  });

  it("concatenates message and hint with separator", () => {
    const err = new ToolError("Edit", "FILE_NOT_READ", "未読です");
    expect(err.message).toBe(
      "未読です。Read ツールで先にファイルを読んでください",
    );
  });
});

describe("formatToolError", () => {
  it("formats ToolError with code and message", () => {
    const err = new ToolError("Read", "FILE_NOT_FOUND", "見つからない");
    const result = formatToolError(err);

    expect(result).toMatch(/^Error: \[FILE_NOT_FOUND\]/);
    expect(result).toContain("見つからない");
  });

  it("formats Zod-like validation errors", () => {
    const zodError = {
      issues: [
        { path: ["file_path"], message: "Required" },
        { path: ["content", "0"], message: "Expected string" },
      ],
    };
    const result = formatToolError(zodError);

    expect(result).toContain("[VALIDATION_ERROR]");
    expect(result).toContain("file_path: Required");
    expect(result).toContain("content.0: Expected string");
  });

  it("formats ENOENT errors", () => {
    const err = Object.assign(new Error("ENOENT"), {
      code: "ENOENT",
      path: "/tmp/missing.txt",
    });
    const result = formatToolError(err);

    expect(result).toContain("[FILE_NOT_FOUND]");
    expect(result).toContain("/tmp/missing.txt");
  });

  it("formats EACCES errors", () => {
    const err = Object.assign(new Error("EACCES"), {
      code: "EACCES",
      path: "/etc/secret",
    });
    const result = formatToolError(err);
    expect(result).toContain("[PERMISSION_DENIED]");
  });

  it("formats EPERM errors", () => {
    const err = Object.assign(new Error("EPERM"), {
      code: "EPERM",
      path: "/root/file",
    });
    const result = formatToolError(err);
    expect(result).toContain("[PERMISSION_DENIED]");
  });

  it("formats EISDIR errors", () => {
    const err = Object.assign(new Error("EISDIR"), {
      code: "EISDIR",
      path: "/tmp/dir",
    });
    const result = formatToolError(err);
    expect(result).toContain("[IS_DIRECTORY]");
  });

  it("formats ENOSPC errors", () => {
    const err = Object.assign(new Error("ENOSPC"), { code: "ENOSPC" });
    const result = formatToolError(err);
    expect(result).toContain("[DISK_FULL]");
  });

  it("formats buffer overflow errors", () => {
    const err = Object.assign(new Error("maxBuffer exceeded"), {
      code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER",
    });
    const result = formatToolError(err);
    expect(result).toContain("[OUTPUT_TOO_LARGE]");
  });

  it("uses err.path when available for ENOENT", () => {
    const err = Object.assign(new Error("no such file"), {
      code: "ENOENT",
      path: "/specific/path.txt",
    });
    const result = formatToolError(err);
    expect(result).toContain("/specific/path.txt");
  });

  it("falls back to err.message when path is missing for ENOENT", () => {
    const err = Object.assign(new Error("no such file: /fallback.txt"), {
      code: "ENOENT",
    });
    const result = formatToolError(err);
    expect(result).toContain("no such file: /fallback.txt");
  });

  it("formats generic Error with message", () => {
    const err = new Error("something went wrong");
    const result = formatToolError(err);
    expect(result).toBe("Error: something went wrong");
  });

  it("formats null", () => {
    const result = formatToolError(null);
    expect(result).toContain("null");
  });

  it("formats undefined", () => {
    const result = formatToolError(undefined);
    expect(result).toContain("undefined");
  });

  it("formats string error", () => {
    const result = formatToolError("string error");
    expect(result).toContain("string error");
  });

  it("formats number error", () => {
    const result = formatToolError(42);
    expect(result).toContain("42");
  });
});
