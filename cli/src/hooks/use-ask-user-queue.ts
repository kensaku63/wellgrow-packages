import { useState, useCallback } from "react";
import type { AskUserQuestion, AskUserAnswer } from "../tools/ask-user.js";
import {
  resolveAskUser,
  getNextPendingAskUser,
  getPendingAskUserCount,
  cancelAllPendingAskUser,
  type AskUserState,
} from "../tools/ask-user.js";

export interface AskUserQueueState {
  activeAskUser: {
    toolCallId: string;
    questions: AskUserQuestion[];
  } | null;
  askUserQueueSize: number;
  advanceQueue: () => void;
  handleComplete: (answers: Record<string, AskUserAnswer>) => void;
  cancelAll: () => void;
}

export function useAskUserQueue(
  getAskUserState: () => AskUserState | null,
): AskUserQueueState {
  const [activeAskUser, setActiveAskUser] = useState<{
    toolCallId: string;
    questions: AskUserQuestion[];
  } | null>(null);
  const [askUserQueueSize, setAskUserQueueSize] = useState(0);

  const advanceQueue = useCallback(() => {
    const state = getAskUserState();
    if (!state) return;
    const next = getNextPendingAskUser(state);
    if (next) {
      setActiveAskUser(next);
      setAskUserQueueSize(getPendingAskUserCount(state));
    } else {
      setActiveAskUser(null);
      setAskUserQueueSize(0);
    }
  }, [getAskUserState]);

  const handleComplete = useCallback(
    (answers: Record<string, AskUserAnswer>) => {
      const state = getAskUserState();
      if (activeAskUser && state) {
        resolveAskUser(state, activeAskUser.toolCallId, answers);
      }
      advanceQueue();
    },
    [activeAskUser, advanceQueue, getAskUserState],
  );

  const cancelAll = useCallback(() => {
    const state = getAskUserState();
    if (state) {
      cancelAllPendingAskUser(state);
    }
    setActiveAskUser(null);
    setAskUserQueueSize(0);
  }, [getAskUserState]);

  return {
    activeAskUser,
    askUserQueueSize,
    advanceQueue,
    handleComplete,
    cancelAll,
  };
}
