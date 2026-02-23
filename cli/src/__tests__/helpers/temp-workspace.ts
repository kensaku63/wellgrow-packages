import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

export interface TempWorkspace {
  dir: string;
  resolve: (path: string) => string;
  cleanup: () => Promise<void>;
}

export async function createTempWorkspace(
  files: Record<string, string> = {},
): Promise<TempWorkspace> {
  const dir = await mkdtemp(join(tmpdir(), "wellgrow-test-"));

  for (const [name, content] of Object.entries(files)) {
    const filePath = join(dir, name);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf-8");
  }

  return {
    dir,
    resolve: (path: string) => join(dir, path),
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}
