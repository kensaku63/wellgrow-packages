import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { parse } from "smol-toml";
import { agentConfigSchema, type AgentConfig, type AgentSummary } from "./types.js";

const AGENTS_DIR = join(homedir(), ".wellgrow", "agents");

export function getAgentsDir(): string {
  return AGENTS_DIR;
}

export function getAgentDir(agentName: string): string {
  return join(AGENTS_DIR, agentName);
}

export async function loadAgentConfig(agentName: string): Promise<AgentConfig> {
  const tomlPath = join(AGENTS_DIR, agentName, "agent.toml");
  const raw = await readFile(tomlPath, "utf-8");
  const parsed = parse(raw);
  return agentConfigSchema.parse(parsed);
}

export async function loadAgentPrompt(agentName: string): Promise<string | null> {
  const promptPath = join(AGENTS_DIR, agentName, "system-prompt.md");
  try {
    const content = await readFile(promptPath, "utf-8");
    return content.trim() || null;
  } catch {
    process.stderr.write(
      `⚠ ${agentName}: system-prompt.md が見つかりません。エージェントの動作を定義するために作成を推奨します。\n`,
    );
    return null;
  }
}

export async function listAgents(): Promise<AgentSummary[]> {
  let entries: string[];
  try {
    entries = await readdir(AGENTS_DIR);
  } catch {
    return [];
  }

  const agents: AgentSummary[] = [];

  for (const entry of entries) {
    try {
      const config = await loadAgentConfig(entry);
      agents.push({
        id: entry,
        name: config.agent.name,
        description: config.agent.description,
        icon: config.agent.icon,
      });
    } catch {
      // skip invalid agent directories
    }
  }

  return agents;
}
