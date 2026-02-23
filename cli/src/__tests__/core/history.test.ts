import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { createTempWorkspace, type TempWorkspace } from "../helpers/temp-workspace.js";

const mockHome = vi.hoisted(() => {
  let dir = "/tmp/test-home";
  return { get: () => dir, set: (d: string) => { dir = d; } };
});

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, homedir: () => mockHome.get() };
});

let testHome: TempWorkspace;

beforeEach(async () => {
  testHome = await createTempWorkspace();
  mockHome.set(testHome.dir);
  vi.resetModules();
});

afterEach(async () => {
  await testHome.cleanup();
});

describe("createSessionRecorder", () => {
  it("creates session file with meta entry", async () => {
    const { createSessionRecorder } = await import("../../core/history.js");
    const recorder = await createSessionRecorder("claude-opus-4-6", "joy");

    expect(recorder.sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );

    const sessionsDir = join(testHome.dir, ".wellgrow", "sessions");
    const years = await readdir(sessionsDir);
    expect(years.length).toBeGreaterThan(0);
  });

  it("records user message", async () => {
    const { createSessionRecorder } = await import("../../core/history.js");
    const recorder = await createSessionRecorder("claude-opus-4-6", "joy");
    await recorder.recordUser("こんにちは");

    const sessionsDir = join(testHome.dir, ".wellgrow", "sessions");
    const years = await readdir(sessionsDir);
    const months = await readdir(join(sessionsDir, years[0]));
    const days = await readdir(join(sessionsDir, years[0], months[0]));
    const files = await readdir(join(sessionsDir, years[0], months[0], days[0]));
    const content = await readFile(
      join(sessionsDir, years[0], months[0], days[0], files[0]),
      "utf-8",
    );
    const lines = content.trim().split("\n");
    const userEntry = JSON.parse(lines[1]);
    expect(userEntry.type).toBe("user");
    expect(userEntry.content).toBe("こんにちは");
  });

  it("records assistant message truncated to 500 chars", async () => {
    const { createSessionRecorder } = await import("../../core/history.js");
    const recorder = await createSessionRecorder("claude-opus-4-6", "joy");
    const longText = "x".repeat(1000);
    await recorder.recordAssistant(longText);

    const sessionsDir = join(testHome.dir, ".wellgrow", "sessions");
    const years = await readdir(sessionsDir);
    const months = await readdir(join(sessionsDir, years[0]));
    const days = await readdir(join(sessionsDir, years[0], months[0]));
    const files = await readdir(join(sessionsDir, years[0], months[0], days[0]));
    const content = await readFile(
      join(sessionsDir, years[0], months[0], days[0], files[0]),
      "utf-8",
    );
    const lines = content.trim().split("\n");
    const assistantEntry = JSON.parse(lines[1]);
    expect(assistantEntry.content.length).toBe(500);
  });

  it("finalizes session to history file", async () => {
    const { createSessionRecorder } = await import("../../core/history.js");
    const recorder = await createSessionRecorder("claude-opus-4-6", "joy");
    await recorder.recordUser("テストメッセージ");
    await recorder.finalize(3);

    const historyFile = join(testHome.dir, ".wellgrow", "history.jsonl");
    const content = await readFile(historyFile, "utf-8");
    const entry = JSON.parse(content.trim());
    expect(entry.session_id).toBe(recorder.sessionId);
    expect(entry.agent).toBe("joy");
    expect(entry.model).toBe("claude-opus-4-6");
    expect(entry.message_count).toBe(3);
    expect(entry.summary).toBe("テストメッセージ");
  });

  it("uses placeholder summary for empty session", async () => {
    const { createSessionRecorder } = await import("../../core/history.js");
    const recorder = await createSessionRecorder("claude-opus-4-6", "joy");
    await recorder.finalize(0);

    const historyFile = join(testHome.dir, ".wellgrow", "history.jsonl");
    const content = await readFile(historyFile, "utf-8");
    const entry = JSON.parse(content.trim());
    expect(entry.summary).toBe("(空セッション)");
  });
});

describe("listHistory", () => {
  it("returns empty array when history file missing", async () => {
    const { listHistory } = await import("../../core/history.js");
    const result = await listHistory();
    expect(result).toEqual([]);
  });

  it("returns entries in reverse chronological order", async () => {
    const { createSessionRecorder, listHistory } = await import("../../core/history.js");

    const r1 = await createSessionRecorder("model", "agent");
    await r1.recordUser("first");
    await r1.finalize(1);

    const r2 = await createSessionRecorder("model", "agent");
    await r2.recordUser("second");
    await r2.finalize(1);

    const history = await listHistory();
    expect(history).toHaveLength(2);
    expect(history[0].summary).toBe("second");
    expect(history[1].summary).toBe("first");
  });

  it("respects limit parameter", async () => {
    const { createSessionRecorder, listHistory } = await import("../../core/history.js");

    for (let i = 0; i < 5; i++) {
      const r = await createSessionRecorder("model", "agent");
      await r.recordUser(`msg ${i}`);
      await r.finalize(1);
    }

    const history = await listHistory(2);
    expect(history).toHaveLength(2);
  });
});

describe("getSessionContent", () => {
  it("returns null for unknown session id", async () => {
    const { getSessionContent } = await import("../../core/history.js");
    const result = await getSessionContent("nonexistent-id");
    expect(result).toBeNull();
  });

  it("returns file content for existing session", async () => {
    const { createSessionRecorder, getSessionContent } = await import("../../core/history.js");
    const recorder = await createSessionRecorder("model", "agent");
    await recorder.recordUser("hello");

    const content = await getSessionContent(recorder.sessionId);
    expect(content).not.toBeNull();
    expect(content).toContain('"type":"user"');
    expect(content).toContain("hello");
  });
});
