import { describe, it, expect, vi } from "vitest";
import {
  handleSlashCommand,
  type SlashCommandContext,
} from "../../hooks/slash-commands.js";

function createMockContext(
  overrides: Partial<SlashCommandContext> = {},
): SlashCommandContext {
  return {
    session: {
      agent: {
        pipeline: {
          mode: "auto",
          setMode: vi.fn(),
        },
      },
    } as unknown as SlashCommandContext["session"],
    status: "ready",
    mode: "auto",
    currentAgentName: "joy",
    currentAgentIcon: "🌱",
    recorder: null,
    messageCountRef: { current: 0 },
    cancelAllAskUser: vi.fn(),
    resetSession: vi.fn(async () => {}),
    clearMessages: vi.fn(),
    setTodos: vi.fn(),
    setMode: vi.fn(),
    switchModel: vi.fn(() => ({ message: "モデルを切り替えました" })),
    switchAgent: vi.fn(async () => ({ success: true, message: "切り替え完了" })),
    addSystemMessage: vi.fn(),
    onExit: vi.fn(),
    ...overrides,
  };
}

describe("handleSlashCommand", () => {
  describe("exit / quit", () => {
    it("handles 'exit' command", async () => {
      const ctx = createMockContext();
      const result = await handleSlashCommand("exit", ctx);
      expect(result).toBe(true);
      expect(ctx.cancelAllAskUser).toHaveBeenCalled();
      expect(ctx.onExit).toHaveBeenCalled();
    });

    it("handles 'quit' command", async () => {
      const ctx = createMockContext();
      const result = await handleSlashCommand("quit", ctx);
      expect(result).toBe(true);
      expect(ctx.onExit).toHaveBeenCalled();
    });

    it("finalizes recorder on exit", async () => {
      const recorder = { finalize: vi.fn(async () => {}) };
      const ctx = createMockContext({
        recorder: recorder as unknown as SlashCommandContext["recorder"],
        messageCountRef: { current: 5 },
      });
      await handleSlashCommand("exit", ctx);
      expect(recorder.finalize).toHaveBeenCalledWith(5);
    });

  });

  describe("/clear", () => {
    it("resets session and clears state", async () => {
      const ctx = createMockContext();
      const result = await handleSlashCommand("/clear", ctx);
      expect(result).toBe(true);
      expect(ctx.cancelAllAskUser).toHaveBeenCalled();
      expect(ctx.resetSession).toHaveBeenCalled();
      expect(ctx.clearMessages).toHaveBeenCalled();
      expect(ctx.setTodos).toHaveBeenCalledWith([]);
    });
  });

  describe("/agent", () => {
    it("shows current agent when no argument", async () => {
      const ctx = createMockContext();
      const result = await handleSlashCommand("/agent", ctx);
      expect(result).toBe(true);
      expect(ctx.addSystemMessage).toHaveBeenCalledWith(
        expect.stringContaining("joy"),
      );
    });

    it("switches agent when argument provided", async () => {
      const ctx = createMockContext();
      const result = await handleSlashCommand("/agent bird", ctx);
      expect(result).toBe(true);
      expect(ctx.switchAgent).toHaveBeenCalledWith("bird");
      expect(ctx.addSystemMessage).toHaveBeenCalledWith("切り替え完了");
    });

    it("blocks agent switch during streaming", async () => {
      const ctx = createMockContext({ status: "streaming" });
      const result = await handleSlashCommand("/agent bird", ctx);
      expect(result).toBe(true);
      expect(ctx.switchAgent).not.toHaveBeenCalled();
      expect(ctx.addSystemMessage).toHaveBeenCalledWith(
        expect.stringContaining("推論中"),
      );
    });

    it("clears messages and todos on agent switch", async () => {
      const ctx = createMockContext();
      await handleSlashCommand("/agent new-agent", ctx);
      expect(ctx.clearMessages).toHaveBeenCalled();
      expect(ctx.setTodos).toHaveBeenCalledWith([]);
    });
  });

  describe("/mode", () => {
    it("shows current mode when no argument", async () => {
      const ctx = createMockContext({ mode: "plan" });
      const result = await handleSlashCommand("/mode", ctx);
      expect(result).toBe(true);
      expect(ctx.addSystemMessage).toHaveBeenCalledWith(
        expect.stringContaining("plan"),
      );
    });

    it("switches to plan mode", async () => {
      const ctx = createMockContext();
      const result = await handleSlashCommand("/mode plan", ctx);
      expect(result).toBe(true);
      expect(ctx.session.agent.pipeline.setMode).toHaveBeenCalledWith("plan");
      expect(ctx.setMode).toHaveBeenCalledWith("plan");
    });

    it("switches to auto mode", async () => {
      const ctx = createMockContext({ mode: "plan" });
      const result = await handleSlashCommand("/mode auto", ctx);
      expect(result).toBe(true);
      expect(ctx.session.agent.pipeline.setMode).toHaveBeenCalledWith("auto");
    });

    it("rejects invalid mode", async () => {
      const ctx = createMockContext();
      const result = await handleSlashCommand("/mode invalid", ctx);
      expect(result).toBe(true);
      expect(ctx.addSystemMessage).toHaveBeenCalledWith(
        expect.stringContaining("無効"),
      );
    });
  });

  describe("/model", () => {
    it("switches model", async () => {
      const ctx = createMockContext();
      const result = await handleSlashCommand("/model gemini-3.1-pro-preview", ctx);
      expect(result).toBe(true);
      expect(ctx.switchModel).toHaveBeenCalledWith("gemini-3.1-pro-preview");
    });

    it("blocks model switch during streaming", async () => {
      const ctx = createMockContext({ status: "streaming" });
      const result = await handleSlashCommand("/model gpt-5.2", ctx);
      expect(result).toBe(true);
      expect(ctx.switchModel).not.toHaveBeenCalled();
      expect(ctx.addSystemMessage).toHaveBeenCalledWith(
        expect.stringContaining("推論中"),
      );
    });
  });

  describe("unknown commands", () => {
    it("returns false for non-slash text", async () => {
      const ctx = createMockContext();
      const result = await handleSlashCommand("hello world", ctx);
      expect(result).toBe(false);
    });

    it("returns false for unknown slash command", async () => {
      const ctx = createMockContext();
      const result = await handleSlashCommand("/unknown", ctx);
      expect(result).toBe(false);
    });
  });
});
