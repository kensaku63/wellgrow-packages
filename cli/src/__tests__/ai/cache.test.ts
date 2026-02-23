import { describe, it, expect } from "vitest";
import type { ModelMessage } from "ai";
import { prepareCachedMessages } from "../../ai/cache.js";

const CACHE_KEY = "anthropic";

function userMsg(content: string): ModelMessage {
  return { role: "user", content } as ModelMessage;
}

function assistantMsg(content: string): ModelMessage {
  return { role: "assistant", content } as ModelMessage;
}

function toolMsg(content: string): ModelMessage {
  return { role: "tool", content } as ModelMessage;
}

describe("prepareCachedMessages", () => {
  it("prepends system message with cache breakpoint", () => {
    const result = prepareCachedMessages("You are helpful.", []);
    expect(result[0]).toMatchObject({
      role: "system",
      content: "You are helpful.",
    });
    expect(result[0].providerOptions).toHaveProperty(CACHE_KEY);
  });

  it("adds cache breakpoint to last user message", () => {
    const messages: ModelMessage[] = [
      userMsg("hello"),
      assistantMsg("hi"),
      userMsg("how are you?"),
    ];

    const result = prepareCachedMessages("system", messages);
    const lastUser = result[3];
    expect(lastUser.role).toBe("user");
    expect(lastUser.providerOptions).toHaveProperty(CACHE_KEY);
  });

  it("adds cache breakpoint to last tool message", () => {
    const messages: ModelMessage[] = [
      userMsg("call tool"),
      assistantMsg("ok"),
      toolMsg("result"),
    ];

    const result = prepareCachedMessages("system", messages);
    const lastTool = result[3];
    expect(lastTool.role).toBe("tool");
    expect(lastTool.providerOptions).toHaveProperty(CACHE_KEY);
  });

  it("does not add breakpoint to intermediate messages", () => {
    const messages: ModelMessage[] = [
      userMsg("first"),
      assistantMsg("reply"),
      userMsg("second"),
    ];

    const result = prepareCachedMessages("system", messages);
    const firstUserInResult = result[1];
    expect(firstUserInResult.providerOptions).toBeUndefined();
  });

  it("handles empty messages array", () => {
    const result = prepareCachedMessages("system", []);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("system");
  });

  it("handles messages with only assistant roles", () => {
    const messages: ModelMessage[] = [assistantMsg("no user msg")];

    const result = prepareCachedMessages("system", messages);
    expect(result).toHaveLength(2);
    expect(result[1].providerOptions).toBeUndefined();
  });

  it("preserves existing providerOptions on target message", () => {
    const messages: ModelMessage[] = [
      { role: "user", content: "test", providerOptions: { custom: "value" } } as ModelMessage,
    ];

    const result = prepareCachedMessages("system", messages);
    expect(result[1].providerOptions).toHaveProperty("custom", "value");
    expect(result[1].providerOptions).toHaveProperty(CACHE_KEY);
  });

  it("does not mutate original messages", () => {
    const messages: ModelMessage[] = [userMsg("original")];
    const originalRef = messages[0];

    prepareCachedMessages("system", messages);

    expect(originalRef.providerOptions).toBeUndefined();
  });
});
