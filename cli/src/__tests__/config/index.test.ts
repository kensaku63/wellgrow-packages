import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createTempWorkspace, type TempWorkspace } from "../helpers/temp-workspace.js";

const mockHome = vi.hoisted(() => {
  let dir = "/tmp/test-home";
  return { get: () => dir, set: (d: string) => { dir = d; } };
});

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, homedir: () => mockHome.get() };
});

const CONFIG_FILENAME = "config.toml";

let testHome: TempWorkspace;

beforeEach(async () => {
  testHome = await createTempWorkspace();
  mockHome.set(testHome.dir);
  vi.resetModules();
});

afterEach(async () => {
  await testHome.cleanup();
});

async function freshImport() {
  return await import("../../config/index.js");
}

describe("loadConfig", () => {
  it("returns default config when file does not exist", async () => {
    const { loadConfig } = await freshImport();
    const config = await loadConfig();
    expect(config.default.model).toBe("claude-opus-4-6");
    expect(config.default.mode).toBe("auto");
    expect(config.permissions.allowed_mcps).toEqual([]);
  });

  it("merges partial TOML with defaults", async () => {
    const toml = `
[default]
model = "gemini-3.1-pro-preview"

[user]
name = "テスト太郎"
`;
    const configDir = join(testHome.dir, ".wellgrow");
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, CONFIG_FILENAME), toml, "utf-8");

    const { loadConfig } = await freshImport();
    const config = await loadConfig();
    expect(config.default.model).toBe("gemini-3.1-pro-preview");
    expect(config.default.mode).toBe("auto");
    expect(config.user?.name).toBe("テスト太郎");
  });

  it("throws ConfigLoadError on invalid TOML syntax", async () => {
    const configDir = join(testHome.dir, ".wellgrow");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      join(configDir, CONFIG_FILENAME),
      "[[[[invalid toml",
      "utf-8",
    );

    const { loadConfig, ConfigLoadError } = await freshImport();
    await expect(loadConfig()).rejects.toThrow(ConfigLoadError);
  });

  it("throws ConfigLoadError on schema validation failure", async () => {
    const toml = `
[default]
mode = "invalid_mode"
`;
    const configDir = join(testHome.dir, ".wellgrow");
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, CONFIG_FILENAME), toml, "utf-8");

    const { loadConfig, ConfigLoadError } = await freshImport();
    await expect(loadConfig()).rejects.toThrow(ConfigLoadError);
  });
});

describe("isFirstRun", () => {
  it("returns true when config file does not exist", async () => {
    const { isFirstRun } = await freshImport();
    expect(await isFirstRun()).toBe(true);
  });

  it("returns false when config file exists", async () => {
    const configDir = join(testHome.dir, ".wellgrow");
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, CONFIG_FILENAME), "", "utf-8");

    const { isFirstRun } = await freshImport();
    expect(await isFirstRun()).toBe(false);
  });
});

describe("updateConfigField", () => {
  it("updates a field in existing config", async () => {
    const configDir = join(testHome.dir, ".wellgrow");
    await mkdir(configDir, { recursive: true });
    const toml = `[default]\nmodel = "claude-opus-4-6"\nmode = "auto"\nprovider = "anthropic"\nagent = "joy"\nmax_turns = 100\nmax_output_tokens = 16384\n`;
    await writeFile(join(configDir, CONFIG_FILENAME), toml, "utf-8");

    const { updateConfigField } = await freshImport();
    await updateConfigField("default", "model", "gemini-3.1-pro-preview");

    const updated = await readFile(join(configDir, CONFIG_FILENAME), "utf-8");
    expect(updated).toContain("gemini-3.1-pro-preview");
  });

  it("creates section if it does not exist", async () => {
    const configDir = join(testHome.dir, ".wellgrow");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      join(configDir, CONFIG_FILENAME),
      '[default]\nmodel = "x"\nmode = "auto"\nprovider = "anthropic"\nagent = "joy"\nmax_turns = 100\nmax_output_tokens = 16384\n',
      "utf-8",
    );

    const { updateConfigField } = await freshImport();
    await updateConfigField("user", "name", "太郎");

    const updated = await readFile(join(configDir, CONFIG_FILENAME), "utf-8");
    expect(updated).toContain("[user]");
  });
});

describe("addAllowedMcp", () => {
  it("adds server name to allowed list", async () => {
    const configDir = join(testHome.dir, ".wellgrow");
    await mkdir(configDir, { recursive: true });

    const { stringify } = await import("smol-toml");
    const defaultConfig = {
      default: {
        model: "claude-opus-4-6",
        provider: "anthropic",
        agent: "joy",
        mode: "auto",
        max_turns: 100,
        max_output_tokens: 16384,
      },
      permissions: { allowed_mcps: [] },
      providers: {
        anthropic: { api_key_env: "ANTHROPIC_API_KEY" },
        google: { api_key_env: "GOOGLE_GENERATIVE_AI_API_KEY" },
        openai: { api_key_env: "OPENAI_API_KEY" },
      },
      api: { max_retries: 2, timeout: 600000 },
      skills: { paths: [] },
      mcp: { paths: [] },
      hooks: { paths: [] },
      logging: { verbose: false, log_dir: "~/.wellgrow/logs" },
      history: { storage: "local", max_sessions: 1000 },
    };
    await writeFile(join(configDir, CONFIG_FILENAME), stringify(defaultConfig), "utf-8");

    const { addAllowedMcp, loadConfig } = await freshImport();
    await addAllowedMcp("test-server");

    const config = await loadConfig();
    expect(config.permissions.allowed_mcps).toContain("test-server");
  });

  it("does not duplicate existing server name", async () => {
    const configDir = join(testHome.dir, ".wellgrow");
    await mkdir(configDir, { recursive: true });

    const { stringify } = await import("smol-toml");
    const cfg = {
      default: {
        model: "claude-opus-4-6",
        provider: "anthropic",
        agent: "joy",
        mode: "auto",
        max_turns: 100,
        max_output_tokens: 16384,
      },
      permissions: { allowed_mcps: ["existing"] },
      providers: {
        anthropic: { api_key_env: "ANTHROPIC_API_KEY" },
        google: { api_key_env: "GOOGLE_GENERATIVE_AI_API_KEY" },
        openai: { api_key_env: "OPENAI_API_KEY" },
      },
      api: { max_retries: 2, timeout: 600000 },
      skills: { paths: [] },
      mcp: { paths: [] },
      hooks: { paths: [] },
      logging: { verbose: false, log_dir: "~/.wellgrow/logs" },
      history: { storage: "local", max_sessions: 1000 },
    };
    await writeFile(join(configDir, CONFIG_FILENAME), stringify(cfg), "utf-8");

    const { addAllowedMcp, loadConfig } = await freshImport();
    await addAllowedMcp("existing");

    const config = await loadConfig();
    const count = config.permissions.allowed_mcps.filter(
      (n: string) => n === "existing",
    ).length;
    expect(count).toBe(1);
  });
});

describe("getConfigDir", () => {
  it("returns path under homedir", async () => {
    const { getConfigDir } = await freshImport();
    expect(getConfigDir()).toBe(join(testHome.dir, ".wellgrow"));
  });
});
