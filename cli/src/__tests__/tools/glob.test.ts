import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GlobTool } from "../../tools/glob.js";
import type { GlobOutput } from "../../tools/glob.js";
import { createTestToolContext } from "../helpers/test-context.js";
import {
  createTempWorkspace,
  type TempWorkspace,
} from "../helpers/temp-workspace.js";

describe("GlobTool", () => {
  let ws: TempWorkspace;

  beforeEach(async () => {
    ws = await createTempWorkspace({
      "src/app.ts": "export {}",
      "src/utils.ts": "export {}",
      "src/components/button.tsx": "export {}",
      "README.md": "# readme",
      "package.json": "{}",
    });
  });

  afterEach(async () => {
    await ws.cleanup();
  });

  it("finds all .ts files recursively", async () => {
    const ctx = createTestToolContext({ cwd: ws.dir });
    const result = (await GlobTool.execute(
      { pattern: "*.ts" },
      ctx,
    )) as GlobOutput;

    expect(result.numFiles).toBe(2);
    expect(result.filenames).toEqual(
      expect.arrayContaining([
        ws.resolve("src/app.ts"),
        ws.resolve("src/utils.ts"),
      ]),
    );
  });

  it("finds .tsx files", async () => {
    const ctx = createTestToolContext({ cwd: ws.dir });
    const result = (await GlobTool.execute(
      { pattern: "*.tsx" },
      ctx,
    )) as GlobOutput;

    expect(result.numFiles).toBe(1);
    expect(result.filenames[0]).toBe(ws.resolve("src/components/button.tsx"));
  });

  it("supports explicit search path", async () => {
    const ctx = createTestToolContext({ cwd: ws.dir });
    const result = (await GlobTool.execute(
      { pattern: "*.ts", path: ws.resolve("src") },
      ctx,
    )) as GlobOutput;

    expect(result.numFiles).toBe(2);
  });

  it("returns empty for no matches", async () => {
    const ctx = createTestToolContext({ cwd: ws.dir });
    const result = (await GlobTool.execute(
      { pattern: "*.py" },
      ctx,
    )) as GlobOutput;

    expect(result.numFiles).toBe(0);
    expect(result.filenames).toEqual([]);
  });

  it("finds files by exact name", async () => {
    const ctx = createTestToolContext({ cwd: ws.dir });
    const result = (await GlobTool.execute(
      { pattern: "package.json" },
      ctx,
    )) as GlobOutput;

    expect(result.numFiles).toBe(1);
    expect(result.filenames[0]).toBe(ws.resolve("package.json"));
  });
});
