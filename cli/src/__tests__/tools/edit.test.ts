import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFile } from "node:fs/promises";
import { EditTool } from "../../tools/edit.js";
import type { EditOutput } from "../../tools/edit.js";
import { ReadTool } from "../../tools/read.js";
import { createTestToolContext } from "../helpers/test-context.js";
import {
  createTempWorkspace,
  type TempWorkspace,
} from "../helpers/temp-workspace.js";

describe("EditTool", () => {
  let ws: TempWorkspace;

  beforeEach(async () => {
    ws = await createTempWorkspace({
      "sample.txt": "Hello World\nFoo Bar\nBaz Qux",
      "dupes.txt": "apple banana apple cherry apple",
    });
  });

  afterEach(async () => {
    await ws.cleanup();
  });

  it("rejects edit on unread file", async () => {
    const ctx = createTestToolContext({ cwd: ws.dir });
    await expect(
      EditTool.execute(
        {
          file_path: ws.resolve("sample.txt"),
          old_string: "Hello",
          new_string: "Hi",
        },
        ctx,
      ),
    ).rejects.toThrow("確認が必要です");
  });

  it("replaces unique string", async () => {
    const ctx = createTestToolContext({ cwd: ws.dir });
    await ReadTool.execute({ file_path: ws.resolve("sample.txt") }, ctx);

    const result = (await EditTool.execute(
      {
        file_path: ws.resolve("sample.txt"),
        old_string: "Foo Bar",
        new_string: "FOO BAR",
      },
      ctx,
    )) as EditOutput;

    expect(result.oldString).toBe("Foo Bar");
    expect(result.newString).toBe("FOO BAR");
    expect(result.structuredPatch.length).toBeGreaterThan(0);

    const content = await readFile(ws.resolve("sample.txt"), "utf-8");
    expect(content).toBe("Hello World\nFOO BAR\nBaz Qux");
  });

  it("rejects when old_string is not found", async () => {
    const ctx = createTestToolContext({ cwd: ws.dir });
    await ReadTool.execute({ file_path: ws.resolve("sample.txt") }, ctx);

    await expect(
      EditTool.execute(
        {
          file_path: ws.resolve("sample.txt"),
          old_string: "NONEXISTENT",
          new_string: "replacement",
        },
        ctx,
      ),
    ).rejects.toThrow("見つかりません");
  });

  it("rejects when old_string is not unique (without replace_all)", async () => {
    const ctx = createTestToolContext({ cwd: ws.dir });
    await ReadTool.execute({ file_path: ws.resolve("dupes.txt") }, ctx);

    await expect(
      EditTool.execute(
        {
          file_path: ws.resolve("dupes.txt"),
          old_string: "apple",
          new_string: "orange",
        },
        ctx,
      ),
    ).rejects.toThrow("複数箇所");
  });

  it("replaces all occurrences with replace_all: true", async () => {
    const ctx = createTestToolContext({ cwd: ws.dir });
    await ReadTool.execute({ file_path: ws.resolve("dupes.txt") }, ctx);

    const result = (await EditTool.execute(
      {
        file_path: ws.resolve("dupes.txt"),
        old_string: "apple",
        new_string: "orange",
        replace_all: true,
      },
      ctx,
    )) as EditOutput;

    expect(result.replaceAll).toBe(true);

    const content = await readFile(ws.resolve("dupes.txt"), "utf-8");
    expect(content).toBe("orange banana orange cherry orange");
    expect(content).not.toContain("apple");
  });

  it("detects user modifications via hash mismatch", async () => {
    const ctx = createTestToolContext({ cwd: ws.dir });
    await ReadTool.execute({ file_path: ws.resolve("sample.txt") }, ctx);

    // Simulate external modification by setting a stale hash
    ctx.session.agent.readFiles.set(ws.resolve("sample.txt"), "stale-hash");

    const result = (await EditTool.execute(
      {
        file_path: ws.resolve("sample.txt"),
        old_string: "Foo Bar",
        new_string: "Modified",
      },
      ctx,
    )) as EditOutput;

    expect(result.userModified).toBe(true);
  });
});
