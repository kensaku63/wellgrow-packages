import { z } from "zod";

const providerConfigSchema = z.object({
  api_key: z.string().optional(),
  api_key_env: z.string(),
});

export const wellGrowConfigSchema = z.object({
  default: z.object({
    model: z.string(),
    provider: z.string(),
    agent: z.string(),
    mode: z.enum(["plan", "auto"]),
    max_turns: z.number().int().positive(),
    max_output_tokens: z.number().int().positive(),
  }),
  permissions: z.object({
    allowed_mcps: z.array(z.string()),
  }),
  providers: z.object({
    anthropic: providerConfigSchema.optional(),
    google: providerConfigSchema.optional(),
    openai: providerConfigSchema.optional(),
  }),
  api: z.object({
    max_retries: z.number().int().nonnegative(),
    timeout: z.number().int().positive(),
  }),
  skills: z.object({
    paths: z.array(z.string()),
  }),
  mcp: z.object({
    paths: z.array(z.string()),
  }),
  hooks: z.object({
    paths: z.array(z.string()),
  }),
  user: z.object({
    name: z.string().optional(),
  }).optional(),
  logging: z.object({
    verbose: z.boolean(),
    log_dir: z.string(),
  }),
  history: z.object({
    storage: z.string(),
    max_sessions: z.number().int().positive(),
  }),
});

export type WellGrowConfig = z.infer<typeof wellGrowConfigSchema>;
