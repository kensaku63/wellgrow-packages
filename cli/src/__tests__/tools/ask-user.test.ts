import { describe, it, expect } from "vitest";
import {
  createAskUserState,
  getNextPendingAskUser,
  getPendingAskUserCount,
  resolveAskUser,
  cancelAllPendingAskUser,
  type AskUserState,
  type AskUserQuestion,
  type AskUserAnswer,
} from "../../tools/ask-user.js";

function makeQuestion(id: string): AskUserQuestion {
  return {
    question: `Question ${id}`,
    header: `Q${id}`,
    options: [
      { label: "A", description: "Option A" },
      { label: "B", description: "Option B" },
    ],
    multiSelect: false,
  };
}

function addPendingEntry(
  state: AskUserState,
  toolCallId: string,
  questions: AskUserQuestion[],
): Promise<{
  questions: AskUserQuestion[];
  answers: Record<string, AskUserAnswer>;
}> {
  return new Promise((resolve, reject) => {
    state.pendingMap.set(toolCallId, {
      toolCallId,
      questions,
      resolve: (answers) => resolve({ questions, answers }),
      reject,
    });
    state.pendingOrder.push(toolCallId);
  });
}

describe("AskUser state management", () => {
  describe("createAskUserState", () => {
    it("creates empty state", () => {
      const state = createAskUserState();
      expect(state.pendingMap.size).toBe(0);
      expect(state.pendingOrder).toEqual([]);
    });
  });

  describe("getNextPendingAskUser", () => {
    it("returns null on empty state", () => {
      const state = createAskUserState();
      expect(getNextPendingAskUser(state)).toBeNull();
    });

    it("returns the first pending item", () => {
      const state = createAskUserState();
      addPendingEntry(state, "call-1", [makeQuestion("1")]);
      addPendingEntry(state, "call-2", [makeQuestion("2")]);

      const next = getNextPendingAskUser(state);
      expect(next).not.toBeNull();
      expect(next!.toolCallId).toBe("call-1");
      expect(next!.questions[0].question).toBe("Question 1");
    });

    it("returns null when pendingOrder has stale id not in pendingMap", () => {
      const state = createAskUserState();
      state.pendingOrder.push("stale-id");

      expect(getNextPendingAskUser(state)).toBeNull();
    });
  });

  describe("getPendingAskUserCount", () => {
    it("returns 0 on empty state", () => {
      const state = createAskUserState();
      expect(getPendingAskUserCount(state)).toBe(0);
    });

    it("counts pending items", () => {
      const state = createAskUserState();
      addPendingEntry(state, "call-1", [makeQuestion("1")]);
      addPendingEntry(state, "call-2", [makeQuestion("2")]);

      expect(getPendingAskUserCount(state)).toBe(2);
    });
  });

  describe("resolveAskUser", () => {
    it("resolves the promise with answers", async () => {
      const state = createAskUserState();
      const promise = addPendingEntry(state, "call-1", [makeQuestion("1")]);

      const answers = { "0": { selected: ["A"] } };
      resolveAskUser(state, "call-1", answers);

      const result = await promise;
      expect(result.answers).toEqual(answers);
      expect(result.questions[0].question).toBe("Question 1");
    });

    it("removes from pendingMap and pendingOrder", () => {
      const state = createAskUserState();
      addPendingEntry(state, "call-1", [makeQuestion("1")]);

      resolveAskUser(state, "call-1", { "0": { selected: ["A"] } });

      expect(state.pendingMap.size).toBe(0);
      expect(state.pendingOrder).toEqual([]);
    });

    it("does nothing for non-existent toolCallId", () => {
      const state = createAskUserState();
      addPendingEntry(state, "call-1", [makeQuestion("1")]);

      resolveAskUser(state, "non-existent", {});

      expect(state.pendingMap.size).toBe(1);
      expect(state.pendingOrder.length).toBe(1);
    });

    it("preserves other pending items", () => {
      const state = createAskUserState();
      addPendingEntry(state, "call-1", [makeQuestion("1")]);
      addPendingEntry(state, "call-2", [makeQuestion("2")]);

      resolveAskUser(state, "call-1", { "0": { selected: ["A"] } });

      expect(state.pendingMap.size).toBe(1);
      expect(state.pendingOrder).toEqual(["call-2"]);
      expect(getNextPendingAskUser(state)!.toolCallId).toBe("call-2");
    });
  });

  describe("cancelAllPendingAskUser", () => {
    it("rejects all pending promises", async () => {
      const state = createAskUserState();
      const p1 = addPendingEntry(state, "call-1", [makeQuestion("1")]);
      const p2 = addPendingEntry(state, "call-2", [makeQuestion("2")]);

      cancelAllPendingAskUser(state);

      await expect(p1).rejects.toThrow("AskUser cancelled");
      await expect(p2).rejects.toThrow("AskUser cancelled");
    });

    it("clears all state", () => {
      const state = createAskUserState();
      const p1 = addPendingEntry(state, "call-1", [makeQuestion("1")]);
      const p2 = addPendingEntry(state, "call-2", [makeQuestion("2")]);
      p1.catch(() => {});
      p2.catch(() => {});

      cancelAllPendingAskUser(state);

      expect(state.pendingMap.size).toBe(0);
      expect(state.pendingOrder.length).toBe(0);
    });

    it("is safe to call on empty state", () => {
      const state = createAskUserState();
      cancelAllPendingAskUser(state);

      expect(state.pendingMap.size).toBe(0);
      expect(state.pendingOrder.length).toBe(0);
    });
  });

  describe("FIFO ordering", () => {
    it("returns items in insertion order", () => {
      const state = createAskUserState();
      addPendingEntry(state, "call-a", [makeQuestion("A")]);
      addPendingEntry(state, "call-b", [makeQuestion("B")]);
      addPendingEntry(state, "call-c", [makeQuestion("C")]);

      expect(getNextPendingAskUser(state)!.toolCallId).toBe("call-a");

      resolveAskUser(state, "call-a", {});
      expect(getNextPendingAskUser(state)!.toolCallId).toBe("call-b");

      resolveAskUser(state, "call-b", {});
      expect(getNextPendingAskUser(state)!.toolCallId).toBe("call-c");
    });

    it("resolving middle item does not break order", () => {
      const state = createAskUserState();
      addPendingEntry(state, "call-a", [makeQuestion("A")]);
      addPendingEntry(state, "call-b", [makeQuestion("B")]);
      addPendingEntry(state, "call-c", [makeQuestion("C")]);

      resolveAskUser(state, "call-b", {});

      expect(getNextPendingAskUser(state)!.toolCallId).toBe("call-a");
      expect(state.pendingOrder).toEqual(["call-a", "call-c"]);
    });
  });
});
