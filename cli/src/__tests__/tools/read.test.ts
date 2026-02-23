import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ReadTool } from "../../tools/read.js";
import type { ReadOutput } from "../../tools/read.js";
import { createTestToolContext } from "../helpers/test-context.js";
import {
  createTempWorkspace,
  type TempWorkspace,
} from "../helpers/temp-workspace.js";

describe("ReadTool", () => {
  let ws: TempWorkspace;

  beforeEach(async () => {
    ws = await createTempWorkspace({
      "hello.txt": "Line 1\nLine 2\nLine 3\nLine 4\nLine 5",
      "empty.txt": "",
    });
  });

  afterEach(async () => {
    await ws.cleanup();
  });

  it("reads entire file with line numbers", async () => {
    const ctx = createTestToolContext({ cwd: ws.dir });
    const result = (await ReadTool.execute(
      { file_path: ws.resolve("hello.txt") },
      ctx,
    )) as ReadOutput;

    expect(result.totalLines).toBe(5);
    expect(result.numLines).toBe(5);
    expect(result.startLine).toBe(1);
    expect(result.content).toContain("1|Line 1");
    expect(result.content).toContain("5|Line 5");
  });

  it("reads with positive offset", async () => {
    const ctx = createTestToolContext({ cwd: ws.dir });
    const result = (await ReadTool.execute(
      { file_path: ws.resolve("hello.txt"), offset: 3 },
      ctx,
    )) as ReadOutput;

    expect(result.startLine).toBe(3);
    expect(result.content).toContain("3|Line 3");
    expect(result.content).not.toContain("1|Line 1");
  });

  it("reads with negative offset (from end)", async () => {
    const ctx = createTestToolContext({ cwd: ws.dir });
    const result = (await ReadTool.execute(
      { file_path: ws.resolve("hello.txt"), offset: -2 },
      ctx,
    )) as ReadOutput;

    expect(result.startLine).toBe(4);
    expect(result.content).toContain("4|Line 4");
    expect(result.content).toContain("5|Line 5");
  });

  it("reads with limit", async () => {
    const ctx = createTestToolContext({ cwd: ws.dir });
    const result = (await ReadTool.execute(
      { file_path: ws.resolve("hello.txt"), offset: 2, limit: 2 },
      ctx,
    )) as ReadOutput;

    expect(result.numLines).toBe(2);
    expect(result.content).toContain("2|Line 2");
    expect(result.content).toContain("3|Line 3");
    expect(result.content).not.toContain("4|Line 4");
  });

  it("stores file hash in readFiles map", async () => {
    const ctx = createTestToolContext({ cwd: ws.dir });
    await ReadTool.execute(
      { file_path: ws.resolve("hello.txt") },
      ctx,
    );

    expect(ctx.session.agent.readFiles.has(ws.resolve("hello.txt"))).toBe(true);
  });

  it("throws on nonexistent file", async () => {
    const ctx = createTestToolContext({ cwd: ws.dir });
    await expect(
      ReadTool.execute({ file_path: ws.resolve("nope.txt") }, ctx),
    ).rejects.toThrow();
  });

  it("reads empty file", async () => {
    const ctx = createTestToolContext({ cwd: ws.dir });
    const result = (await ReadTool.execute(
      { file_path: ws.resolve("empty.txt") },
      ctx,
    )) as ReadOutput;

    expect(result.totalLines).toBe(1);
    expect(result.content).toBe("     1|");
  });
});
