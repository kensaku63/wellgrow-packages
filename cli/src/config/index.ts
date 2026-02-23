import { readFile, writeFile, mkdir, appendFile, access } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { parse, stringify } from "smol-toml";
import { wellGrowConfigSchema, type WellGrowConfig } from "./types.js";

export interface OnboardingResult {
  name: string;
  apiKey: string | null;
}

const CONFIG_DIR = join(homedir(), ".wellgrow");
const CONFIG_PATH = join(CONFIG_DIR, "config.toml");

export class ConfigLoadError extends Error {
  readonly cause: unknown;

  constructor(message: string, cause: unknown) {
    super(message);
    this.name = "ConfigLoadError";
    this.cause = cause;
  }
}

const DEFAULT_CONFIG: WellGrowConfig = {
  default: {
    model: "claude-opus-4-6",
    provider: "anthropic",
    agent: "joy",
    mode: "auto",
    max_turns: 100,
    max_output_tokens: 16384,
  },
  permissions: {
    allowed_mcps: [],
  },
  providers: {
    anthropic: { api_key_env: "ANTHROPIC_API_KEY" },
    google: { api_key_env: "GOOGLE_GENERATIVE_AI_API_KEY" },
    openai: { api_key_env: "OPENAI_API_KEY" },
  },
  api: {
    max_retries: 2,
    timeout: 600000,
  },
  skills: {
    paths: [],
  },
  mcp: {
    paths: [],
  },
  hooks: {
    paths: [],
  },
  logging: {
    verbose: false,
    log_dir: "~/.wellgrow/logs",
  },
  history: {
    storage: "local",
    max_sessions: 1000,
  },
};

export async function loadConfig(): Promise<WellGrowConfig> {
  let content: string;
  try {
    content = await readFile(CONFIG_PATH, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return DEFAULT_CONFIG;
    }
    throw new ConfigLoadError(
      `設定ファイルを読み込めませんでした: ${CONFIG_PATH}`,
      error,
    );
  }

  let parsed: unknown;
  try {
    parsed = parse(content);
  } catch (error) {
    throw new ConfigLoadError(
      `設定ファイルの TOML 形式が不正です: ${CONFIG_PATH}`,
      error,
    );
  }

  try {
    const merged = deepMerge(DEFAULT_CONFIG, parsed as Partial<WellGrowConfig>);
    return wellGrowConfigSchema.parse(merged);
  } catch (error) {
    throw new ConfigLoadError(
      `設定ファイルの内容が不正です: ${CONFIG_PATH}`,
      error,
    );
  }
}

export async function ensureConfigDir(): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
}

export async function initConfig(): Promise<void> {
  await ensureConfigDir();
  try {
    await readFile(CONFIG_PATH, "utf-8");
  } catch {
    await writeFile(CONFIG_PATH, stringify(DEFAULT_CONFIG as unknown as Record<string, unknown>), "utf-8");
  }

  const { autoInitIfNeeded } = await import("../commands/init.js");
  await autoInitIfNeeded();
}

export function getConfigDir(): string {
  return CONFIG_DIR;
}

export async function isFirstRun(): Promise<boolean> {
  try {
    await access(CONFIG_PATH);
    return false;
  } catch {
    return true;
  }
}

export async function saveOnboardingResult(result: OnboardingResult): Promise<void> {
  const config = { ...DEFAULT_CONFIG, user: { name: result.name } };
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_PATH, stringify(config as unknown as Record<string, unknown>), "utf-8");

  if (result.apiKey) {
    process.env.ANTHROPIC_API_KEY = result.apiKey;
    const rcFile = process.env.SHELL?.includes("zsh")
      ? join(homedir(), ".zshrc")
      : join(homedir(), ".bashrc");
    await appendFile(rcFile, `\nexport ANTHROPIC_API_KEY="${result.apiKey}"\n`, "utf-8");
  }
}

export async function updateConfigField(
  section: string,
  key: string,
  value: unknown,
): Promise<void> {
  const content = await readFile(CONFIG_PATH, "utf-8");
  const parsed = parse(content) as Record<string, unknown>;
  const sectionObj = (parsed[section] ?? {}) as Record<string, unknown>;
  sectionObj[key] = value;
  parsed[section] = sectionObj;
  await writeFile(CONFIG_PATH, stringify(parsed), "utf-8");
}

export async function addAllowedMcp(serverName: string): Promise<void> {
  const config = await loadConfig();
  if (config.permissions.allowed_mcps.includes(serverName)) return;
  const updated = [...config.permissions.allowed_mcps, serverName];
  await updateConfigField("permissions", "allowed_mcps", updated);
}

function deepMerge<T>(base: T, override: Partial<T>): T {
  const result = { ...base } as Record<string, unknown>;
  const src = override as Record<string, unknown>;
  for (const key of Object.keys(src)) {
    const val = src[key];
    if (val && typeof val === "object" && !Array.isArray(val) && typeof result[key] === "object") {
      result[key] = deepMerge(
        result[key] as Record<string, unknown>,
        val as Record<string, unknown>,
      );
    } else if (val !== undefined) {
      result[key] = val;
    }
  }
  return result as T;
}
