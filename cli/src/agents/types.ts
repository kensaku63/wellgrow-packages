import { z } from "zod";

export const agentConfigSchema = z.object({
  agent: z.object({
    name: z.string(),
    description: z.string(),
    icon: z.string().optional().default("🤖"),
    model: z.string().optional(),
    mode: z.enum(["plan", "auto"]).optional(),
    max_turns: z.number().int().positive().optional(),
  }),
  tools: z
    .object({
      builtin: z.array(z.string()).optional(),
    })
    .optional(),
  mcp: z
    .object({
      paths: z.array(z.string()).optional(),
    })
    .optional(),
  skills: z
    .object({
      paths: z.array(z.string()).optional(),
    })
    .optional(),
  hooks: z
    .object({
      paths: z.array(z.string()).optional(),
    })
    .optional(),
});

export type AgentConfig = z.infer<typeof agentConfigSchema>;

export interface AgentSummary {
  id: string;
  name: string;
  description: string;
  icon: string;
}
