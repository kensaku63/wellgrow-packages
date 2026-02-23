import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import {
  createMCPClient,
  auth,
  type MCPClient,
  type MCPTransport,
  type OAuthClientProvider,
} from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";
import type { Tool } from "ai";
import { CliOAuthProvider } from "./oauth.js";

const MCP_TIMEOUT_DEFAULT = 10_000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTool = Tool<any, any>;

export interface McpServerConfig {
  type?: "stdio" | "http" | "sse";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  headers?: Record<string, string>;
}

export interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
}

export type McpToolSet = Record<string, AnyTool>;

// --- .mcp.json parser ---

const EMPTY_CONFIG: McpConfig = { mcpServers: {} };

export async function loadMcpConfigFile(filePath: string): Promise<McpConfig> {
  try {
    const raw = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    if (parsed.mcpServers && typeof parsed.mcpServers === "object") {
      return { mcpServers: parsed.mcpServers as Record<string, McpServerConfig> };
    }

    // Flat format (plugin-style): treat top-level keys as server entries
    const hasServerLike = Object.values(parsed).some(
      (v) => v && typeof v === "object" && ("command" in (v as object) || "url" in (v as object)),
    );
    if (hasServerLike) {
      return { mcpServers: parsed as Record<string, McpServerConfig> };
    }

    return EMPTY_CONFIG;
  } catch {
    return EMPTY_CONFIG;
  }
}

export function mergeMcpConfigs(...configs: McpConfig[]): McpConfig {
  const merged: Record<string, McpServerConfig> = {};
  for (const config of configs) {
    Object.assign(merged, config.mcpServers);
  }
  return { mcpServers: merged };
}

function resolveTildePath(p: string): string {
  if (p.startsWith("~/")) {
    return join(homedir(), p.slice(2));
  }
  return p;
}

export async function loadGlobalMcpConfig(
  mcpPaths: string[],
): Promise<McpConfig> {
  const configs = await Promise.all(
    mcpPaths.map((p) => loadMcpConfigFile(resolveTildePath(p))),
  );
  return mergeMcpConfigs(...configs);
}



type HttpTransportConfig = {
  type: "sse" | "http";
  url: string;
  headers?: Record<string, string>;
  authProvider?: OAuthClientProvider;
};

function createTransport(
  config: McpServerConfig,
  authProvider?: OAuthClientProvider,
): MCPTransport | HttpTransportConfig {
  const type = config.type ?? "stdio";

  switch (type) {
    case "stdio": {
      if (!config.command) {
        throw new Error("stdio transport requires 'command'");
      }
      return new Experimental_StdioMCPTransport({
        command: config.command,
        args: config.args,
        env: { ...process.env, ...config.env } as Record<string, string>,
        cwd: config.cwd,
        stderr: "ignore",
      });
    }
    case "http":
    case "sse": {
      if (!config.url) {
        throw new Error(`${type} transport requires 'url'`);
      }
      return { type, url: config.url, headers: config.headers, authProvider };
    }
    default:
      throw new Error(`Unknown transport type: ${type}`);
  }
}

async function preAuthenticate(
  provider: CliOAuthProvider,
  serverUrl: string,
): Promise<void> {
  const tokens = await provider.tokens();
  if (tokens) return;

  await provider.startCallbackServer();

  const result = await auth(provider, { serverUrl });
  if (result === "AUTHORIZED") return;

  const code = provider.getReceivedAuthCode();
  if (!code) {
    throw new Error("OAuth 認証コードを取得できませんでした");
  }

  const result2 = await auth(provider, { serverUrl, authorizationCode: code });
  if (result2 !== "AUTHORIZED") {
    throw new Error("OAuth トークン交換に失敗しました");
  }
}

// --- McpManager ---

export interface McpConnectionResult {
  name: string;
  success: boolean;
  error?: string;
}

export class McpManager {
  private clients = new Map<string, MCPClient>();

  async connectAll(
    configs: Record<string, McpServerConfig>,
    onResult?: (result: McpConnectionResult) => void,
  ): Promise<McpConnectionResult[]> {
    const results: McpConnectionResult[] = [];

    const entries = Object.entries(configs);
    if (entries.length === 0) return results;

    const timeoutMs = getTimeoutMs();

    const tasks = entries.map(async ([name, config]) => {
      const result = await this.connectSingle(name, config, timeoutMs);
      results.push(result);
      onResult?.(result);
    });

    await Promise.allSettled(tasks);
    return results;
  }

  async connect(name: string, config: McpServerConfig): Promise<void> {
    const result = await this.connectSingle(name, config, getTimeoutMs());
    if (!result.success) {
      throw new Error(result.error);
    }
  }

  private async connectSingle(
    name: string,
    config: McpServerConfig,
    timeoutMs: number,
  ): Promise<McpConnectionResult> {
    try {
      let authProvider: CliOAuthProvider | undefined;
      const type = config.type ?? "stdio";

      if ((type === "http" || type === "sse") && config.url) {
        authProvider = new CliOAuthProvider(name, config.url);
        try {
          await preAuthenticate(authProvider, config.url);
        } catch {
          // OAuth not supported by this server — continue without auth
          authProvider = undefined;
        }
      }

      const transport = createTransport(config, authProvider);

      const clientPromise = createMCPClient({
        transport,
        name: `wellgrow-cli/${name}`,
        onUncaughtError: (error) => {
          process.stderr.write(
            `[MCP] ${name}: uncaught error: ${error instanceof Error ? error.message : String(error)}\n`,
          );
        },
      });

      const client = await Promise.race([
        clientPromise,
        timeout(timeoutMs, `MCP server '${name}' connection timed out (${timeoutMs}ms)`),
      ]);

      if (this.clients.has(name)) {
        await this.clients.get(name)!.close().catch(() => {});
      }
      this.clients.set(name, client);

      return { name, success: true };
    } catch (error) {
      return {
        name,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async disconnect(name: string): Promise<void> {
    const client = this.clients.get(name);
    if (!client) return;
    this.clients.delete(name);
    try {
      await Promise.race([client.close(), timeout(3000, "close timeout")]);
    } catch {
      // ignore close errors
    }
  }

  async disconnectAll(): Promise<void> {
    const names = [...this.clients.keys()];
    await Promise.allSettled(names.map((name) => this.disconnect(name)));
  }

  async getAllToolSets(): Promise<{ toolSets: Map<string, McpToolSet>; errors: McpConnectionResult[] }> {
    const toolSets = new Map<string, McpToolSet>();
    const errors: McpConnectionResult[] = [];

    for (const [name, client] of this.clients) {
      try {
        const toolSet = await client.tools();
        toolSets.set(name, toolSet as McpToolSet);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`[MCP] ${name}: failed to load tools: ${message}\n`);
        errors.push({ name, success: false, error: `ツール読み込み失敗: ${message}` });
      }
    }

    return { toolSets, errors };
  }

  getConnectedServers(): string[] {
    return [...this.clients.keys()];
  }

  hasConnections(): boolean {
    return this.clients.size > 0;
  }
}

// --- Helpers ---

function getTimeoutMs(): number {
  const envVal = process.env.MCP_TIMEOUT;
  if (envVal) {
    const parsed = Number(envVal);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }
  return MCP_TIMEOUT_DEFAULT;
}

function timeout(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(message)), ms),
  );
}
