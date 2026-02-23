import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { runAgentLoop } from "../core/agent-loop.js";
import { defineTool } from "../tools/definition.js";
import { createToolPipeline } from "../tools/pipeline.js";
import {
  createTestSessionContext,
  createToolRegistry,
  createTestPipeline,
} from "./helpers/test-context.js";
import { createMockModel, createNoopCallbacks } from "./helpers/mock-model.js";
import { ReadTool } from "../tools/read.js";
import {
  createTempWorkspace,
  type TempWorkspace,
} from "./helpers/temp-workspace.js";
import type { MessagePart } from "../ui/message-list.js";
import type { ApprovalRequest } from "../ui/approval-prompt.js";

vi.mock("../ai/retry.js", async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...(mod as object),
    sleep: vi.fn().mockResolvedValue(undefined),
  };
});

const EchoTool = defineTool({
  name: "Echo",
  description: "Echoes the input message back",
  category: "read",
  inputSchema: z.object({ message: z.string() }),
  execute: async (input) => `echo: ${input.message}`,
});

describe("runAgentLoop", () => {
  it("returns text when model responds without tool calls", async () => {
    const model = createMockModel([
      { text: "こんにちは！" },
    ]);
    const ctx = createTestSessionContext();
    const registry = createToolRegistry([EchoTool], ctx);

    const { fullText } = await runAgentLoop(
      [{ role: "user" as const, content: "hello" }],
      { model, system: "test", registry, pipeline: createTestPipeline() },
      createNoopCallbacks(),
    );

    expect(fullText).toBe("こんにちは！");
  });

  it("executes tool call and continues to next turn", async () => {
    const model = createMockModel([
      {
        toolCalls: [{ name: "Echo", args: { message: "ping" } }],
      },
      {
        text: "エコーの結果は ping でした。",
      },
    ]);
    const ctx = createTestSessionContext();
    const registry = createToolRegistry([EchoTool], ctx);

    const updates: MessagePart[][] = [];
    const callbacks = createNoopCallbacks();
    callbacks.onMessageUpdate = (parts) => updates.push([...parts]);

    const { fullText } = await runAgentLoop(
      [{ role: "user" as const, content: "echo ping" }],
      { model, system: "test", registry, pipeline: createTestPipeline() },
      callbacks,
    );

    expect(fullText).toBe("エコーの結果は ping でした。");

    const toolParts = updates
      .flat()
      .filter((p): p is Extract<MessagePart, { type: "tool" }> => p.type === "tool");
    expect(toolParts.some((p) => p.state === "input-available")).toBe(true);
    expect(toolParts.some((p) => p.state === "output-available")).toBe(true);
  });

  it("handles unknown tool gracefully", async () => {
    const model = createMockModel([
      {
        toolCalls: [{ name: "UnknownTool", args: { foo: "bar" } }],
      },
      { text: "ツールが見つかりませんでした。" },
    ]);
    const ctx = createTestSessionContext();
    const registry = createToolRegistry([EchoTool], ctx);

    const updates: MessagePart[][] = [];
    const callbacks = createNoopCallbacks();
    callbacks.onMessageUpdate = (parts) => updates.push([...parts]);

    const { fullText } = await runAgentLoop(
      [{ role: "user" as const, content: "test" }],
      { model, system: "test", registry, pipeline: createTestPipeline() },
      callbacks,
    );

    expect(fullText).toBe("ツールが見つかりませんでした。");

    const errorParts = updates
      .flat()
      .filter(
        (p): p is Extract<MessagePart, { type: "tool" }> =>
          p.type === "tool" && p.state === "output-error",
      );
    expect(errorParts.length).toBeGreaterThan(0);
    expect(errorParts[0].errorText).toContain("不明なツール");
  });

  it("respects maxTurns limit", async () => {
    const model = createMockModel([
      { toolCalls: [{ name: "Echo", args: { message: "1" } }] },
      { toolCalls: [{ name: "Echo", args: { message: "2" } }] },
      { toolCalls: [{ name: "Echo", args: { message: "3" } }] },
      { text: "done" },
    ]);
    const ctx = createTestSessionContext();
    const registry = createToolRegistry([EchoTool], ctx);

    const { fullText } = await runAgentLoop(
      [{ role: "user" as const, content: "loop" }],
      { model, system: "test", registry, pipeline: createTestPipeline(), maxTurns: 2 },
      createNoopCallbacks(),
    );

    expect(fullText).toBe("");
  });

  it("streams text via onMessageUpdate callback", async () => {
    const model = createMockModel([
      { text: "Hello World" },
    ]);
    const ctx = createTestSessionContext();
    const registry = createToolRegistry([EchoTool], ctx);

    const updates: MessagePart[][] = [];
    const callbacks = createNoopCallbacks();
    callbacks.onMessageUpdate = (parts) => updates.push([...parts]);

    await runAgentLoop(
      [{ role: "user" as const, content: "hi" }],
      { model, system: "test", registry, pipeline: createTestPipeline() },
      callbacks,
    );

    const lastUpdate = updates[updates.length - 1];
    const textParts = lastUpdate.filter(
      (p): p is Extract<MessagePart, { type: "text" }> => p.type === "text",
    );
    expect(textParts.map((p) => p.text).join("")).toBe("Hello World");
    expect(textParts.every((p) => p.state === "done")).toBe(true);
  });

  it("handles tool execution error gracefully", async () => {
    const FailTool = defineTool({
      name: "FailTool",
      description: "Always fails",
      category: "execute",
      inputSchema: z.object({ input: z.string() }),
      execute: async (): Promise<string> => {
        throw new Error("intentional failure");
      },
    });

    const model = createMockModel([
      { toolCalls: [{ name: "FailTool", args: { input: "test" } }] },
      { text: "エラーが発生しました。" },
    ]);
    const ctx = createTestSessionContext();
    const registry = createToolRegistry([FailTool], ctx);

    const updates: MessagePart[][] = [];
    const callbacks = createNoopCallbacks();
    callbacks.onMessageUpdate = (parts) => updates.push([...parts]);

    const { fullText } = await runAgentLoop(
      [{ role: "user" as const, content: "fail" }],
      { model, system: "test", registry, pipeline: createTestPipeline() },
      callbacks,
    );

    expect(fullText).toBe("エラーが発生しました。");

    const errorParts = updates
      .flat()
      .filter(
        (p): p is Extract<MessagePart, { type: "tool" }> =>
          p.type === "tool" && p.state === "output-error",
      );
    expect(errorParts.length).toBeGreaterThan(0);
    expect(errorParts[0].errorText).toContain("intentional failure");
  });
});

