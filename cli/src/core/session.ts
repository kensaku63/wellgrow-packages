import { type ModelMessage } from "ai";
import { runAgentLoop, type AgentLoopCallbacks } from "./agent-loop.js";
import { loadConfig } from "../config/index.js";
import { createSessionContext, createAgentContext, type SessionContext } from "./context.js";
import {
  resolveAgent,
  type ResolvedAgent,
} from "../agents/resolver.js";
import type { Mode } from "../tools/pipeline.js";
import type { McpConnectionResult } from "../extensions/mcp.js";
import type { MessagePart } from "../ui/message-list.js";

export type { ResolvedAgent } from "../agents/resolver.js";

export interface Session {
  ctx: SessionContext;
  messages: ModelMessage[];
  agent: ResolvedAgent;
}

export interface CreateSessionOptions {
  agentName?: string;
  modelOverride?: string;
  modeOverride?: Mode;
  onMcpConnection?: (result: McpConnectionResult) => void;
}

export async function createSession(
  options: CreateSessionOptions,
): Promise<Session> {
  const config = await loadConfig();
  const agentName = options.agentName ?? config.default.agent;

  const ctx = createSessionContext();
  const agent = await resolveAgent(
    {
      agentName,
      modelOverride: options.modelOverride,
      modeOverride: options.modeOverride,
      config,
      onMcpConnection: options.onMcpConnection,
    },
    ctx,
  );

  return { ctx, messages: [], agent };
}

export async function switchAgent(
  session: Session,
  newAgentName: string,
  options?: {
    onMcpConnection?: (result: McpConnectionResult) => void;
  },
): Promise<void> {
  if (session.agent.mcpManager) {
    await session.agent.mcpManager.disconnectAll();
    session.ctx.mcpManager = null;
  }

  session.ctx.agent = createAgentContext();
  session.messages = [];

  const config = await loadConfig();
  session.agent = await resolveAgent(
    {
      agentName: newAgentName,
      config,
      onMcpConnection: options?.onMcpConnection,
    },
    session.ctx,
  );
}

export interface SendMessageOptions {
  abortSignal?: AbortSignal;
  maxTurns?: number;
  maxRetries?: number;
  maxOutputTokens?: number;
}

export interface SendMessageResult {
  fullText: string;
  parts: MessagePart[];
}

export async function sendMessage(
  session: Session,
  userMessage: string,
  callbacks: AgentLoopCallbacks,
  options?: SendMessageOptions,
): Promise<SendMessageResult> {
  session.messages.push({ role: "user", content: userMessage });

  return runAgentLoop(
    session.messages,
    {
      model: session.agent.model,
      system: session.agent.systemPrompt,
      registry: session.agent.registry,
      pipeline: session.agent.pipeline,
      abortSignal: options?.abortSignal,
      maxTurns: options?.maxTurns ?? session.agent.maxTurns,
      maxRetries: options?.maxRetries,
      maxOutputTokens: options?.maxOutputTokens,
      logFile: session.ctx.logFile,
      isAbortedByUser: () =>
        session.ctx.abort.userAbortController?.signal.aborted ?? false,
    },
    callbacks,
  );
}
