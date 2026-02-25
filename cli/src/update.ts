import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import chalk from "chalk";

declare const PKG_VERSION: string;

const REGISTRY_URL = "https://registry.npmjs.org/@wellgrow/cli/latest";
const CACHE_FILE = join(homedir(), ".wellgrow", ".update-check");
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

interface UpdateCache {
  lastCheck: number;
  latestVersion: string;
}

function compareVersions(current: string, latest: string): number {
  const parse = (v: string) => {
    const hyphenIdx = v.indexOf("-");
    const core = hyphenIdx === -1 ? v : v.slice(0, hyphenIdx);
    const preRelease = hyphenIdx === -1 ? null : v.slice(hyphenIdx + 1);
    const [major = 0, minor = 0, patch = 0] = core.split(".").map(Number);
    return { major, minor, patch, preRelease };
  };

  const a = parse(current);
  const b = parse(latest);

  for (const key of ["major", "minor", "patch"] as const) {
    if (a[key] < b[key]) return -1;
    if (a[key] > b[key]) return 1;
  }

  if (!a.preRelease && !b.preRelease) return 0;
  // Pre-release has lower precedence than release (SemVer §11)
  if (a.preRelease && !b.preRelease) return -1;
  if (!a.preRelease && b.preRelease) return 1;

  const aIds = a.preRelease!.split(".");
  const bIds = b.preRelease!.split(".");
  const len = Math.max(aIds.length, bIds.length);
  for (let i = 0; i < len; i++) {
    if (aIds[i] === undefined) return -1;
    if (bIds[i] === undefined) return 1;
    const aNum = Number(aIds[i]);
    const bNum = Number(bIds[i]);
    const aIsNum = !Number.isNaN(aNum);
    const bIsNum = !Number.isNaN(bNum);
    if (aIsNum && bIsNum) {
      if (aNum < bNum) return -1;
      if (aNum > bNum) return 1;
    } else if (aIsNum) {
      return -1;
    } else if (bIsNum) {
      return 1;
    } else {
      if (aIds[i]! < bIds[i]!) return -1;
      if (aIds[i]! > bIds[i]!) return 1;
    }
  }
  return 0;
}

async function readCache(): Promise<UpdateCache | null> {
  try {
    const data = await readFile(CACHE_FILE, "utf-8");
    return JSON.parse(data) as UpdateCache;
  } catch {
    return null;
  }
}

async function writeCache(cache: UpdateCache): Promise<void> {
  await mkdir(join(homedir(), ".wellgrow"), { recursive: true });
  await writeFile(CACHE_FILE, JSON.stringify(cache), "utf-8");
}

async function fetchLatestVersion(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(REGISTRY_URL, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = (await res.json()) as { version: string };
    return data.version;
  } catch {
    return null;
  }
}

export async function checkForUpdate(): Promise<void> {
  try {
    const cache = await readCache();
    const now = Date.now();

    let latestVersion: string | null = null;

    if (cache && now - cache.lastCheck < CHECK_INTERVAL_MS) {
      latestVersion = cache.latestVersion;
    } else {
      latestVersion = await fetchLatestVersion();
      if (latestVersion) {
        await writeCache({ lastCheck: now, latestVersion });
      }
    }

    if (!latestVersion) return;

    if (compareVersions(PKG_VERSION, latestVersion) < 0) {
      const msg = [
        "",
        chalk.yellow(`  ⬆ アップデートがあります: ${chalk.dim(PKG_VERSION)} → ${chalk.green(latestVersion)}`),
        chalk.dim(`    実行: ${chalk.cyan("wellgrow update")}  または  ${chalk.cyan("npm i -g @wellgrow/cli")}`),
        "",
      ].join("\n");
      process.stderr.write(msg);
    }
  } catch {
    // silently ignore
  }
}

export async function getUpdateInfo(): Promise<{
  current: string;
  latest: string | null;
  updateAvailable: boolean;
}> {
  const latest = await fetchLatestVersion();
  return {
    current: PKG_VERSION,
    latest,
    updateAvailable: latest !== null && compareVersions(PKG_VERSION, latest) < 0,
  };
}
