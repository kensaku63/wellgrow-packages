import { useMemo } from "react";
import { Box, Text, Static, useApp } from "ink";
import { Header } from "./header.js";
import { MessageItem, type DisplayMessage } from "./message-list.js";
import { TodoList } from "./todo-list.js";
import { AskUserPrompt } from "./ask-user-prompt.js";
import { ApprovalPrompt } from "./approval-prompt.js";
import { InputPrompt } from "./input-prompt.js";
import { ThinkingIndicator } from "./thinking-indicator.js";
import { useChat } from "../hooks/use-chat.js";
import { MODEL_LIST } from "../ai/providers.js";
import type { WellGrowConfig } from "../config/types.js";

const MODEL_OPTIONS = MODEL_LIST.map((m) => ({ value: m.id, label: m.label }));
import type { Mode } from "../tools/pipeline.js";
import { colors } from "./colors.js";

type StaticEntry =
  | { kind: "header"; id: string }
  | { kind: "message"; id: string; data: DisplayMessage };

interface AppProps {
  agentName?: string;
  modelOverride?: string;
  config: WellGrowConfig;
  mode?: Mode;
  verbose?: boolean;
  initialMessage?: string;
}

export function App({ agentName, modelOverride, config, mode, verbose, initialMessage }: AppProps) {
  const { exit } = useApp();
  const {
    messages,
    todos,
    retryInfo,
    status,
    isReady,
    currentModelName,
    currentAgentName,
    currentAgentIcon,
    mode: currentMode,
    agents,
    activeAskUser,
    askUserQueueSize,
    activeApproval,
    handleSubmit,
    handleModeToggle,
    handleAskUserComplete,
    handleApprovalDecision,
  } = useChat({
    agentName,
    modelOverride,
    config,
    mode,
    verbose,
    initialMessage,
    onExit: exit,
  });

  const isActive = status === "submitted" || status === "streaming";
  const completedMessages = useMemo(
    () => (isActive ? messages.slice(0, -1) : messages),
    [messages, isActive],
  );
  const streamingMessage = isActive
    ? messages[messages.length - 1]
    : null;

  const staticItems = useMemo(
    (): StaticEntry[] => [
      { kind: "header", id: "__header__" },
      ...completedMessages.map(
        (m): StaticEntry => ({ kind: "message", id: m.id, data: m }),
      ),
    ],
    [completedMessages],
  );

  if (!isReady) return null;

  return (
    <Box flexDirection="column">
      <Static items={staticItems}>
        {(item) => {
          if (item.kind === "header") {
            return (
              <Box key={item.id}>
                <Header
                  agentName={currentAgentName}
                  agentIcon={currentAgentIcon}
                  modelName={currentModelName}
                />
              </Box>
            );
          }
          return (
            <Box
              key={item.id}
              flexDirection="column"
              marginBottom={item.data.sealed ? 0 : 1}
            >
              <MessageItem message={item.data} />
            </Box>
          );
        }}
      </Static>
      {retryInfo && (
        <Text color={colors.energy}>
          ⟳ API エラー。リトライ中... ({retryInfo.attempt}/
          {retryInfo.maxRetries},{" "}
          {Math.round(retryInfo.delayMs / 1000)}秒後)
        </Text>
      )}
      {status === "submitted" && <ThinkingIndicator />}
      {status === "streaming" && streamingMessage && !activeAskUser && !activeApproval && (
        <MessageItem message={streamingMessage} />
      )}
      <TodoList todos={todos} />
      {activeApproval && (
        <ApprovalPrompt
          request={activeApproval}
          onDecision={handleApprovalDecision}
        />
      )}
      {activeAskUser && !activeApproval && (
        <AskUserPrompt
          questions={activeAskUser.questions}
          queueSize={askUserQueueSize}
          onComplete={handleAskUserComplete}
        />
      )}
      {status === "ready" && !activeAskUser && !activeApproval && (
        <InputPrompt
          onSubmit={handleSubmit}
          onModeToggle={handleModeToggle}
          agents={agents}
          models={MODEL_OPTIONS}
          mode={currentMode}
        />
      )}
    </Box>
  );
}
