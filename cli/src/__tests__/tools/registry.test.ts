import { describe, it, expect } from "vitest";
import { z } from "zod";
import { createToolRegistryBuilder } from "../../tools/registry.js";
import { defineTool } from "../../tools/definition.js";
import { createTestSessionContext } from "../helpers/test-context.js";

const dummyReadTool = defineTool({
  name: "Read",
  category: "read",
  description: "Read a file",
  inputSchema: z.object({ path: z.string() }),
  execute: (input) => ({ content: `file: ${input.path}` }),
});

const dummyWriteTool = defineTool({
  name: "Write",
  category: "write",
  description: "Write a file",
  inputSchema: z.object({ path: z.string(), content: z.string() }),
  execute: (input) => ({ written: input.path }),
});

const dummyBashTool = defineTool({
  name: "Bash",
  category: "execute",
  description: "Run command",
  inputSchema: z.object({ command: z.string() }),
  execute: (input) => ({ output: input.command }),
});

describe("createToolRegistryBuilder", () => {
  it("builds a registry with builtin tools", () => {
    const ctx = createTestSessionContext();
    const registry = createToolRegistryBuilder(ctx)
      .addBuiltinTools([dummyReadTool, dummyWriteTool])
      .build();

    expect(registry.schemas).toHaveProperty("Read");
    expect(registry.schemas).toHaveProperty("Write");
    expect(registry.handlers).toHaveProperty("Read");
    expect(registry.handlers).toHaveProperty("Write");
  });

  it("sets correct meta for builtin tools", () => {
    const ctx = createTestSessionContext();
    const registry = createToolRegistryBuilder(ctx)
      .addBuiltinTools([dummyReadTool])
      .build();

    const meta = registry.getMeta("Read");
    expect(meta).toBeDefined();
    expect(meta!.category).toBe("read");
    expect(meta!.source).toBe("builtin");
  });

  it("adds MCP tools with namespaced names", () => {
    const ctx = createTestSessionContext();
    const mockMcpTools = {
      search: {
        description: "Search tool",
        inputSchema: z.object({ query: z.string() }),
        execute: async () => ({ results: [] }),
      },
    };

    const registry = createToolRegistryBuilder(ctx)
      .addMcpTools(mockMcpTools as Record<string, never>, "my-server")
      .build();

    expect(registry.schemas).toHaveProperty("mcp__my-server__search");
    expect(registry.handlers).toHaveProperty("mcp__my-server__search");
  });

  it("sets MCP tool meta with execute category", () => {
    const ctx = createTestSessionContext();
    const mockMcpTools = {
      action: {
        description: "Action",
        inputSchema: z.object({}),
        execute: async () => ({}),
      },
    };

    const registry = createToolRegistryBuilder(ctx)
      .addMcpTools(mockMcpTools as Record<string, never>, "srv")
      .build();

    const meta = registry.getMeta("mcp__srv__action");
    expect(meta).toBeDefined();
    expect(meta!.category).toBe("execute");
    expect(meta!.source).toBe("mcp");
  });

  it("filters builtin tools by allowed list", () => {
    const ctx = createTestSessionContext();
    const registry = createToolRegistryBuilder(ctx)
      .addBuiltinTools([dummyReadTool, dummyWriteTool, dummyBashTool])
      .filterBuiltins(["Read"])
      .build();

    expect(registry.schemas).toHaveProperty("Read");
    expect(registry.schemas).not.toHaveProperty("Write");
    expect(registry.schemas).not.toHaveProperty("Bash");
  });

  it("does not filter out MCP tools when filtering builtins", () => {
    const ctx = createTestSessionContext();
    const mockMcpTools = {
      tool: {
        description: "MCP tool",
        inputSchema: z.object({}),
        execute: async () => ({}),
      },
    };

    const registry = createToolRegistryBuilder(ctx)
      .addBuiltinTools([dummyReadTool, dummyWriteTool])
      .addMcpTools(mockMcpTools as Record<string, never>, "srv")
      .filterBuiltins(["Read"])
      .build();

    expect(registry.schemas).toHaveProperty("Read");
    expect(registry.schemas).not.toHaveProperty("Write");
    expect(registry.schemas).toHaveProperty("mcp__srv__tool");
  });

  it("returns undefined for unknown tool meta", () => {
    const ctx = createTestSessionContext();
    const registry = createToolRegistryBuilder(ctx).build();
    expect(registry.getMeta("nonexistent")).toBeUndefined();
  });

  it("handler executes tool and returns result", async () => {
    const ctx = createTestSessionContext();
    const registry = createToolRegistryBuilder(ctx)
      .addBuiltinTools([dummyReadTool])
      .build();

    const result = await registry.handlers.Read(
      { path: "/test.txt" },
      { toolCallId: "call-1" },
    );
    expect(result).toEqual({ content: "file: /test.txt" });
  });

  it("handler validates input against schema", async () => {
    const ctx = createTestSessionContext();
    const registry = createToolRegistryBuilder(ctx)
      .addBuiltinTools([dummyReadTool])
      .build();

    await expect(
      registry.handlers.Read({}, { toolCallId: "call-1" }),
    ).rejects.toThrow();
  });

  it("preserves uiHooks in meta", () => {
    const toolWithHooks = defineTool({
      name: "TodoWrite",
      category: "internal",
      description: "Write todos",
      inputSchema: z.object({ todos: z.array(z.string()) }),
      execute: () => ({ done: true }),
      uiHooks: {
        onComplete: () => ({ type: "todoUpdate" as const, todos: [] }),
      },
    });

    const ctx = createTestSessionContext();
    const registry = createToolRegistryBuilder(ctx)
      .addBuiltinTools([toolWithHooks])
      .build();

    const meta = registry.getMeta("TodoWrite");
    expect(meta!.uiHooks).toBeDefined();
    expect(meta!.uiHooks!.onComplete).toBeTypeOf("function");
  });
});
