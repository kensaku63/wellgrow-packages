import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { WellGrowConfig } from "../../config/types.js";

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: vi.fn(() => (modelId: string) => ({
    modelId,
    provider: "anthropic",
  })),
}));

vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: vi.fn(() => (modelId: string) => ({
    modelId,
    provider: "google",
  })),
}));

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: vi.fn(() => (modelId: string) => ({
    modelId,
    provider: "openai",
  })),
}));

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

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getModel", () => {
  it("creates Anthropic model for claude- prefix", async () => {
    const { createAnthropic } = await import("@ai-sdk/anthropic");
    const { getModel } = await import("../../ai/providers.js");

    const model = getModel("claude-opus-4-6", baseConfig) as unknown as {
      modelId: string;
      provider: string;
    };
    expect(createAnthropic).toHaveBeenCalled();
    expect(model.modelId).toBe("claude-opus-4-6");
  });

  it("creates Google model for gemini- prefix", async () => {
    const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
    const { getModel } = await import("../../ai/providers.js");

    const model = getModel("gemini-3.1-pro-preview", baseConfig) as unknown as {
      modelId: string;
    };
    expect(createGoogleGenerativeAI).toHaveBeenCalled();
    expect(model.modelId).toBe("gemini-3.1-pro-preview");
  });

  it("creates OpenAI model for gpt- prefix", async () => {
    const { createOpenAI } = await import("@ai-sdk/openai");
    const { getModel } = await import("../../ai/providers.js");

    const model = getModel("gpt-5.2", baseConfig) as unknown as {
      modelId: string;
    };
    expect(createOpenAI).toHaveBeenCalled();
    expect(model.modelId).toBe("gpt-5.2");
  });

  it("creates OpenAI model for o1- prefix", async () => {
    const { getModel } = await import("../../ai/providers.js");
    const model = getModel("o1-preview", baseConfig) as unknown as {
      modelId: string;
    };
    expect(model.modelId).toBe("o1-preview");
  });

  it("creates OpenAI model for o3- prefix", async () => {
    const { getModel } = await import("../../ai/providers.js");
    const model = getModel("o3-mini", baseConfig) as unknown as {
      modelId: string;
    };
    expect(model.modelId).toBe("o3-mini");
  });

  it("throws for unknown model prefix", async () => {
    const { getModel } = await import("../../ai/providers.js");
    expect(() => getModel("llama-3", baseConfig)).toThrow("不明なモデル");
  });

  it("uses OAuth token header for sk-ant-oat01- keys", async () => {
    const { createAnthropic } = await import("@ai-sdk/anthropic");
    const { getModel } = await import("../../ai/providers.js");

    const config = {
      ...baseConfig,
      providers: {
        ...baseConfig.providers,
        anthropic: { api_key: "sk-ant-oat01-test-key", api_key_env: "ANTHROPIC_API_KEY" },
      },
    };

    getModel("claude-opus-4-6", config);

    expect(createAnthropic).toHaveBeenCalledWith(
      expect.objectContaining({ authToken: "sk-ant-oat01-test-key" }),
    );
  });

  it("uses regular apiKey for non-OAuth keys", async () => {
    const { createAnthropic } = await import("@ai-sdk/anthropic");
    const { getModel } = await import("../../ai/providers.js");

    const config = {
      ...baseConfig,
      providers: {
        ...baseConfig.providers,
        anthropic: { api_key: "sk-ant-regular-key", api_key_env: "ANTHROPIC_API_KEY" },
      },
    };

    getModel("claude-opus-4-6", config);

    expect(createAnthropic).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "sk-ant-regular-key" }),
    );
  });
});

describe("getModelDisplayName", () => {
  it("returns model ID as display name", async () => {
    const { getModelDisplayName } = await import("../../ai/providers.js");
    expect(getModelDisplayName("claude-opus-4-6")).toBe("claude-opus-4-6");
  });
});

describe("MODEL_LIST", () => {
  it("contains expected models", async () => {
    const { MODEL_LIST } = await import("../../ai/providers.js");
    expect(MODEL_LIST.length).toBeGreaterThan(0);
    const ids = MODEL_LIST.map((m) => m.id);
    expect(ids).toContain("claude-opus-4-6");
    expect(ids).toContain("claude-sonnet-4-6");
  });
});
