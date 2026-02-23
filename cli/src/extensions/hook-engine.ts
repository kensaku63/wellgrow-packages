import { readFile, readdir, stat } from "node:fs/promises";
import type { Dirent, Stats } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { spawn } from "node:child_process";
import { z } from "zod";
import { generateText } from "ai";
import type { LanguageModel } from "ai";
import type { WellGrowConfig } from "../config/types.js";
import { getModel } from "../ai/providers.js";
import type {
  ToolApprovalDecision,
  ToolExecutionHooks,
  ToolCall,
} from "../core/agent-loop.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HookEventName =
  | "SessionStart"
  | "UserPromptSubmit"
  | "PreToolUse"
  | "PermissionRequest"
  | "PostToolUse"
  | "PostToolUseFailure"
  | "Stop"
  | "SessionEnd";

export interface CommandHook {
  type: "command";
  command: string;
  timeout?: number;
  async?: boolean;
  statusMessage?: string;
}

export interface PromptHook {
  type: "prompt";
  prompt: string;
  model?: string;
  timeout?: number;
}

export type HookDefinition = CommandHook | PromptHook;

export interface HookGroup {
  matcher?: string;
  hooks: HookDefinition[];
}

export interface HooksFileConfig {
  hooks: Partial<Record<HookEventName, HookGroup[]>>;
}

export interface HookInput {
  session_id: string;
  cwd: string;
  hook_event_name: HookEventName;
  source?: string;
  prompt?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_use_id?: string;
  tool_response?: unknown;
  error?: string;
  stop_hook_active?: boolean;
  last_assistant_message?: string;
  reason?: string;
}

export interface HookResult {
  blocked: boolean;
  reason?: string;
  feedback?: string;
  additionalContext?: string;
  updatedInput?: Record<string, unknown>;
  askUser?: boolean;
  stopDecision?: "block" | "approve";
}

export type { ToolExecutionHooks } from "../core/agent-loop.js";

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const hookDefinitionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("command"),
    command: z.string(),
    timeout: z.number().positive().optional(),
    async: z.boolean().optional(),
    statusMessage: z.string().optional(),
  }),
  z.object({
    type: z.literal("prompt"),
    prompt: z.string(),
    model: z.string().optional(),
    timeout: z.number().positive().optional(),
  }),
]);

const hookGroupSchema = z.object({
  matcher: z.string().optional(),
  hooks: z.array(hookDefinitionSchema),
});