describe("runAgentLoop with real tools", () => {
  let ws: TempWorkspace;

  beforeEach(async () => {
    ws = await createTempWorkspace({
      "test.txt": "Hello from test file",
    });
  });

  afterEach(async () => {
    await ws.cleanup();
  });

  it("reads a file via Read tool and returns summary", async () => {
    const filePath = ws.resolve("test.txt");
    const model = createMockModel([
      {
        toolCalls: [{ name: "Read", args: { file_path: filePath } }],
      },
      {
        text: "ファイルを読みました。",
      },
    ]);
    const ctx = createTestSessionContext({ cwd: ws.dir });
    const registry = createToolRegistry([ReadTool], ctx);

    const { fullText } = await runAgentLoop(
      [{ role: "user" as const, content: "test.txt を読んで" }],
      { model, system: "test", registry, pipeline: createTestPipeline() },
      createNoopCallbacks(),
    );

    expect(fullText).toBe("ファイルを読みました。");
    expect(ctx.agent.readFiles.has(filePath)).toBe(true);
  });
});

describe("runAgentLoop retry behavior", () => {
  it("retries on retryable error and succeeds", async () => {
    const model = createMockModel([
      { error: Object.assign(new Error("rate limited"), { statusCode: 429 }) },
      { text: "リトライ成功" },
    ]);
    const ctx = createTestSessionContext();
    const registry = createToolRegistry([EchoTool], ctx);

    const retries: { attempt: number; maxRetries: number }[] = [];
    const callbacks = createNoopCallbacks();
    callbacks.onRetry = (attempt, maxRetries) =>
      retries.push({ attempt, maxRetries });

    const { fullText } = await runAgentLoop(
      [{ role: "user" as const, content: "test" }],
      { model, system: "test", registry, pipeline: createTestPipeline(), maxRetries: 2 },
      callbacks,
    );

    expect(fullText).toBe("リトライ成功");
    expect(retries.length).toBe(1);
    expect(retries[0].attempt).toBe(1);
  });

  it("calls onContextExceeded on context length error", async () => {
    const model = createMockModel([
      {
        error: Object.assign(new Error("context_length exceeded"), {
          statusCode: 400,
        }),
      },
    ]);
    const ctx = createTestSessionContext();
    const registry = createToolRegistry([EchoTool], ctx);

    let contextExceeded = false;
    const callbacks = createNoopCallbacks();
    callbacks.onContextExceeded = () => {
      contextExceeded = true;
    };

    const { fullText } = await runAgentLoop(
      [{ role: "user" as const, content: "test" }],
      { model, system: "test", registry, pipeline: createTestPipeline() },
      callbacks,
    );

    expect(contextExceeded).toBe(true);
    expect(fullText).toContain("コンテキストウィンドウ");
  });

  it("returns empty text on user abort", async () => {
    const model = createMockModel([
      {
        error: Object.assign(new Error("aborted"), { name: "AbortError" }),
      },
    ]);
    const ctx = createTestSessionContext();
    const registry = createToolRegistry([EchoTool], ctx);

    const { fullText } = await runAgentLoop(
      [{ role: "user" as const, content: "test" }],
      { model, system: "test", registry, pipeline: createTestPipeline() },
      createNoopCallbacks(),
    );

    expect(fullText).toBe("");
  });

  it("throws non-retryable errors", async () => {
    const model = createMockModel([
      {
        error: Object.assign(new Error("Unauthorized"), { statusCode: 401 }),
      },
    ]);
    const ctx = createTestSessionContext();
    const registry = createToolRegistry([EchoTool], ctx);

    await expect(
      runAgentLoop(
        [{ role: "user" as const, content: "test" }],
        { model, system: "test", registry, pipeline: createTestPipeline() },
        createNoopCallbacks(),
      ),
    ).rejects.toThrow("Unauthorized");
  });

  it("exhausts retries then throws", async () => {
    const model = createMockModel([
      { error: Object.assign(new Error("error 1"), { statusCode: 500 }) },
      { error: Object.assign(new Error("error 2"), { statusCode: 500 }) },
      { error: Object.assign(new Error("error 3"), { statusCode: 500 }) },
    ]);
    const ctx = createTestSessionContext();
    const registry = createToolRegistry([EchoTool], ctx);

    const retries: number[] = [];
    const callbacks = createNoopCallbacks();
    callbacks.onRetry = (attempt) => retries.push(attempt);

    await expect(
      runAgentLoop(
        [{ role: "user" as const, content: "test" }],
        { model, system: "test", registry, pipeline: createTestPipeline(), maxRetries: 2 },
        callbacks,
      ),
    ).rejects.toThrow("error 3");

    expect(retries).toEqual([1, 2]);
  });
});

