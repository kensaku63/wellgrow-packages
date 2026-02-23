import { tool, type Tool } from "ai";
import type {
  ErasedToolDefinition,
  ToolExecutionContext,
  ToolCategory,
  ToolUIEvent,
} from "./definition.js";
import type { SessionContext } from "../core/context.js";

export type ToolSource = "builtin" | "mcp" | "custom";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTool = Tool<any, any>;

export interface ToolHandlerContext {
  toolCallId: string;
  abortSignal?: AbortSignal;
}

type ToolHandler = (
  args: Record<string, unknown>,
  ctx: ToolHandlerContext,
) => Promise<unknown> | unknown;

export interface ToolMeta {
  category: ToolCategory;
  source: ToolSource;
  uiHooks?: {
    onStart?: (input: unknown, toolCallId: string) => ToolUIEvent | null;
    onComplete?: (input: unknown, output: unknown) => ToolUIEvent | null;
  };
}

export interface ToolRegistry {
  schemas: Record<string, AnyTool>;
  handlers: Record<string, ToolHandler>;
  getMeta(toolName: string): ToolMeta | undefined;
}

export interface ToolRegistryBuilder {
  addBuiltinTools(tools: ErasedToolDefinition[]): ToolRegistryBuilder;
  addMcpTools(
    mcpToolSet: Record<string, AnyTool>,
    serverName: string,
  ): ToolRegistryBuilder;
  filterBuiltins(allowed: string[]): ToolRegistryBuilder;
  build(): ToolRegistry;
}

export function createToolRegistryBuilder(
  sessionCtx: SessionContext,
): ToolRegistryBuilder {
  const schemas: Record<string, AnyTool> = {};
  const handlers: Record<string, ToolHandler> = {};
  const metaMap = new Map<string, ToolMeta>();

  const builder: ToolRegistryBuilder = {
    addBuiltinTools(tools) {
      for (const t of tools) {
        schemas[t.name] = tool({
          description: t.description,
          inputSchema: t.inputSchema,
        });

        handlers[t.name] = async (args, handlerCtx) => {
          const input = t.inputSchema.parse(args);
          const execCtx: ToolExecutionContext = {
            session: sessionCtx,
            toolCallId: handlerCtx.toolCallId,
            abortSignal: handlerCtx.abortSignal,
          };
          return t.execute(input, execCtx);
        };

        metaMap.set(t.name, {
          category: t.category,
          source: "builtin",
          uiHooks: t.uiHooks,
        });
      }
      return builder;
    },

    addMcpTools(mcpToolSet, serverName) {
      for (const [name, mcpTool] of Object.entries(mcpToolSet)) {
        const qualifiedName = `mcp__${serverName}__${name}`;

        schemas[qualifiedName] = tool({
          description: mcpTool.description ?? "",
          inputSchema: mcpTool.inputSchema,
        });

        if (typeof mcpTool.execute === "function") {
          const executeFn = mcpTool.execute;
          handlers[qualifiedName] = (args, handlerCtx) =>
            executeFn(args, {
              toolCallId: handlerCtx.toolCallId,
              messages: [],
            });
        }

        metaMap.set(qualifiedName, {
          category: "execute",
          source: "mcp",
        });
      }
      return builder;
    },

    filterBuiltins(allowed) {
      const allowSet = new Set(allowed);
      for (const [name, meta] of metaMap) {
        if (meta.source === "builtin" && !allowSet.has(name)) {
          delete schemas[name];
          delete handlers[name];
          metaMap.delete(name);
        }
      }
      return builder;
    },

    build() {
      return {
        schemas: { ...schemas },
        handlers: { ...handlers },
        getMeta: (name: string) => metaMap.get(name),
      };
    },
  };

  return builder;
}
