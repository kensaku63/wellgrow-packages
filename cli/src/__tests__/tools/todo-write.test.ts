import { describe, it, expect } from "vitest";
import { TodoWriteTool, getCurrentTodos, type TodoItem } from "../../tools/todo-write.js";
import { createTestSessionContext } from "../helpers/test-context.js";

function createAgentState(initial: TodoItem[] = []) {
  return { todos: initial };
}

describe("TodoWriteTool", () => {
  it("has correct metadata", () => {
    expect(TodoWriteTool.name).toBe("TodoWrite");
    expect(TodoWriteTool.category).toBe("internal");
  });

  it("overwrites todos and returns old and new", () => {
    const state = createAgentState([
      { content: "old task", status: "pending", activeForm: "準備中" },
    ]);
    const session = createTestSessionContext();
    (session as unknown as { agent: unknown }).agent = state;

    const newTodos: TodoItem[] = [
      { content: "new task", status: "in_progress", activeForm: "作業中" },
    ];

    const result = TodoWriteTool.execute(
      { todos: newTodos },
      { session, toolCallId: "call-1" },
    );

    expect(result.oldTodos).toEqual([
      { content: "old task", status: "pending", activeForm: "準備中" },
    ]);
    expect(result.newTodos).toEqual(newTodos);
  });

  it("mutates the agent state directly", () => {
    const state = createAgentState();
    const session = createTestSessionContext();
    (session as unknown as { agent: unknown }).agent = state;

    const newTodos: TodoItem[] = [
      { content: "task", status: "pending", activeForm: "準備中" },
    ];

    TodoWriteTool.execute(
      { todos: newTodos },
      { session, toolCallId: "call-1" },
    );

    expect(state.todos).toEqual(newTodos);
  });

  it("handles empty todo list", () => {
    const state = createAgentState([
      { content: "existing", status: "completed", activeForm: "完了" },
    ]);
    const session = createTestSessionContext();
    (session as unknown as { agent: unknown }).agent = state;

    const result = TodoWriteTool.execute(
      { todos: [] },
      { session, toolCallId: "call-1" },
    );

    expect(result.oldTodos).toHaveLength(1);
    expect(result.newTodos).toHaveLength(0);
    expect(state.todos).toEqual([]);
  });
});

describe("getCurrentTodos", () => {
  it("returns current todos from state", () => {
    const todos: TodoItem[] = [
      { content: "a", status: "pending", activeForm: "準備中" },
      { content: "b", status: "in_progress", activeForm: "作業中" },
    ];
    const state = createAgentState(todos);
    expect(getCurrentTodos(state)).toEqual(todos);
  });

  it("returns empty array when no todos", () => {
    const state = createAgentState();
    expect(getCurrentTodos(state)).toEqual([]);
  });
});

describe("TodoWriteTool uiHooks", () => {
  it("onComplete returns todoUpdate event", () => {
    const newTodos: TodoItem[] = [
      { content: "task", status: "pending", activeForm: "準備中" },
    ];
    const output = { oldTodos: [], newTodos };

    const event = TodoWriteTool.uiHooks!.onComplete!({}, output);
    expect(event).toEqual({
      type: "todoUpdate",
      todos: newTodos,
    });
  });
});
