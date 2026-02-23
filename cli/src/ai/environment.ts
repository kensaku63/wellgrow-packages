import { execFile } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir, platform, release, arch } from "node:os";

const WELLGROW_HOME = join(homedir(), ".wellgrow");
const CACHE_PATH = join(WELLGROW_HOME, ".environment-cache.json");
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const PACKAGE_MANAGERS = ["pnpm", "npm", "yarn", "bun"] as const;

const CLI_TOOLS = [
  "git", "gh",
  "python3", "uv", "deno", "bun",
  "jq", "yq", "fd", "rg", "xh", "delta",
  "claude", "codex", "gemini", "openclaw",
  "supabase", "vercel",
  "bird", "oracle", "gogcli", "obsidian-cli",
] as const;

// ----- Types -----

interface ToolInfo {
  name: string;
  version: string | null;
}

interface EnvironmentCache {
  version: 1;
  created_at: string;
  os: {
    platform: string;
    release: string;
    arch: string;
    is_wsl: boolean;
  };
  shell: string;
  node_version: string | null;
  package_managers: ToolInfo[];
  cli_tools: ToolInfo[];
}

// ----- Shell helpers -----

function execAsync(
  cmd: string,
  args: string[],
  timeoutMs = 3000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(cmd, args, { timeout: timeoutMs }, (err, stdout) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(stdout.trim());
    });
    child.stdin?.end();
  });
}

function extractVersion(output: string): string | null {
  const match = output.split("\n")[0]?.match(/(\d+\.\d+(?:\.\d+)?)/);
  return match?.[1] ?? null;
}

export async function detectTool(name: string): Promise<ToolInfo | null> {
  try {
    await execAsync("which", [name]);
  } catch {
    return null;
  }

  try {
    const output = await execAsync(name, ["--version"]);
    return { name, version: extractVersion(output) };
  } catch {
    return { name, version: null };
  }
}

// ----- WSL detection -----

async function detectWsl(): Promise<boolean> {
  try {
    const content = await readFile("/proc/version", "utf-8");
    return /microsoft/i.test(content);
  } catch {
    return false;
  }
}

// ----- Cache -----

async function loadCache(): Promise<EnvironmentCache | null> {
  try {
    const raw = await readFile(CACHE_PATH, "utf-8");
    const data = JSON.parse(raw) as EnvironmentCache;
    if (data.version !== 1) return null;

    const age = Date.now() - new Date(data.created_at).getTime();
    if (age > CACHE_TTL_MS) return null;

    return data;
  } catch {
    return null;
  }
}

async function saveCache(cache: EnvironmentCache): Promise<void> {
  try {
    await mkdir(WELLGROW_HOME, { recursive: true });
    await writeFile(CACHE_PATH, JSON.stringify(cache, null, 2));
  } catch {
    // best-effort
  }
}

// ----- Static detection (cacheable) -----

async function detectStaticEnvironment(): Promise<EnvironmentCache> {
  const cached = await loadCache();
  if (cached) return cached;

  const [isWsl, nodeVersion, ...toolResults] = await Promise.all([
    detectWsl(),
    execAsync("node", ["--version"]).then(extractVersion).catch(() => null),
    ...PACKAGE_MANAGERS.map(detectTool),
    ...CLI_TOOLS.map(detectTool),
  ]);

  const pmResults = toolResults.slice(0, PACKAGE_MANAGERS.length);
  const cliResults = toolResults.slice(PACKAGE_MANAGERS.length);

  const cache: EnvironmentCache = {
    version: 1,
    created_at: new Date().toISOString(),
    os: {
      platform: platform(),
      release: release(),
      arch: arch(),
      is_wsl: isWsl,
    },
    shell: process.env.SHELL ?? "unknown",
    node_version: nodeVersion,
    package_managers: pmResults.filter((t): t is ToolInfo => t !== null),
    cli_tools: cliResults.filter((t): t is ToolInfo => t !== null),
  };

  await saveCache(cache);
  return cache;
}

// ----- Dynamic detection (per session) -----

interface GitInfo {
  branch: string;
  modifiedCount: number;
}

async function detectGit(): Promise<GitInfo | null> {
  try {
    const branch = await execAsync("git", [
      "branch",
      "--show-current",
    ]);
    const status = await execAsync("git", ["status", "--short"]);
    const modifiedCount = status
      ? status.split("\n").filter((l) => l.trim()).length
      : 0;
    return { branch: branch || "HEAD (detached)", modifiedCount };
  } catch {
    return null;
  }
}

// ----- Formatting -----

function formatToolList(tools: ToolInfo[]): string {
  return tools
    .map((t) => (t.version ? `${t.name} ${t.version}` : t.name))
    .join(", ");
}

function formatEnvironment(
  cache: EnvironmentCache,
  git: GitInfo | null,
): string {
  const lines: string[] = [];

  // OS
  let osLine = `${cache.os.platform} ${cache.os.release} (${cache.os.arch}`;
  if (cache.os.is_wsl) osLine += ", WSL";
  osLine += ")";
  lines.push(`OS: ${osLine}`);

  // Shell
  lines.push(`Shell: ${cache.shell}`);

  // CWD
  lines.push(`CWD: ${process.cwd()}`);

  // Git
  if (git) {
    const suffix =
      git.modifiedCount > 0 ? ` (${git.modifiedCount} files modified)` : "";
    lines.push(`Git: ${git.branch}${suffix}`);
  } else {
    lines.push("Git: (not a git repository)");
  }

  // Node
  if (cache.node_version) {
    lines.push(`Node: v${cache.node_version}`);
  }

  // Package Managers
  if (cache.package_managers.length > 0) {
    lines.push(`Package Manager: ${formatToolList(cache.package_managers)}`);
  }

  // CLI Tools
  if (cache.cli_tools.length > 0) {
    lines.push(`CLI: ${formatToolList(cache.cli_tools)}`);
  }

  return lines.join("\n");
}

// ----- Public API -----

export async function detectEnvironment(): Promise<string> {
  const [cache, git] = await Promise.all([
    detectStaticEnvironment(),
    detectGit(),
  ]);

  return formatEnvironment(cache, git);
}
