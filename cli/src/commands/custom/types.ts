import { z } from "zod";

export const commandArgSchema = z.object({
  name: z.string(),
  description: z.string().optional().default(""),
  required: z.boolean().optional().default(false),
});

export const commandFrontmatterSchema = z.object({
  description: z.string(),
  args: z.array(commandArgSchema).optional().default([]),
});

export type CommandArg = z.infer<typeof commandArgSchema>;

export interface CommandDefinition {
  name: string;
  description: string;
  args: CommandArg[];
  template: string;
}
