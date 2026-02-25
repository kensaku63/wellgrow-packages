import { readFile, readdir } from "node:fs/promises";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import matter from "gray-matter";
import {
  commandFrontmatterSchema,
  type CommandDefinition,
} from "./types.js";

const WELLGROW_HOME = join(homedir(), ".wellgrow");
const COMMANDS_DIR = join(WELLGROW_HOME, "commands");

export function getCommandsDir(): string {
  return COMMANDS_DIR;
}

export async function discoverCommands(): Promise<CommandDefinition[]> {
  let entries: string[];
  try {
    entries = await readdir(COMMANDS_DIR);
  } catch {
    return [];
  }

  const commands: CommandDefinition[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".md")) continue;
    const cmd = await loadCommandFile(join(COMMANDS_DIR, entry));
    if (cmd) commands.push(cmd);
  }

  return commands.sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadCommand(
  name: string,
): Promise<CommandDefinition | null> {
  const filePath = join(COMMANDS_DIR, `${name}.md`);
  return loadCommandFile(filePath);
}

async function loadCommandFile(
  filePath: string,
): Promise<CommandDefinition | null> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch {
    return null;
  }

  return parseCommandFile(raw, filePath);
}

export function parseCommandFile(
  raw: string,
  filePath: string,
): CommandDefinition | null {
  const { data, content } = matter(raw);

  const parsed = commandFrontmatterSchema.safeParse(data);
  if (!parsed.success) return null;

  const name = basename(filePath, ".md");

  return {
    name,
    description: parsed.data.description,
    args: parsed.data.args,
    template: content.trim(),
  };
}

const ARG_PATTERN = /\$\{\{(\w+):([^}]*)\}\}|\$(\w+)/g;

export function resolvePrompt(
  command: CommandDefinition,
  positionalArgs: string[],
): { prompt: string; errors: string[] } {
  const errors: string[] = [];

  const argMap = new Map<string, string>();
  for (let i = 0; i < command.args.length; i++) {
    const arg = command.args[i];
    if (i < positionalArgs.length) {
      argMap.set(arg.name, positionalArgs[i]);
    }
  }

  // Extra positional args beyond defined args are appended to the last arg
  if (
    positionalArgs.length > command.args.length &&
    command.args.length > 0
  ) {
    const lastArg = command.args[command.args.length - 1];
    const existing = argMap.get(lastArg.name) ?? "";
    const extras = positionalArgs.slice(command.args.length);
    argMap.set(lastArg.name, [existing, ...extras].join(" "));
  }

  for (const arg of command.args) {
    if (arg.required && !argMap.has(arg.name)) {
      errors.push(`必須引数 "${arg.name}" が不足しています`);
    }
  }

  if (errors.length > 0) {
    return { prompt: "", errors };
  }

  const prompt = command.template.replace(
    ARG_PATTERN,
    (match, nameWithDefault?: string, defaultValue?: string, simpleName?: string) => {
      if (nameWithDefault) {
        return argMap.get(nameWithDefault) ?? defaultValue ?? "";
      }
      if (simpleName) {
        return argMap.get(simpleName) ?? match;
      }
      return match;
    },
  );

  return { prompt, errors: [] };
}
