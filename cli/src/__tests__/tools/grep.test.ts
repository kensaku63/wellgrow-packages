import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GrepTool } from "../../tools/grep.js";
import type { GrepOutput } from "../../tools/grep.js";
import { createTestToolContext } from "../helpers/test-context.js";
import {
  createTempWorkspace,
  type TempWorkspace,
} from "../helpers/temp-workspace.js";

describe("GrepTool", () => {
  let ws: TempWorkspace;

  beforeEach(async () => {
    ws = await createTempWorkspace({
      "src/main.ts": 'const greeting = "hello world";\nconsole.log(greeting);',
      "src/utils.ts":
        'export function greet(name: string) {\n  return `hello ${name}`;\n}',
      "data.json": '{"hello": "world"}',
    });
  });

  afterEach(async () => {
    await ws.cleanup();
  });

  it("finds files containing pattern (files_with_matches mode)", async () => {
    const ctx = createTestToolContext({ cwd: ws.dir });
    const result = (await GrepTool.execute(
      { pattern: "hello", path: ws.dir },
      ctx,
    )) as GrepOutput;

    expect(result.mode).toBe("files_with_matches");
    expect(result.numFiles).toBe(3);
    expect(result.filenames).toEqual(
      expect.arrayContaining([
        ws.resolve("src/main.ts"),
        ws.resolve("src/utils.ts"),
        ws.resolve("data.json"),
      ]),
    );
  });

  it("returns content with line numbers (content mode)", async () => {
    const ctx = createTestToolContext({ cwd: ws.dir });
    const result = (await GrepTool.execute(
      {
        pattern: "greeting",
        path: ws.dir,
        output_mode: "content",
      },
      ctx,
    )) as GrepOutput;

    expect(result.mode).toBe("content");
    expect(result.content).toBeTruthy();
    expect(result.content).toContain("greeting");
  });

  it("returns match counts (count mode)", async () => {
    const ctx = createTestToolContext({ cwd: ws.dir });
    const result = (await GrepTool.execute(
      {
        pattern: "hello",
        path: ws.dir,
        output_mode: "count",
      },
      ctx,
    )) as GrepOutput;

    expect(result.mode).toBe("count");
    expect(result.numFiles).toBeGreaterThan(0);
    expect(result.numMatches).toBeGreaterThanOrEqual(3);
  });

  it("returns empty result for no matches", async () => {
    const ctx = createTestToolContext({ cwd: ws.dir });
    const result = (await GrepTool.execute(
      { pattern: "ZZZZNOTFOUND", path: ws.dir },
      ctx,
    )) as GrepOutput;

    expect(result.numFiles).toBe(0);
    expect(result.filenames).toEqual([]);
  });

  it("supports case-insensitive search", async () => {
    const ctx = createTestToolContext({ cwd: ws.dir });
    const result = (await GrepTool.execute(
      {
        pattern: "HELLO",
        path: ws.dir,
        case_insensitive: true,
      },
      ctx,
    )) as GrepOutput;

    expect(result.numFiles).toBe(3);
  });

  it("filters by glob pattern", async () => {
    const ctx = createTestToolContext({ cwd: ws.dir });
    const result = (await GrepTool.execute(
      {
        pattern: "hello",
        path: ws.dir,
        glob: "*.ts",
      },
      ctx,
    )) as GrepOutput;

    expect(result.numFiles).toBe(2);
    expect(result.filenames.every((f) => f.endsWith(".ts"))).toBe(true);
  });
});
