import { useState, useCallback, useRef } from "react";
import { randomUUID } from "node:crypto";
import type { DisplayMessage, MessagePart } from "../ui/message-list.js";

function makeMessage(
  role: "user" | "assistant",
  text: string,
): DisplayMessage {
  return {
    id: randomUUID(),
    role,
    parts: text ? [{ type: "text", text, state: "done" as const }] : [],
  };
}

function isPartCompleted(part: MessagePart): boolean {
  switch (part.type) {
    case "text":
    case "reasoning":
      return part.state === "done";
    case "tool":
      return part.state === "output-available"
        || part.state === "output-error"
        || part.state === "output-denied";
    case "step-start":
    case "source-url":
      return true;
  }
}

function countCompletedLeadingParts(parts: MessagePart[]): number {
  let count = 0;
  for (const p of parts) {
    if (isPartCompleted(p)) count++;
    else break;
  }
  return count;
}

export function extractText(message: DisplayMessage): string {
  return message.parts
    .filter(
      (p): p is Extract<MessagePart, { type: "text" }> => p.type === "text",
    )
    .map((p) => p.text)
    .join("");
}

export interface ChatMessagesState {
  messages: DisplayMessage[];
  messagesRef: React.MutableRefObject<DisplayMessage[]>;
  addUserAndAssistant: (userText: string) => void;
  updateAssistantParts: (parts: MessagePart[]) => void;
  markInterrupted: () => void;
  setAssistantError: (errorMessage: string) => void;
  addSystemMessage: (text: string) => void;
  clearMessages: () => void;
}

export function useChatMessages(): ChatMessagesState {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const messagesRef = useRef<DisplayMessage[]>([]);
  messagesRef.current = messages;
  const sealedCountRef = useRef(0);

  const addUserAndAssistant = useCallback((userText: string) => {
    sealedCountRef.current = 0;
    setMessages((prev) => [
      ...prev,
      makeMessage("user", userText),
      { id: randomUUID(), role: "assistant", parts: [] },
    ]);
  }, []);

  const updateAssistantParts = useCallback((parts: MessagePart[]) => {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (!last || last.role !== "assistant") return prev;

      const completedCount = countCompletedLeadingParts(parts);
      const alreadySealed = sealedCountRef.current;

      if (completedCount > alreadySealed && completedCount < parts.length) {
        const sealed: DisplayMessage = {
          id: `${last.id}-sealed-${completedCount}`,
          role: "assistant",
          parts: parts.slice(alreadySealed, completedCount),
          sealed: true,
        };
        sealedCountRef.current = completedCount;
        return [
          ...prev.slice(0, -1),
          sealed,
          { ...last, parts: parts.slice(completedCount) },
        ];
      }

      return [
        ...prev.slice(0, -1),
        { ...last, parts: parts.slice(alreadySealed) },
      ];
    });
  }, []);

  const markInterrupted = useCallback(() => {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (!last || last.role !== "assistant") return prev;
      return [...prev.slice(0, -1), { ...last, interrupted: true }];
    });
  }, []);

  const setAssistantError = useCallback((errorMessage: string) => {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (!last || last.role !== "assistant") return prev;
      return [
        ...prev.slice(0, -1),
        {
          ...last,
          parts: [
            {
              type: "text" as const,
              text: errorMessage,
              state: "done" as const,
            },
          ],
        },
      ];
    });
  }, []);

  const addSystemMessage = useCallback((text: string) => {
    setMessages((prev) => [...prev, makeMessage("assistant", text)]);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    messagesRef,
    addUserAndAssistant,
    updateAssistantParts,
    markInterrupted,
    setAssistantError,
    addSystemMessage,
    clearMessages,
  };
}
