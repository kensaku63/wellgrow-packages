import { appendFile, readFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";

const WELLGROW_DIR = join(homedir(), ".wellgrow");
const HISTORY_FILE = join(WELLGROW_DIR, "history.jsonl");

export interface HistoryEntry {
  session_id: string;
  agent: string;
  model: string;
  timestamp: string;
  summary: string;
  message_count: number;
}

export interface SessionRecorder {
  sessionId: string;
  recordUser: (content: string) => Promise<void>;
  recordAssistant: (content: string) => Promise<void>;
  finalize: (messageCount: number) => Promise<void>;
}

export async function createSessionRecorder(
  model: string,
  agent: string,
): Promise<SessionRecorder> {
  const sessionId = randomUUID();
  const now = new Date();
  const dateDir = join(
    WELLGROW_DIR,
    "sessions",
    String(now.getFullYear()),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  );
  await mkdir(dateDir, { recursive: true });

  const sessionFile = join(dateDir, `${sessionId}.jsonl`);
  let firstUserMessage = "";

  const meta = JSON.stringify({
    type: "meta",
    agent,
    model,
    timestamp: now.toISOString(),
  });
  await appendFile(sessionFile, meta + "\n", "utf-8");

  return {
    sessionId,

    async recordUser(content: string) {
      if (!firstUserMessage) {
        firstUserMessage = content.slice(0, 50);
      }
      const entry = JSON.stringify({
        type: "user",
        timestamp: new Date().toISOString(),
        content,
      });
      await appendFile(sessionFile, entry + "\n", "utf-8");
    },

    async recordAssistant(content: string) {
      const entry = JSON.stringify({
        type: "assistant",
        timestamp: new Date().toISOString(),
        content: content.slice(0, 500),
      });
      await appendFile(sessionFile, entry + "\n", "utf-8");
    },

    async finalize(messageCount: number) {
      await mkdir(WELLGROW_DIR, { recursive: true });
      const historyEntry = JSON.stringify({
        session_id: sessionId,
        agent,
        model,
        timestamp: now.toISOString(),
        summary: firstUserMessage || "(空セッション)",
        message_count: messageCount,
      } satisfies HistoryEntry);
      await appendFile(HISTORY_FILE, historyEntry + "\n", "utf-8");
    },
  };
}

export async function listHistory(limit = 20): Promise<HistoryEntry[]> {
  try {
    const content = await readFile(HISTORY_FILE, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    return lines
      .map((line) => JSON.parse(line) as HistoryEntry)
      .reverse()
      .slice(0, limit);
  } catch {
    return [];
  }
}

export async function getSessionContent(sessionId: string): Promise<string | null> {
  const sessionsDir = join(WELLGROW_DIR, "sessions");
  try {
    const years = await readdir(sessionsDir);
    for (const year of years) {
      const months = await readdir(join(sessionsDir, year));
      for (const month of months) {
        const days = await readdir(join(sessionsDir, year, month));
        for (const day of days) {
          const files = await readdir(join(sessionsDir, year, month, day));
          const match = files.find((f) => f.startsWith(sessionId));
          if (match) {
            return readFile(join(sessionsDir, year, month, day, match), "utf-8");
          }
        }
      }
    }
  } catch {
    // ignore
  }
  return null;
}
