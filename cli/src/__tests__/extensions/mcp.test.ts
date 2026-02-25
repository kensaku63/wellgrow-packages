import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  loadMcpConfigFile,
  mergeMcpConfigs,
  McpManager,
  type McpConfig,
} from "../../extensions/mcp.js";

// --- loadMcpConfigFile ---

describe("loadMcpConfigFile", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `mcp-test-${randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("parses mcpServers wrapper format", async () => {
    const filePath = join(tempDir, ".mcp.json");
    await writeFile(
      filePath,
      JSON.stringify({
        mcpServers: {
          wellgrow: { type: "http", url: "https://wellgrow.ai/api/mcp" },
          supabase: { command: "supabase-mcp", args: ["--flag"] },
        },
      }),
    );

    const config = await loadMcpConfigFile(filePath);

    expect(config.mcpServers).toHaveProperty("wellgrow");
    expect(config.mcpServers).toHaveProperty("supabase");
    expect(config.mcpServers.wellgrow.url).toBe("https://wellgrow.ai/api/mcp");
    expect(config.mcpServers.supabase.args).toEqual(["--flag"]);
  });

  it("parses flat format (plugin-style)", async () => {
    const filePath = join(tempDir, ".mcp.json");
    await writeFile(
      filePath,
      JSON.stringify({
        "my-server": { command: "my-server-bin" },
        "remote": { url: "https://api.example.com/mcp" },
      }),
    );

    const config = await loadMcpConfigFile(filePath);

    expect(config.mcpServers).toHaveProperty("my-server");
    expect(config.mcpServers).toHaveProperty("remote");
  });

  it("returns empty config for missing file", async () => {
    const config = await loadMcpConfigFile(join(tempDir, "nonexistent.json"));

    expect(config.mcpServers).toEqual({});
  });

  it("returns empty config for invalid JSON", async () => {
    const filePath = join(tempDir, ".mcp.json");
    await writeFile(filePath, "not json");

    const config = await loadMcpConfigFile(filePath);

    expect(config.mcpServers).toEqual({});
  });

  it("returns empty config for empty mcpServers", async () => {
    const filePath = join(tempDir, ".mcp.json");
    await writeFile(filePath, JSON.stringify({ mcpServers: {} }));

    const config = await loadMcpConfigFile(filePath);

    expect(config.mcpServers).toEqual({});
  });

  it("handles type field defaulting to stdio", async () => {
    const filePath = join(tempDir, ".mcp.json");
    await writeFile(
      filePath,
      JSON.stringify({
        mcpServers: {
          server: { command: "my-cmd" },
        },
      }),
    );

    const config = await loadMcpConfigFile(filePath);

    expect(config.mcpServers.server.type).toBeUndefined();
    expect(config.mcpServers.server.command).toBe("my-cmd");
  });

  it("parses http transport config", async () => {
    const filePath = join(tempDir, ".mcp.json");
    await writeFile(
      filePath,
      JSON.stringify({
        mcpServers: {
          remote: {
            type: "http",
            url: "https://api.example.com/mcp",
            headers: { Authorization: "Bearer token123" },
          },
        },
      }),
    );

    const config = await loadMcpConfigFile(filePath);

    expect(config.mcpServers.remote.type).toBe("http");
    expect(config.mcpServers.remote.url).toBe("https://api.example.com/mcp");
    expect(config.mcpServers.remote.headers).toEqual({
      Authorization: "Bearer token123",
    });
  });

  it("parses sse transport config", async () => {
    const filePath = join(tempDir, ".mcp.json");
    await writeFile(
      filePath,
      JSON.stringify({
        mcpServers: {
          events: {
            type: "sse",
            url: "https://api.example.com/sse",
          },
        },
      }),
    );

    const config = await loadMcpConfigFile(filePath);

    expect(config.mcpServers.events.type).toBe("sse");
    expect(config.mcpServers.events.url).toBe("https://api.example.com/sse");
  });

  it("parses env variables in stdio config", async () => {
    const filePath = join(tempDir, ".mcp.json");
    await writeFile(
      filePath,
      JSON.stringify({
        mcpServers: {
          server: {
            command: "my-cmd",
            env: { API_KEY: "secret", DB_URL: "postgres://localhost/db" },
          },
        },
      }),
    );

    const config = await loadMcpConfigFile(filePath);

    expect(config.mcpServers.server.env).toEqual({
      API_KEY: "secret",
      DB_URL: "postgres://localhost/db",
    });
  });
});

// --- mergeMcpConfigs ---

describe("mergeMcpConfigs", () => {
  it("merges global and agent configs", () => {
    const global: McpConfig = {
      mcpServers: {
        wellgrow: { type: "http", url: "https://wellgrow.ai/api/mcp" },
        supabase: { command: "supabase-mcp" },
      },
    };
    const agent: McpConfig = {
      mcpServers: {
        perplexity: { command: "perplexity-mcp" },
      },
    };

    const merged = mergeMcpConfigs(global, agent);

    expect(Object.keys(merged.mcpServers)).toHaveLength(3);
    expect(merged.mcpServers).toHaveProperty("wellgrow");
    expect(merged.mcpServers).toHaveProperty("supabase");
    expect(merged.mcpServers).toHaveProperty("perplexity");
  });

  it("agent overrides global for same server name", () => {
    const global: McpConfig = {
      mcpServers: {
        shared: { command: "global-cmd", args: ["--global"] },
      },
    };
    const agent: McpConfig = {
      mcpServers: {
        shared: { command: "agent-cmd", args: ["--agent"] },
      },
    };

    const merged = mergeMcpConfigs(global, agent);

    expect(merged.mcpServers.shared.command).toBe("agent-cmd");
    expect(merged.mcpServers.shared.args).toEqual(["--agent"]);
  });

  it("handles empty global", () => {
    const global: McpConfig = { mcpServers: {} };
    const agent: McpConfig = {
      mcpServers: { server: { command: "cmd" } },
    };

    const merged = mergeMcpConfigs(global, agent);

    expect(Object.keys(merged.mcpServers)).toHaveLength(1);
  });

  it("handles empty agent", () => {
    const global: McpConfig = {
      mcpServers: { server: { command: "cmd" } },
    };
    const agent: McpConfig = { mcpServers: {} };

    const merged = mergeMcpConfigs(global, agent);

    expect(Object.keys(merged.mcpServers)).toHaveLength(1);
  });
});

// --- McpManager ---

describe("McpManager", () => {
  it("starts with no connections", () => {
    const manager = new McpManager();

    expect(manager.getConnectedServers()).toEqual([]);
    expect(manager.hasConnections()).toBe(false);
  });

  it("connectAll returns failure results for invalid configs", async () => {
    const manager = new McpManager();

    const results = await manager.connectAll({
      invalid: {
        type: "stdio",
        command: "nonexistent-command-that-does-not-exist-xyz",
      },
    });

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("invalid");
    expect(results[0].success).toBe(false);
    expect(results[0].error).toBeDefined();
    expect(manager.hasConnections()).toBe(false);
  });

  it("connectAll invokes onResult callback for each server", async () => {
    const manager = new McpManager();
    const callbacks: Array<{ name: string; success: boolean }> = [];

    await manager.connectAll(
      {
        bad1: { type: "stdio", command: "nonexistent1-xyz" },
        bad2: { type: "stdio", command: "nonexistent2-xyz" },
      },
      (result) => callbacks.push({ name: result.name, success: result.success }),
    );

    expect(callbacks).toHaveLength(2);
    expect(callbacks.every((c) => !c.success)).toBe(true);
  });

  it("connectAll handles empty config", async () => {
    const manager = new McpManager();

    const results = await manager.connectAll({});

    expect(results).toEqual([]);
    expect(manager.hasConnections()).toBe(false);
  });

  it("disconnectAll is safe when no connections", async () => {
    const manager = new McpManager();

    await expect(manager.disconnectAll()).resolves.toBeUndefined();
  });

  it("disconnect is safe for unknown server name", async () => {
    const manager = new McpManager();

    await expect(manager.disconnect("nonexistent")).resolves.toBeUndefined();
  });

  it("getAllToolSets returns empty map when no connections", async () => {
    const manager = new McpManager();

    const toolSets = await manager.getAllToolSets();

    expect(toolSets.size).toBe(0);
  });

  it("connect throws for missing stdio command", async () => {
    const manager = new McpManager();

    await expect(
      manager.connect("bad", { type: "stdio" }),
    ).rejects.toThrow("stdio transport requires 'command'");
  });

  it("connect throws for missing http url", async () => {
    const manager = new McpManager();

    await expect(
      manager.connect("bad", { type: "http" }),
    ).rejects.toThrow("http transport requires 'url'");
  });

  it("connect throws for missing sse url", async () => {
    const manager = new McpManager();

    await expect(
      manager.connect("bad", { type: "sse" }),
    ).rejects.toThrow("sse transport requires 'url'");
  });
});