const hooksFileConfigSchema = z.object({
  hooks: z.record(z.array(hookGroupSchema)).default({}),
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_HOOK_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_COMMAND_TIMEOUT_SEC = 30;
const MAX_HOOK_OUTPUT_BYTES = 1024 * 1024;

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function expandTilde(p: string): string {
  return p.startsWith("~") ? join(homedir(), p.slice(1)) : p;
}

function hookKey(hook: HookDefinition): string {
  switch (hook.type) {
    case "command":
      return `command:${hook.command}:async=${hook.async ?? false}`;
    case "prompt":
      return `prompt:${hook.prompt}:${hook.model ?? "default"}`;
  }
}

function warnHook(message: string): void {
  process.stderr.write(`[hooks] ${message}\n`);
}

// ---------------------------------------------------------------------------
// Parser — load, merge, and deduplicate hooks.json files
// ---------------------------------------------------------------------------

async function loadHooksFile(filePath: string): Promise<HooksFileConfig> {
  let content: string;
  try {
    content = await readFile(expandTilde(filePath), "utf-8");
  } catch {
    return { hooks: {} };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch (error) {
    warnHook(
      `${filePath} のJSON解析に失敗: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { hooks: {} };
  }

  const result = hooksFileConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join(", ");
    warnHook(`${filePath} のスキーマが不正: ${issues}`);
    return { hooks: {} };
  }

  return { hooks: result.data.hooks as HooksFileConfig["hooks"] };
}

async function resolveHookFiles(pathInput: string): Promise<string[]> {
  const resolvedPath = expandTilde(pathInput);

  let stats: Stats;
  try {
    stats = await stat(resolvedPath);
  } catch {
    return [];
  }

  if (stats.isFile()) {
    return [resolvedPath];
  }

  if (!stats.isDirectory()) {
    return [];
  }

  let entries: Dirent[];
  try {
    entries = await readdir(resolvedPath, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => join(resolvedPath, entry.name))
    .sort((a, b) => a.localeCompare(b));
}

function mergeHooksConfig(
  target: HooksFileConfig,
  source: HooksFileConfig,
): void {
  const events = Object.keys(source.hooks) as HookEventName[];
  for (const event of events) {
    const sourceGroups = source.hooks[event] ?? [];
    const currentGroups = target.hooks[event] ?? [];
    target.hooks[event] = [...currentGroups, ...sourceGroups];
  }
}

export async function loadHooksConfig(
  pathsOrGlobalPath: string[] | string,
  agentPath?: string,
): Promise<HooksFileConfig> {
  const pathList = Array.isArray(pathsOrGlobalPath)
    ? pathsOrGlobalPath
    : [pathsOrGlobalPath, ...(agentPath ? [agentPath] : [])];

  const merged: HooksFileConfig = { hooks: {} };

  for (const pathEntry of pathList) {
    const files = await resolveHookFiles(pathEntry);
    for (const filePath of files) {
      const config = await loadHooksFile(filePath);
      mergeHooksConfig(merged, config);
    }
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Matcher — regex-based hook targeting with cache
// ---------------------------------------------------------------------------

const regexCache = new Map<string, RegExp | null>();

function getCachedRegex(pattern: string): RegExp | null {
  const cached = regexCache.get(pattern);
  if (cached !== undefined) return cached;

  try {
    const regex = new RegExp(`^(?:${pattern})$`);
    regexCache.set(pattern, regex);
    return regex;
  } catch {
    regexCache.set(pattern, null);
    return null;
  }
}

function matchesTarget(
  matcher: string | undefined,
  target: string | null,
): boolean {
  if (!matcher || matcher === "" || matcher === "*") return true;
  if (target === null) return true;

  const regex = getCachedRegex(matcher);
  if (regex) return regex.test(target);

  return matcher === target;
}

function getMatchTarget(
  event: HookEventName,
  input: HookInput,
): string | null {
  switch (event) {
    case "PreToolUse":
    case "PostToolUse":
    case "PostToolUseFailure":
    case "PermissionRequest":
      return input.tool_name ?? null;
    case "SessionStart":
      return input.source ?? null;
    case "SessionEnd":
      return input.reason ?? null;
    case "UserPromptSubmit":
    case "Stop":
      return null;
  }
}

// ---------------------------------------------------------------------------
// Command Hook Executor
// ---------------------------------------------------------------------------

function executeCommandHook(
  hook: CommandHook,
  input: HookInput,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const timeoutMs = (hook.timeout ?? DEFAULT_COMMAND_TIMEOUT_SEC) * 1000;
    const command = expandTilde(hook.command);

    const child = spawn("sh", ["-c", command], {
      env: { ...process.env },
      timeout: timeoutMs,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data: Buffer) => {
      if (stdout.length < MAX_HOOK_OUTPUT_BYTES) {
        stdout += data.toString();
      }
    });
    child.stderr.on("data", (data: Buffer) => {
      if (stderr.length < MAX_HOOK_OUTPUT_BYTES) {
        stderr += data.toString();
      }
    });

    child.stdin.on("error", () => {});
    child.stdin.write(JSON.stringify(input));
    child.stdin.end();

    child.on("close", (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });
    child.on("error", (err) => {
      warnHook(`コマンドhook実行エラー (${hook.command}): ${err.message}`);
      resolve({ stdout, stderr, exitCode: 1 });
    });
  });
}

// ---------------------------------------------------------------------------
// LLM Hook Executor (unified prompt hook)
// ---------------------------------------------------------------------------

async function executeLLMHook(
  hook: PromptHook,
  input: HookInput,
  resolveModel: (modelId?: string) => LanguageModel,
): Promise<{ ok: boolean; reason?: string }> {
  const prompt = hook.prompt.replace(/\$ARGUMENTS/g, JSON.stringify(input));
  const model = resolveModel(hook.model);

  try {
    const result = await generateText({
      model,
      prompt,
      maxOutputTokens: 500,
      ...(hook.timeout
        ? { abortSignal: AbortSignal.timeout(hook.timeout * 1000) }
        : {}),
    });

    const text = result.text.trim();
    try {
      const parsed = JSON.parse(text) as { ok?: boolean; reason?: string };
      return { ok: parsed.ok !== false, reason: parsed.reason };
    } catch {
      warnHook(
        `Prompt hookのレスポンスがJSON形式ではありません: ${text.slice(0, 200)}`,
      );
      return { ok: true };
    }
  } catch (error) {
    warnHook(
      `Prompt hook実行エラー: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { ok: true };
  }
}

// ---------------------------------------------------------------------------
// Output normalisation helpers
// ---------------------------------------------------------------------------

function normalizeCommandOutput(
  event: HookEventName,
  stdout: string,
  stderr: string,
  exitCode: number,
): HookResult {
  if (exitCode === 2) {
    return {
      blocked: true,
      reason: stderr.trim() || "フックによりブロックされました",
      feedback: stderr.trim() || undefined,
    };
  }

  if (exitCode !== 0) {
    return { blocked: false };
  }

  const trimmed = stdout.trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    if (event === "SessionStart" && trimmed) {
      return { blocked: false, additionalContext: trimmed };
    }
    return { blocked: false };
  }

  const hso = parsed.hookSpecificOutput as
    | Record<string, unknown>
    | undefined;

  switch (event) {
    case "PreToolUse": {
      const decision = hso?.permissionDecision as string | undefined;
      if (decision === "deny") {
        return {
          blocked: true,
          reason:
            (hso?.permissionDecisionReason as string) ??
            "フックによりブロックされました",
        };
      }
      if (decision === "ask") {
        return { blocked: false, askUser: true };
      }
      return {
        blocked: false,
        updatedInput: hso?.updatedInput as
          | Record<string, unknown>
          | undefined,
        additionalContext: hso?.additionalContext as string | undefined,
      };
    }

    case "PermissionRequest": {
      const decision = hso?.decision as
        | { behavior?: string; updatedInput?: Record<string, unknown> }
        | undefined;
      if (decision?.behavior === "deny") {
        return { blocked: true, reason: "フックにより拒否されました" };
      }
      if (decision?.behavior === "allow") {
        return { blocked: false, updatedInput: decision.updatedInput };
      }
      return { blocked: false };
    }

    case "Stop": {
      if (parsed.decision === "block") {
        return {
          blocked: true,
          stopDecision: "block",
          reason:
            (parsed.reason as string) ??
            "フックにより続行が要求されました",
        };
      }
      return { blocked: false, stopDecision: "approve" };
    }

    case "SessionStart": {
      const ctx =
        (hso?.additionalContext as string | undefined) ?? trimmed;
      return { blocked: false, additionalContext: ctx || undefined };
    }

    default:
      return { blocked: false };
  }
}

function normalizePromptOutput(
  ok: boolean,
  reason?: string,
): HookResult {
  if (!ok) {
    return {
      blocked: true,
      reason: reason ?? "フックによりブロックされました",
    };
  }
  return { blocked: false };
}

// ---------------------------------------------------------------------------
// Result merging — combine outputs from parallel hooks
// ---------------------------------------------------------------------------

function mergeResults(results: HookResult[]): HookResult {
  const merged: HookResult = { blocked: false };

  for (const r of results) {
    if (r.blocked) {
      merged.blocked = true;
      merged.reason = r.reason ?? merged.reason;
    }

    if (r.stopDecision) merged.stopDecision = r.stopDecision;
    if (r.askUser) merged.askUser = true;

    if (r.feedback) {
      merged.feedback = merged.feedback
        ? `${merged.feedback}\n${r.feedback}`
        : r.feedback;
    }

    if (r.additionalContext) {
      merged.additionalContext = merged.additionalContext
        ? `${merged.additionalContext}\n${r.additionalContext}`
        : r.additionalContext;
    }

    if (r.updatedInput) {
      merged.updatedInput = { ...merged.updatedInput, ...r.updatedInput };
    }
  }

  return merged;
}

// ---------------------------------------------------------------------------
// HookEngine
// ---------------------------------------------------------------------------

export interface HookEngineOptions {
  sessionId: string;
  cwd: string;
  config: WellGrowConfig;
}

export class HookEngine {
  private readonly hooksConfig: HooksFileConfig;
  private readonly options: HookEngineOptions;
  private readonly _hasHooks: boolean;

  constructor(hooksConfig: HooksFileConfig, options: HookEngineOptions) {
    this.hooksConfig = hooksConfig;
    this.options = options;
    this._hasHooks = Object.keys(hooksConfig.hooks).length > 0;
  }

  get hasHooks(): boolean {
    return this._hasHooks;
  }

  async fire(
    event: HookEventName,
    eventInput: Partial<HookInput> = {},
  ): Promise<HookResult> {
    const groups = this.hooksConfig.hooks[event];
    if (!groups || groups.length === 0) {
      return { blocked: false };
    }

    const input: HookInput = {
      session_id: this.options.sessionId,
      cwd: this.options.cwd,
      hook_event_name: event,
      ...eventInput,
    };

    const matchTarget = getMatchTarget(event, input);
    const matchingGroups = groups.filter((g) =>
      matchesTarget(g.matcher, matchTarget),
    );

    if (matchingGroups.length === 0) {
      return { blocked: false };
    }

    const seen = new Set<string>();
    const syncHooks: HookDefinition[] = [];
    const asyncHooks: CommandHook[] = [];

    for (const group of matchingGroups) {
      for (const hook of group.hooks) {
        const key = hookKey(hook);
        if (seen.has(key)) continue;
        seen.add(key);

        if (hook.type === "command" && hook.async) {
          asyncHooks.push(hook);
        } else {
          syncHooks.push(hook);
        }
      }
    }

    for (const hook of asyncHooks) {
      this.executeOne(hook, event, input).catch((error) => {
        warnHook(
          `非同期hook実行エラー (${hook.command}): ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }

    if (syncHooks.length === 0) {
      return { blocked: false };
    }

    const results = await Promise.all(
      syncHooks.map((hook) => this.executeOne(hook, event, input)),
    );

    return mergeResults(results);
  }

  // ----- Bridge to ToolExecutionHooks (agent-loop.ts) -----

  createToolExecutionHooks(): ToolExecutionHooks {
    return {
      beforeExecute: async (
        toolCall: ToolCall,
        _meta: { category: string; source: string },
      ): Promise<ToolApprovalDecision> => {
        const result = await this.fire("PreToolUse", {
          tool_name: toolCall.toolName,
          tool_input: toolCall.args,
          tool_use_id: toolCall.toolCallId,
        });

        if (result.blocked) {
          return {
            decision: "deny",
            reason:
              result.reason ?? "フックによりブロックされました",
          };
        }

        if (result.askUser) {
          return { decision: "ask" };
        }

        return {
          decision: "allow",
          updatedInput: result.updatedInput,
          additionalContext: result.additionalContext,
        };
      },

      afterExecute: async (
        toolCall: ToolCall,
        result: { success: boolean; output?: unknown; error?: string },
      ): Promise<{ feedback?: string } | void> => {
        const event: HookEventName = result.success
          ? "PostToolUse"
          : "PostToolUseFailure";
        const hookResult = await this.fire(event, {
          tool_name: toolCall.toolName,
          tool_input: toolCall.args,
          tool_use_id: toolCall.toolCallId,
          ...(result.success
            ? { tool_response: result.output }
            : { error: result.error }),
        });

        if (hookResult.feedback) {
          return { feedback: hookResult.feedback };
        }
      },

      onPermissionRequest: async (
        toolCall: ToolCall,
        _meta: { category: string; source: string },
      ) => {
        const result = await this.fire("PermissionRequest", {
          tool_name: toolCall.toolName,
          tool_input: toolCall.args,
        });

        if (result.blocked) {
          return { behavior: "deny" as const };
        }

        if (result.updatedInput !== undefined) {
          return {
            behavior: "allow" as const,
            updatedInput: result.updatedInput,
          };
        }

        return null;
      },
    };
  }

  // ----- Private helpers -----

  private async executeOne(
    hook: HookDefinition,
    event: HookEventName,
    input: HookInput,
  ): Promise<HookResult> {
    switch (hook.type) {
      case "command": {
        const { stdout, stderr, exitCode } = await executeCommandHook(
          hook,
          input,
        );
        return normalizeCommandOutput(event, stdout, stderr, exitCode);
      }
      case "prompt": {
        const { ok, reason } = await executeLLMHook(hook, input, (id) =>
          this.resolveModel(id),
        );
        return normalizePromptOutput(ok, reason);
      }
    }
  }

  private resolveModel(modelId?: string): LanguageModel {
    return getModel(modelId ?? DEFAULT_HOOK_MODEL, this.options.config);
  }
}
