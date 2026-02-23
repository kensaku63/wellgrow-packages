import type { ToolResultPart } from "ai";
import type { ToolMeta } from "./registry.js";

export type Mode = "plan" | "auto";

export type ToolEvaluation =
  | { action: "auto" }
  | { action: "approve" }
  | { action: "block"; reason: string };

export interface ToolPipelineConfig {
  mode: Mode;
  allowedMcps?: string[];
}

export interface ToolPipeline {
  readonly mode: Mode;
  evaluate(
    toolName: string,
    meta: ToolMeta | undefined,
    args?: Record<string, unknown>,
  ): ToolEvaluation;
  markMcpAllowed(serverName: string): void;
  createDeniedResult(
    toolCallId: string,
    toolName: string,
    reason: string,
  ): ToolResultPart;
  setMode(mode: Mode): void;
}

// ---------------------------------------------------------------------------
// Bash read-only command whitelist
// ---------------------------------------------------------------------------

const READ_ONLY_COMMANDS = new Set([
  "ls", "pwd", "cat", "echo", "which", "type", "env",
  "printenv", "date", "uname", "whoami", "id", "df", "du",
  "wc", "file", "stat", "head", "tail", "less", "tree",
  "find", "rg", "grep", "awk", "sed", "sort", "uniq",
  "diff", "basename", "dirname", "realpath", "readlink",
  "true", "false", "test", "expr", "seq", "tr", "cut",
  "paste", "tee", "xargs", "printf", "jq", "yq",
]);

const READ_ONLY_GIT_SUBCOMMANDS = new Set([
  "status", "log", "diff", "show", "branch", "tag", "remote",
  "rev-parse", "describe", "shortlog", "stash", "config",
  "ls-files", "ls-tree", "cat-file", "blame", "reflog",
]);

const REDIRECT_PATTERN = /(?:^|[^\\])(?:>>?|[0-9]+>>?)/;

export function isBashReadOnly(command: string): boolean {
  if (REDIRECT_PATTERN.test(command)) return false;

  const segments = command.split(/\s*\|\s*/);
  for (const segment of segments) {
    const trimmed = segment.trim();
    if (!trimmed) continue;

    const tokens = trimmed.split(/\s+/);
    const cmd = tokens[0];
    if (!cmd) return false;

    if (cmd === "git") {
      const subCmd = tokens[1];
      if (!subCmd || !READ_ONLY_GIT_SUBCOMMANDS.has(subCmd)) return false;
      continue;
    }

    if (!READ_ONLY_COMMANDS.has(cmd)) return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Dangerous command patterns (always blocked regardless of mode)
// ---------------------------------------------------------------------------

const DANGEROUS_PATTERNS = [
  /^rm\s+-rf\s+\//,
  /chmod\s+777/,
  /:\(\)\{\s*:\|:&\s*\};:/,
  />\s*\/dev\/sd/,
  /^mkfs/,
  /dd\s+if=.*of=\/dev/,
];

function isDangerous(args?: Record<string, unknown>): boolean {
  const command = args?.command;
  if (typeof command !== "string") return false;
  return DANGEROUS_PATTERNS.some((p) => p.test(command));
}

// ---------------------------------------------------------------------------
// Auto-approve categories for plan mode
// ---------------------------------------------------------------------------

const AUTO_CATEGORIES = new Set(["read", "interactive", "internal"]);

// ---------------------------------------------------------------------------
// Pipeline factory
// ---------------------------------------------------------------------------

export function createToolPipeline(config: ToolPipelineConfig): ToolPipeline {
  let currentMode = config.mode;
  const allowedMcps = new Set(config.allowedMcps ?? []);

  function isToolAllowed(toolName: string): boolean {
    if (!toolName.startsWith("mcp__")) return true;
    const serverName = toolName.split("__")[1];
    return serverName ? allowedMcps.has(serverName) : false;
  }

  return {
    get mode() {
      return currentMode;
    },

    evaluate(toolName, meta, args) {
      if (toolName === "Bash" && isDangerous(args)) {
        return { action: "block", reason: "危険なコマンドです" };
      }

      if (meta?.source === "mcp" && !isToolAllowed(toolName)) {
        return { action: "approve" };
      }

      if (currentMode === "auto") {
        return { action: "auto" };
      }

      // plan mode
      if (!meta) return { action: "approve" };

      if (AUTO_CATEGORIES.has(meta.category)) {
        return { action: "auto" };
      }

      if (toolName === "Bash" && meta.category === "execute") {
        const command = args?.command;
        if (typeof command === "string" && isBashReadOnly(command)) {
          return { action: "auto" };
        }
        return { action: "approve" };
      }

      return { action: "approve" };
    },

    markMcpAllowed(serverName) {
      allowedMcps.add(serverName);
    },

    createDeniedResult(toolCallId, toolName, reason) {
      return {
        type: "tool-result",
        toolCallId,
        toolName,
        output: {
          type: "execution-denied",
          reason,
        },
      };
    },

    setMode(mode) {
      currentMode = mode;
    },
  };
}