const WriteTool = defineTool({
  name: "Write",
  description: "Writes content to a file",
  category: "write" as const,
  inputSchema: z.object({ file_path: z.string(), content: z.string() }),
  execute: async (input) => `wrote to ${input.file_path}`,
});

describe("runAgentLoop approval flow", () => {
  it("calls onApprovalRequest for tools that need approval in plan mode", async () => {
    const model = createMockModel([
      {
        toolCalls: [{ name: "Write", args: { file_path: "/tmp/test.txt", content: "hello" } }],
      },
      { text: "完了しました。" },
    ]);
    const ctx = createTestSessionContext();
    const registry = createToolRegistry([EchoTool, WriteTool], ctx);
    const pipeline = createToolPipeline({ mode: "plan" });

    const approvalRequests: ApprovalRequest[] = [];
    const callbacks = createNoopCallbacks();
    callbacks.onApprovalRequest = async (request) => {
      approvalRequests.push(request);
      return { action: "allow" };
    };

    const { fullText } = await runAgentLoop(
      [{ role: "user" as const, content: "write test" }],
      { model, system: "test", registry, pipeline },
      callbacks,
    );

    expect(fullText).toBe("完了しました。");
    expect(approvalRequests).toHaveLength(1);
    expect(approvalRequests[0].toolName).toBe("Write");
    expect(approvalRequests[0].category).toBe("write");
  });

  it("does not call onApprovalRequest for auto-approved tools in plan mode", async () => {
    const model = createMockModel([
      {
        toolCalls: [{ name: "Echo", args: { message: "hi" } }],
      },
      { text: "done" },
    ]);
    const ctx = createTestSessionContext();
    const registry = createToolRegistry([EchoTool], ctx);
    const pipeline = createToolPipeline({ mode: "plan" });

    const approvalRequests: ApprovalRequest[] = [];
    const callbacks = createNoopCallbacks();
    callbacks.onApprovalRequest = async (request) => {
      approvalRequests.push(request);
      return { action: "allow" };
    };

    await runAgentLoop(
      [{ role: "user" as const, content: "echo" }],
      { model, system: "test", registry, pipeline },
      callbacks,
    );

    expect(approvalRequests).toHaveLength(0);
  });

  it("returns denied result when user denies approval", async () => {
    const model = createMockModel([
      {
        toolCalls: [{ name: "Write", args: { file_path: "/tmp/test.txt", content: "hello" } }],
      },
      { text: "拒否されました。" },
    ]);
    const ctx = createTestSessionContext();
    const registry = createToolRegistry([WriteTool], ctx);
    const pipeline = createToolPipeline({ mode: "plan" });

    const callbacks = createNoopCallbacks();
    callbacks.onApprovalRequest = async () => ({ action: "deny" });

    const updates: MessagePart[][] = [];
    callbacks.onMessageUpdate = (parts) => updates.push([...parts]);

    const { fullText } = await runAgentLoop(
      [{ role: "user" as const, content: "write" }],
      { model, system: "test", registry, pipeline },
      callbacks,
    );

    expect(fullText).toBe("拒否されました。");
    const deniedParts = updates
      .flat()
      .filter(
        (p): p is Extract<MessagePart, { type: "tool" }> =>
          p.type === "tool" && p.state === "output-denied",
      );
    expect(deniedParts.length).toBeGreaterThan(0);
  });

  it("blocks dangerous commands without approval prompt", async () => {
    const model = createMockModel([
      {
        toolCalls: [{ name: "Bash", args: { command: "rm -rf /" } }],
      },
      { text: "blocked" },
    ]);
    const ctx = createTestSessionContext();

    const BashTool = defineTool({
      name: "Bash",
      description: "Shell",
      category: "execute" as const,
      inputSchema: z.object({ command: z.string() }),
      execute: async (input) => `ran: ${input.command}`,
    });
    const registry = createToolRegistry([BashTool], ctx);
    const pipeline = createToolPipeline({ mode: "auto" });

    let approvalCalled = false;
    const callbacks = createNoopCallbacks();
    callbacks.onApprovalRequest = async () => {
      approvalCalled = true;
      return { action: "allow" };
    };

    const updates: MessagePart[][] = [];
    callbacks.onMessageUpdate = (parts) => updates.push([...parts]);

    await runAgentLoop(
      [{ role: "user" as const, content: "dangerous" }],
      { model, system: "test", registry, pipeline },
      callbacks,
    );

    expect(approvalCalled).toBe(false);
    const deniedParts = updates
      .flat()
      .filter(
        (p): p is Extract<MessagePart, { type: "tool" }> =>
          p.type === "tool" && p.state === "output-denied",
      );
    expect(deniedParts.length).toBeGreaterThan(0);
  });

  it("skips approval for all tools in auto mode", async () => {
    const model = createMockModel([
      {
        toolCalls: [{ name: "Write", args: { file_path: "/tmp/test.txt", content: "hello" } }],
      },
      { text: "done" },
    ]);
    const ctx = createTestSessionContext();
    const registry = createToolRegistry([WriteTool], ctx);
    const pipeline = createToolPipeline({ mode: "auto" });

    let called = false;
    const callbacks = createNoopCallbacks();
    callbacks.onApprovalRequest = async () => {
      called = true;
      return { action: "allow" };
    };

    await runAgentLoop(
      [{ role: "user" as const, content: "write" }],
      { model, system: "test", registry, pipeline },
      callbacks,
    );

    expect(called).toBe(false);
  });
});
