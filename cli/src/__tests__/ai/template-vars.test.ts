import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { expandTemplate } from "../../ai/template-vars.js";
import { createTempWorkspace, type TempWorkspace } from "../helpers/temp-workspace.js";
import type { WellGrowConfig } from "../../config/types.js";

const mockHome = vi.hoisted(() => {
  let dir = "/tmp/test-home";
  return { get: () => dir, set: (d: string) => { dir = d; } };
});

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return {
    ...actual,
    homedir: () => mockHome.get(),
    platform: actual.platform,
    release: actual.release,
  };
});

let testHome: TempWorkspace;

const baseConfig: WellGrowConfig = {
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

beforeEach(async () => {
  testHome = await createTempWorkspace();
  mockHome.set(testHome.dir);
  vi.resetModules();
});

afterEach(async () => {
  await testHome.cleanup();
});

describe("expandTemplate", () => {
  it("replaces known variables", () => {
    const result = expandTemplate("Hello {{USER_NAME}}!", {
      USER_NAME: "太郎",
    });
    expect(result).toBe("Hello 太郎!");
  });

  it("leaves unknown variables as-is", () => {
    const result = expandTemplate("Hello {{UNKNOWN}}!", {});
    expect(result).toBe("Hello {{UNKNOWN}}!");
  });

  it("replaces multiple variables", () => {
    const result = expandTemplate("{{A}} and {{B}}", { A: "x", B: "y" });
    expect(result).toBe("x and y");
  });

  it("handles empty template", () => {
    expect(expandTemplate("", { X: "y" })).toBe("");
  });

  it("handles template with no placeholders", () => {
    expect(expandTemplate("plain text", { X: "y" })).toBe("plain text");
  });

  it("replaces same variable multiple times", () => {
    const result = expandTemplate("{{A}} {{A}}", { A: "x" });
    expect(result).toBe("x x");
  });
});

describe("buildTemplateVars", () => {
  it("includes essential variables", async () => {
    const { buildTemplateVars } = await import("../../ai/template-vars.js");
    const vars = await buildTemplateVars({
      agentName: "test-agent",
      agentDir: "/tmp/agents/test-agent",
      config: baseConfig,
    });

    expect(vars.AGENT_NAME).toBe("test-agent");
    expect(vars.AGENT_DIR).toBe("/tmp/agents/test-agent");
    expect(vars.CURRENT_DATE).toMatch(/^\d{4}-\d{2}-\d{2}/);
    expect(vars.CURRENT_DATETIME).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(vars.DAY_OF_WEEK).toMatch(/曜日$/);
    expect(vars.OS).toBeDefined();
    expect(vars.CWD).toBeDefined();
    expect(vars.HOME).toBeDefined();
  });

  it("includes USER_NAME when set in config", async () => {
    const { buildTemplateVars } = await import("../../ai/template-vars.js");
    const config = {
      ...baseConfig,
      user: { name: "テスト太郎" },
    };
    const vars = await buildTemplateVars({
      agentName: "test",
      agentDir: "/tmp",
      config,
    });
    expect(vars.USER_NAME).toBe("テスト太郎");
  });

  it("omits USER_NAME when not set in config", async () => {
    const { buildTemplateVars } = await import("../../ai/template-vars.js");
    const vars = await buildTemplateVars({
      agentName: "test",
      agentDir: "/tmp",
      config: baseConfig,
    });
    expect(vars.USER_NAME).toBeUndefined();
  });

  it("includes ENVIRONMENT when provided", async () => {
    const { buildTemplateVars } = await import("../../ai/template-vars.js");
    const vars = await buildTemplateVars({
      agentName: "test",
      agentDir: "/tmp",
      config: baseConfig,
      environment: "Node.js v22, Git 2.40",
    });
    expect(vars.ENVIRONMENT).toBe("Node.js v22, Git 2.40");
  });

  it("includes WELLGROW_MANUAL when manual files exist", async () => {
    const manualDir = `${testHome.dir}/.wellgrow/manual`;
    await mkdir(manualDir, { recursive: true });
    await writeFile(`${manualDir}/guide.md`, "# Guide", "utf-8");

    const { buildTemplateVars } = await import("../../ai/template-vars.js");
    const vars = await buildTemplateVars({
      agentName: "test",
      agentDir: "/tmp",
      config: baseConfig,
    });
    expect(vars.WELLGROW_MANUAL).toContain("guide.md");
  });
});
