import { useState, useCallback, useRef, useEffect } from "react";
import { useInput } from "ink";
import { sendMessage } from "../core/session.js";
import type { TurnUsage } from "../ai/cache.js";
import type { TodoItem } from "../tools/todo-write.js";
import type { WellGrowConfig } from "../config/types.js";
import type {
  ApprovalRequest,
  ApprovalDecision,
} from "../ui/approval-prompt.js";
import type { Mode } from "../tools/pipeline.js";
import {
  createAbortController,
  clearAbortState,
} from "../signals.js";
import { formatErrorMessage } from "../ai/retry.js";
import { useChatSession } from "./use-chat-session.js";
import { useChatMessages, extractText } from "./use-chat-messages.js";
import { useAskUserQueue } from "./use-ask-user-queue.js";
import { handleSlashCommand } from "./slash-commands.js";

export type ChatStatus = "ready" | "submitted" | "streaming" | "error";

export interface RetryInfo {
  attempt: number;
  maxRetries: number;
  delayMs: number;
}

export interface UseChatOptions {
  agentName?: string;
  modelOverride?: string;
  config: WellGrowConfig;
  mode?: Mode;
  verbose?: boolean;
  initialMessage?: string;
  onExit: () => void;
}

export function useChat({
  agentName,
  modelOverride,
  config,
  mode: initialMode,
  verbose,
  initialMessage,
  onExit,
}: UseChatOptions) {
  const {
    session,
    recorder,
    isReady,
    currentModelName,
    currentAgentName,
    currentAgentIcon,
    agents,
    messageCountRef,
    switchModel,
    switchAgent,
    resetSession,
  } = useChatSession({
    agentName,
    modelOverride,
    config,
    mode: initialMode,
    verbose,
  });

  const {
    messages,
    messagesRef,
    addUserAndAssistant,
    updateAssistantParts,
    markInterrupted,
    setAssistantError,
    addSystemMessage,
    clearMessages,
  } = useChatMessages();

  const {
    activeAskUser,
    askUserQueueSize,
    advanceQueue,
    handleComplete: handleAskUserComplete,
    cancelAll: cancelAllAskUser,
  } = useAskUserQueue(
    useCallback(
      () => session?.ctx.agent.askUser ?? null,
      [session],
    ),
  );

  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [retryInfo, setRetryInfo] = useState<RetryInfo | null>(null);
  const [status, setStatus] = useState<ChatStatus>("ready");
  const [activeApproval, setActiveApproval] = useState<ApprovalRequest | null>(
    null,
  );
  const [mode, setMode] = useState<Mode>(
    initialMode ?? config.default.mode,
  );

  const approvalResolverRef = useRef<
    ((decision: ApprovalDecision) => void) | null
  >(null);

  const interruptedRef = useRef(false);
  const lastUsageRef = useRef<TurnUsage | null>(null);
  const streamStartedRef = useRef(false);
  const initialMessageSentRef = useRef(false);
  const handleSubmitRef = useRef<(text: string) => void>(() => {});

  useInput(
    (_input, key) => {
      if (key.escape) {
        const ac = session?.ctx.abort.userAbortController;
        if (ac && !ac.signal.aborted) {
          interruptedRef.current = true;
          ac.abort();
        }
      }
    },
    {
      isActive:
        (status === "submitted" || status === "streaming") &&
        !activeAskUser &&
        !activeApproval,
    },
  );

  const handleApprovalDecision = useCallback((decision: ApprovalDecision) => {
    setActiveApproval(null);
    approvalResolverRef.current?.(decision);
    approvalResolverRef.current = null;
  }, []);

  const handleModeToggle = useCallback(() => {
    if (!session) return;
    const newMode: Mode = mode === "plan" ? "auto" : "plan";
    session.agent.pipeline.setMode(newMode);
    setMode(newMode);
  }, [session, mode]);

  const handleSubmit = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !session) return;

      const handled = await handleSlashCommand(trimmed, {
        session,
        status,
        mode,
        currentAgentName,
        currentAgentIcon,
        recorder,
        messageCountRef,
        cancelAllAskUser,
        resetSession,
        clearMessages,
        setTodos,
        setMode,
        switchModel,
        switchAgent,
        addSystemMessage,
        submitPrompt: (prompt: string) => {
          setTimeout(() => handleSubmitRef.current(prompt), 0);
        },
        onExit,
      });
      if (handled) return;

      addUserAndAssistant(trimmed);
      setStatus("submitted");
      streamStartedRef.current = false;
      setRetryInfo(null);
      interruptedRef.current = false;

      recorder?.recordUser(trimmed).catch(() => {});
      messageCountRef.current++;

      const ac = createAbortController(session.ctx.abort, config.api.timeout);
      try {
        const { fullText, parts: finalParts } = await sendMessage(
          session,
          trimmed,
          {
            onMessageUpdate: (parts) => {
              if (!streamStartedRef.current) {
                streamStartedRef.current = true;
                setStatus("streaming");
              }
              updateAssistantParts(parts);
            },
            onRetry: (attempt, maxRetries, delayMs) => {
              setRetryInfo({ attempt, maxRetries, delayMs });
            },
            onUsage: (usage) => {
              lastUsageRef.current = usage;
            },
            onToolUIEvent: (event) => {
              switch (event.type) {
                case "todoUpdate":
                  setTodos(event.todos as TodoItem[]);
                  break;
                case "askUser":
                  advanceQueue();
                  break;
              }
            },
            onApprovalRequest: (request) => {
              return new Promise<ApprovalDecision>((resolve) => {
                approvalResolverRef.current = resolve;
                setActiveApproval(request);
              });
            },
          },
          {
            abortSignal: ac.signal,
            maxRetries: config.api.max_retries,
            maxOutputTokens: config.default.max_output_tokens,
          },
        );

        const wasInterrupted = interruptedRef.current;

        if (wasInterrupted) {
          markInterrupted();
        }

        const contentForRecording = wasInterrupted
          ? (() => {
              const lastMsg =
                messagesRef.current[messagesRef.current.length - 1];
              return lastMsg ? extractText(lastMsg) : "";
            })()
          : fullText;

        if (contentForRecording) {
          recorder?.recordAssistant(contentForRecording).catch(() => {});
          messageCountRef.current++;
        }

        updateAssistantParts(finalParts);
      } catch (error) {
        if (interruptedRef.current) {
          markInterrupted();
          const lastMsg =
            messagesRef.current[messagesRef.current.length - 1];
          const partialText = lastMsg ? extractText(lastMsg) : "";
          if (partialText) {
            await recorder
              ?.recordAssistant(partialText)
              .catch(() => {});
            messageCountRef.current++;
          }
        } else {
          setAssistantError(formatErrorMessage(error));
        }
      } finally {
        interruptedRef.current = false;
        clearAbortState(session.ctx.abort);
        setTodos([]);
        setRetryInfo(null);
        setActiveApproval(null);
        approvalResolverRef.current = null;
        setStatus("ready");
      }
    },
    [
      session,
      recorder,
      onExit,
      config,
      status,
      mode,
      currentAgentName,
      currentAgentIcon,
      messageCountRef,
      cancelAllAskUser,
      resetSession,
      clearMessages,
      switchModel,
      switchAgent,
      addSystemMessage,
      addUserAndAssistant,
      updateAssistantParts,
      markInterrupted,
      setAssistantError,
      messagesRef,
      advanceQueue,
    ],
  );

  handleSubmitRef.current = handleSubmit;

  useEffect(() => {
    if (isReady && initialMessage && !initialMessageSentRef.current) {
      initialMessageSentRef.current = true;
      void handleSubmitRef.current(initialMessage);
    }
  }, [isReady, initialMessage]);

  return {
    messages,
    todos,
    retryInfo,
    status,
    isReady,
    currentModelName,
    currentAgentName,
    currentAgentIcon,
    mode,
    agents,
    activeAskUser,
    askUserQueueSize,
    activeApproval,
    lastUsage: lastUsageRef.current,
    handleSubmit,
    handleModeToggle,
    handleAskUserComplete,
    handleApprovalDecision,
  };
}
