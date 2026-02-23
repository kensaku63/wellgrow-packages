import { join } from "node:path";
import type { LanguageModel } from "ai";
import { loadAgentConfig, getAgentDir } from "./loader.js";
import type { AgentConfig } from "./types.js";
import { buildTemplateVars } from "../ai/template-vars.js";
import { detectEnvironment } from "../ai/environment.js";
import { buildSystemPrompt } from "../ai/system-prompt.js";
import { createToolRegistryBuilder, type ToolRegistry } from "../tools/registry.js";
import { builtinTools } from "../tools/index.js";
import { createToolPipeline, type ToolPipeline, type Mode } from "../tools/pipeline.js";
import { getModel } from "../ai/providers.js";
import { loadConfig } from "../config/index.js";
import type { WellGrowConfig } from "../config/types.js";
import type { SessionContext } from "../core/context.js";
import {
  McpManager,
  loadGlobalMcpConfig,
  type McpConnectionResult,
} from "../extensions/mcp.js";
import { discoverSkills } from "../extensions/skills.js";
import { HookEngine, loadHooksConfig } from "../extensions/hook-engine.js";

export interface ResolvedAgent {
  name: string;
  icon: string;
  description: string;
  model: LanguageModel;
  modelId: string;
  systemPrompt: string;
  registry: ToolRegistry;
  pipeline: ToolPipeline;
  mcpManager: McpManager | null;
  hookEngine: HookEngine | null;
  maxTurns: number;
}

export interface ResolveAgentOptions {
  agentName: string;
  modelOverride?: string;
  modeOverride?: Mode;
  config?: WellGrowConfig;
  onMcpConnection?: (result: McpConnectionResult) => void;
}

export async function resolveAgent(
  options: ResolveAgentOptions,
  sessionCtx: SessionContext,
): Promise<ResolvedAgent> {
  const config = options.config ?? await loadConfig();

  let agentConfig: AgentConfig;
  try {
    agentConfig = await loadAgentConfig(options.agentName);
  } catch {
    agentConfig = {
      agent: {
        name: options.agentName,
        description: "",
        icon: "🤖",
      },
    };
  }

  const modelId = options.modelOverride ?? agentConfig.agent.model ?? config.default.model;
  const mode: Mode = options.modeOverride ?? agentConfig.agent.mode ?? config.default.mode;
  const maxTurns = agentConfig.agent.max_turns ?? config.default.max_turns;

  const model = getModel(modelId, config);
  const agentDir = getAgentDir(options.agentName);

  const environment = await detectEnvironment();

  const templateVars = await buildTemplateVars({
    agentName: agentConfig.agent.name,
    agentDir,
    config,
    environment,
  });

  const skillPaths = [
    join(agentDir, "skills"),
    ...config.skills.paths,
    ...(agentConfig.skills?.paths ?? []),
  ];
  const skills = await discoverSkills(skillPaths);

  const systemPrompt = await buildSystemPrompt({
    agentName: options.agentName,
    templateVars,
    skills,
  });

  // --- Build tool registry ---
  const builder = createToolRegistryBuilder(sessionCtx).addBuiltinTools(builtinTools);

  if (agentConfig.tools?.builtin) {
    builder.filterBuiltins(agentConfig.tools.builtin);
  }

  // --- MCP ---
  let mcpManager: McpManager | null = null;

  const mcpPaths = [
    ...config.mcp.paths,
    ...(agentConfig.mcp?.paths ?? []),
  ];
  const mcpConfig = await loadGlobalMcpConfig(mcpPaths);
  const serverCount = Object.keys(mcpConfig.mcpServers).length;

  const mcpFailures: string[] = [];

  if (serverCount > 0) {
    mcpManager = new McpManager();
    const connectionResults = await mcpManager.connectAll(mcpConfig.mcpServers, options.onMcpConnection);

    for (const r of connectionResults) {
      if (!r.success) {
        mcpFailures.push(`${r.name}: 接続失敗 (${r.error})`);
      }
    }

    const { toolSets, errors: toolErrors } = await mcpManager.getAllToolSets();
    for (const [serverName, toolSet] of toolSets) {
      builder.addMcpTools(toolSet, serverName);
    }
    for (const e of toolErrors) {
      mcpFailures.push(`${e.name}: ${e.error}`);
    }

    sessionCtx.mcpManager = mcpManager;
  }

  const registry = builder.build();

  const pipeline = createToolPipeline({
    mode,
    allowedMcps: config.permissions.allowed_mcps,
  });

  // --- Hooks ---
  const hookPaths = [
    ...config.hooks.paths,
    ...(agentConfig.hooks?.paths ?? []),
  ];
  const hooksConfig = await loadHooksConfig(hookPaths);

  let hookEngine: HookEngine | null = null;
  if (Object.keys(hooksConfig.hooks).length > 0) {
    hookEngine = new HookEngine(hooksConfig, {
      sessionId: sessionCtx.sessionId,
      cwd: sessionCtx.cwd,
      config,
    });
  }

  let finalSystemPrompt = systemPrompt;
  if (mcpFailures.length > 0) {
    finalSystemPrompt += `\n\n<mcp_status>\n以下の MCP サーバーは利用できません。これらのツールは使用しないでください:\n${mcpFailures.map((f) => `- ${f}`).join("\n")}\n</mcp_status>`;
  }

  return {
    name: agentConfig.agent.name,
    icon: agentConfig.agent.icon,
    description: agentConfig.agent.description,
    model,
    modelId,
    systemPrompt: finalSystemPrompt,
    registry,
    pipeline,
    mcpManager,
    hookEngine,
    maxTurns,
  };
}
