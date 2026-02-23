import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

export async function initLogger(sessionId: string, logDir?: string): Promise<string> {
  const dir = logDir?.replace(/^~/, homedir()) ?? join(homedir(), ".wellgrow", "logs");
  await mkdir(dir, { recursive: true });
  return join(dir, `${sessionId}.log`);
}

function timestamp(): string {
  return new Date().toISOString().replace("T", " ").slice(11, 19);
}

function log(logFile: string, message: string): void {
  appendFile(logFile, `[${timestamp()}] ${message}\n`, "utf-8").catch(() => {});
}

export function logRequest(logFile: string, model: string, tokenEstimate?: number): void {
  log(logFile, `REQ  model=${model}${tokenEstimate ? ` tokens=${tokenEstimate}` : ""}`);
}

export function logResponse(logFile: string, status: number, durationMs: number): void {
  log(logFile, `RES  status=${status} duration=${durationMs}ms`);
}

export function logRetry(logFile: string, attempt: number, maxRetries: number, waitMs: number): void {
  log(logFile, `RES  retry=${attempt}/${maxRetries} wait=${(waitMs / 1000).toFixed(1)}s`);
}

export function logToolCall(logFile: string, toolName: string, detail: string): void {
  log(logFile, `TOOL ${toolName} ${detail}`);
}

export function logToolResult(logFile: string, toolName: string, status: string, durationMs: number): void {
  log(logFile, `TOOL ${toolName} result=${status} duration=${durationMs}ms`);
}

export function logUsage(
  logFile: string,
  usage: { inputTokens: number; outputTokens: number; cacheWriteTokens?: number; cacheReadTokens?: number },
): void {
  let msg = `USE  in=${usage.inputTokens} out=${usage.outputTokens}`;
  if (usage.cacheWriteTokens != null) {
    msg += ` cache_write=${usage.cacheWriteTokens}`;
  }
  if (usage.cacheReadTokens != null) {
    msg += ` cache_read=${usage.cacheReadTokens}`;
  }
  log(logFile, msg);
}
