import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import type { WellGrowConfig } from "../config/types.js";

type Provider = "anthropic" | "google" | "openai";

export interface ModelEntry {
  id: string;
  label: string;
}

export const MODEL_LIST: ModelEntry[] = [
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6" },
  { id: "claude-opus-4-6", label: "Opus 4.6" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
  { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },
  { id: "gpt-5.2", label: "GPT-5.2" },
];

function inferProvider(modelId: string): Provider | null {
  if (modelId.startsWith("claude-")) return "anthropic";
  if (modelId.startsWith("gemini-")) return "google";
  if (modelId.startsWith("gpt-") || modelId.startsWith("o1-") || modelId.startsWith("o3-"))
    return "openai";
  return null;
}

function resolveApiKey(
  providerConfig: { api_key?: string; api_key_env: string } | undefined,
  defaultEnv: string,
): string | undefined {
  if (providerConfig?.api_key) return providerConfig.api_key;
  const envName = providerConfig?.api_key_env ?? defaultEnv;
  return process.env[envName];
}

export function getModel(
  modelId: string,
  config: WellGrowConfig,
): LanguageModel {
  const inferred = inferProvider(modelId);
  if (!inferred) {
    throw new Error(
      `不明なモデル: ${modelId}\n` +
      `利用可能なモデル形式: claude-*, gemini-*, gpt-*, o1-*, o3-*`,
    );
  }

  switch (inferred) {
    case "anthropic": {
      const key = resolveApiKey(config.providers?.anthropic, "ANTHROPIC_API_KEY");
      const isOAuth = key?.startsWith("sk-ant-oat01-");
      const anthropic = createAnthropic(
        isOAuth
          ? { authToken: key, headers: { "anthropic-beta": "oauth-2025-04-20" } }
          : { apiKey: key },
      );
      return anthropic(modelId);
    }
    case "google": {
      const apiKey = resolveApiKey(config.providers?.google, "GOOGLE_GENERATIVE_AI_API_KEY");
      const google = createGoogleGenerativeAI({ apiKey });
      return google(modelId);
    }
    case "openai": {
      const apiKey = resolveApiKey(config.providers?.openai, "OPENAI_API_KEY");
      const openai = createOpenAI({ apiKey });
      return openai(modelId);
    }
    default:
      throw new Error(`不明なプロバイダー: ${inferred satisfies never}`);
  }
}

export function getModelDisplayName(modelId: string): string {
  return modelId;
}
