import { describe, it, expect } from "vitest";
import { parseCommandFile, resolvePrompt } from "../../commands/custom/loader.js";
import type { CommandDefinition } from "../../commands/custom/types.js";

// ---------------------------------------------------------------------------
// parseCommandFile
// ---------------------------------------------------------------------------

describe("parseCommandFile", () => {
  it("parses frontmatter with description and args", () => {
    const raw = `---
description: コードレビューを実行する
args:
  - name: file
    description: レビュー対象
    required: true
  - name: focus
    description: 重点項目
    required: false
---

以下のファイルをレビュー: $file
`;

    const result = parseCommandFile(raw, "/commands/review.md");

    expect(result).not.toBeNull();
    expect(result!.name).toBe("review");
    expect(result!.description).toBe("コードレビューを実行する");
    expect(result!.args).toHaveLength(2);
    expect(result!.args[0]).toEqual({
      name: "file",
      description: "レビュー対象",
      required: true,
    });
    expect(result!.args[1]).toEqual({
      name: "focus",
      description: "重点項目",
      required: false,
    });
    expect(result!.template).toBe("以下のファイルをレビュー: $file");
  });

  it("defaults args to empty array when omitted", () => {
    const raw = `---
description: シンプルなコマンド
---

何かしてください。
`;

    const result = parseCommandFile(raw, "/commands/simple.md");

    expect(result).not.toBeNull();
    expect(result!.args).toEqual([]);
  });

  it("returns null when description is missing", () => {
    const raw = `---
args:
  - name: x
---

テンプレート
`;

    const result = parseCommandFile(raw, "/commands/bad.md");

    expect(result).toBeNull();
  });

  it("returns null when frontmatter is absent", () => {
    const raw = "# ただのマークダウン\n\n本文です。";

    const result = parseCommandFile(raw, "/commands/nofm.md");

    expect(result).toBeNull();
  });

});

// ---------------------------------------------------------------------------
// resolvePrompt
// ---------------------------------------------------------------------------

describe("resolvePrompt", () => {
  function makeCommand(
    template: string,
    args: CommandDefinition["args"] = [],
  ): CommandDefinition {
    return { name: "test", description: "test", args, template };
  }

  it("replaces $argname with positional value", () => {
    const cmd = makeCommand("レビュー: $file", [
      { name: "file", description: "", required: true },
    ]);

    const { prompt, errors } = resolvePrompt(cmd, ["src/app.ts"]);

    expect(errors).toEqual([]);
    expect(prompt).toBe("レビュー: src/app.ts");
  });

  it("replaces ${{argname:default}} with positional value", () => {
    const cmd = makeCommand("観点: ${{focus:セキュリティ}}", [
      { name: "focus", description: "", required: false },
    ]);

    const { prompt, errors } = resolvePrompt(cmd, ["パフォーマンス"]);

    expect(errors).toEqual([]);
    expect(prompt).toBe("観点: パフォーマンス");
  });

  it("uses default value when arg not provided", () => {
    const cmd = makeCommand("観点: ${{focus:セキュリティ}}", [
      { name: "focus", description: "", required: false },
    ]);

    const { prompt, errors } = resolvePrompt(cmd, []);

    expect(errors).toEqual([]);
    expect(prompt).toBe("観点: セキュリティ");
  });

  it("returns error for missing required arg", () => {
    const cmd = makeCommand("$file をチェック", [
      { name: "file", description: "", required: true },
    ]);

    const { errors } = resolvePrompt(cmd, []);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("file");
  });

  it("handles multiple args", () => {
    const cmd = makeCommand("$file を $lang でレビュー", [
      { name: "file", description: "", required: true },
      { name: "lang", description: "", required: false },
    ]);

    const { prompt, errors } = resolvePrompt(cmd, ["app.ts", "日本語"]);

    expect(errors).toEqual([]);
    expect(prompt).toBe("app.ts を 日本語 でレビュー");
  });

  it("merges extra positional args into the last defined arg", () => {
    const cmd = makeCommand("ファイル: $files", [
      { name: "files", description: "", required: true },
    ]);

    const { prompt, errors } = resolvePrompt(cmd, [
      "a.ts",
      "b.ts",
      "c.ts",
    ]);

    expect(errors).toEqual([]);
    expect(prompt).toBe("ファイル: a.ts b.ts c.ts");
  });

  it("leaves $name untouched when no matching arg is defined", () => {
    const cmd = makeCommand("$unknown をチェック", []);

    const { prompt, errors } = resolvePrompt(cmd, []);

    expect(errors).toEqual([]);
    expect(prompt).toBe("$unknown をチェック");
  });

  it("handles template with no args", () => {
    const cmd = makeCommand("プロジェクトを分析してください", []);

    const { prompt, errors } = resolvePrompt(cmd, []);

    expect(errors).toEqual([]);
    expect(prompt).toBe("プロジェクトを分析してください");
  });

  it("handles mix of $arg and ${{arg:default}} syntax", () => {
    const cmd = makeCommand("$file を ${{mode:厳密}} モードでレビュー", [
      { name: "file", description: "", required: true },
      { name: "mode", description: "", required: false },
    ]);

    const { prompt, errors } = resolvePrompt(cmd, ["main.ts"]);

    expect(errors).toEqual([]);
    expect(prompt).toBe("main.ts を 厳密 モードでレビュー");
  });
});
