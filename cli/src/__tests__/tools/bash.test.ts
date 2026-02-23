import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { executeBash, type BashState } from "../../tools/bash.js";
import {
  createTempWorkspace,
  type TempWorkspace,
} from "../helpers/temp-workspace.js";

function createBashState(cwd: string): BashState {
  return { cwd, nextTerminalId: 1 };
}

describe("Bash tool", () => {
  let ws: TempWorkspace;

  beforeEach(async () => {
    ws = await createTempWorkspace({
      "hello.txt": "hello world",
      "script.sh": '#!/bin/bash\necho "script output"',
    });
  });

  afterEach(async () => {
    await ws.cleanup();
  });

  it("executes a simple command", async () => {
    const state = createBashState(ws.dir);
    const result = await executeBash(state, { command: "echo hello" });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("hello");
    expect(result.interrupted).toBe(false);
  });

  it("captures stderr", async () => {
    const state = createBashState(ws.dir);
    const result = await executeBash(state, {
      command: "echo error >&2",
    });

    expect(result.stderr.trim()).toBe("error");
  });

  it("returns nonzero exit code on failure", async () => {
    const state = createBashState(ws.dir);
    const result = await executeBash(state, { command: "exit 42" });

    expect(result.exitCode).toBe(42);
  });

  it("tracks cwd changes from cd", async () => {
    const state = createBashState(ws.dir);
    await executeBash(state, { command: `mkdir -p ${ws.resolve("subdir")}` });
    await executeBash(state, { command: `cd ${ws.resolve("subdir")}` });

    expect(state.cwd).toBe(ws.resolve("subdir"));
  });

  it("uses working_directory parameter", async () => {
    const state = createBashState(ws.dir);
    const result = await executeBash(state, {
      command: "pwd",
      working_directory: ws.dir,
    });

    expect(result.stdout.trim()).toBe(ws.dir);
  });

  it("handles command not found", async () => {
    const state = createBashState(ws.dir);
    const result = await executeBash(state, {
      command: "nonexistent_command_xyz_12345",
    });

    expect(result.exitCode).not.toBe(0);
  });

  it("respects timeout", async () => {
    const state = createBashState(ws.dir);
    const result = await executeBash(state, {
      command: "sleep 60",
      timeout: 500,
    });

    // Should either be backgrounded (timeout triggers background) or interrupted
    expect(
      result.backgroundTaskId !== undefined || result.exitCode !== 0,
    ).toBe(true);
  }, 10_000);

  it("supports abort signal", async () => {
    const ac = new AbortController();
    const state = createBashState(ws.dir);

    setTimeout(() => ac.abort(), 200);

    const result = await executeBash(
      state,
      { command: "sleep 30" },
      ac.signal,
    );

    expect(result.interrupted).toBe(true);
  }, 10_000);

  it("handles piped commands", async () => {
    const state = createBashState(ws.dir);
    const result = await executeBash(state, {
      command: "echo -e 'a\\nb\\nc' | wc -l",
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("3");
  });

  it("handles chained commands with &&", async () => {
    const state = createBashState(ws.dir);
    const result = await executeBash(state, {
      command: "echo first && echo second",
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("first");
    expect(result.stdout).toContain("second");
  });

  it("sets noOutputExpected for silent success", async () => {
    const state = createBashState(ws.dir);
    const result = await executeBash(state, { command: "true" });

    expect(result.exitCode).toBe(0);
    expect(result.noOutputExpected).toBe(true);
  });
});
