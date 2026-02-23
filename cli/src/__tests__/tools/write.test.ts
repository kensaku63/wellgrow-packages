import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFile } from "node:fs/promises";
import { WriteTool } from "../../tools/write.js";
import type { WriteOutput } from "../../tools/write.js";
import { createTestToolContext } from "../helpers/test-context.js";
import {
  createTempWorkspace,
  type TempWorkspace,
} from "../helpers/temp-workspace.js";

describe("WriteTool", () => {
  let ws: TempWorkspace;

  beforeEach(async () => {
    ws = await createTempWorkspace({
      "existing.txt": "original content",
    });
  });

  afterEach(async () => {
    await ws.cleanup();
  });

  it("creates a new file", async () => {
    const ctx = createTestToolContext({ cwd: ws.dir });
    const result = (await WriteTool.execute(
      {
        file_path: ws.resolve("new-file.txt"),
        content: "hello world",
      },
      ctx,
    )) as WriteOutput;

    expect(result.type).toBe("create");
    expect(result.filePath).toBe(ws.resolve("new-file.txt"));

    const written = await readFile(ws.resolve("new-file.txt"), "utf-8");
    expect(written).toBe("hello world");
  });

  it("creates parent directories automatically", async () => {
    const ctx = createTestToolContext({ cwd: ws.dir });
    const result = (await WriteTool.execute(
      {
        file_path: ws.resolve("deep/nested/file.txt"),
        content: "nested content",
      },
      ctx,
    )) as WriteOutput;

    expect(result.type).toBe("create");
    const written = await readFile(ws.resolve("deep/nested/file.txt"), "utf-8");
    expect(written).toBe("nested content");
  });

  it("rejects overwrite of unread file", async () => {
    const ctx = createTestToolContext({ cwd: ws.dir });
    await expect(
      WriteTool.execute(
        {
          file_path: ws.resolve("existing.txt"),
          content: "overwritten",
        },
        ctx,
      ),
    ).rejects.toThrow("確認が必要です");
  });

  it("allows overwrite after file is marked as read", async () => {
    const ctx = createTestToolContext({ cwd: ws.dir });
    ctx.session.agent.readFiles.set(ws.resolve("existing.txt"), "somehash");

    const result = (await WriteTool.execute(
      {
        file_path: ws.resolve("existing.txt"),
        content: "updated content",
      },
      ctx,
    )) as WriteOutput;

    expect(result.type).toBe("update");
    expect(result.structuredPatch.length).toBeGreaterThan(0);

    const written = await readFile(ws.resolve("existing.txt"), "utf-8");
    expect(written).toBe("updated content");
  });

  it("updates readFiles hash after write", async () => {
    const ctx = createTestToolContext({ cwd: ws.dir });
    await WriteTool.execute(
      {
        file_path: ws.resolve("brand-new.txt"),
        content: "content A",
      },
      ctx,
    );

    const hash1 = ctx.session.agent.readFiles.get(ws.resolve("brand-new.txt"));
    expect(hash1).toBeTruthy();

    await WriteTool.execute(
      {
        file_path: ws.resolve("brand-new.txt"),
        content: "content B",
      },
      ctx,
    );

    const hash2 = ctx.session.agent.readFiles.get(ws.resolve("brand-new.txt"));
    expect(hash2).toBeTruthy();
    expect(hash1).not.toBe(hash2);
  });
});
