import { randomUUID } from "node:crypto";
import { createAskUserState, type AskUserState } from "../tools/ask-user.js";
import type { TodoItem } from "../tools/todo-write.js";
import type { McpManager } from "../extensions/mcp.js";

export interface AgentContext {
  readFiles: Map<string, string>;
  todos: TodoItem[];
  askUser: AskUserState;
}

export interface AbortState {
  userAbortController: AbortController | null;
  timeoutAbortController: AbortController | null;
  timeoutTimer: ReturnType<typeof setTimeout> | null;
}

export interface SessionContext {
  sessionId: string;
  cwd: string;
  nextTerminalId: number;
  logFile: string | null;

  abort: AbortState;
  mcpManager: McpManager | null;

  agent: AgentContext;
}

export function createAbortState(): AbortState {
  return {
    userAbortController: null,
    timeoutAbortController: null,
    timeoutTimer: null,
  };
}

export function createAgentContext(): AgentContext {
  return {
    readFiles: new Map(),
    todos: [],
    askUser: createAskUserState(),
  };
}

export function createSessionContext(): SessionContext {
  return {
    sessionId: randomUUID(),
    cwd: process.cwd(),
    nextTerminalId: 1,
    logFile: null,
    abort: createAbortState(),
    mcpManager: null,
    agent: createAgentContext(),
  };
}
