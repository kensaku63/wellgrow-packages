import { Box, Text } from "ink";
import remend from "remend";
import { renderMarkdown } from "./markdown.js";
import { colors } from "./colors.js";

export type MessagePart =
  | { type: "text"; text: string; state?: "streaming" | "done" }
  | { type: "reasoning"; text: string; state?: "streaming" | "done" }
  | {
      type: "tool";
      toolCallId: string;
      toolName: string;
      state:
        | "input-streaming"
        | "input-available"
        | "output-available"
        | "output-error"
        | "output-denied";
      input?: unknown;
      output?: unknown;
      errorText?: string;
    }
  | { type: "step-start" }
  | { type: "source-url"; url: string; title?: string };

export interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  parts: MessagePart[];
  interrupted?: boolean;
  sealed?: boolean;
}

interface MessageItemProps {
  message: DisplayMessage;
}

export function MessageItem({ message }: MessageItemProps) {
  if (message.role === "user") {
    const text = message.parts
      .filter(
        (p): p is Extract<MessagePart, { type: "text" }> => p.type === "text",
      )
      .map((p) => p.text)
      .join("");

    return (
      <Box
        borderStyle="bold"
        borderLeft
        borderTop={false}
        borderBottom={false}
        borderRight={false}
        borderColor={colors.joy}
        paddingLeft={1}
      >
        <Text>{text}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {message.parts.map((part, i) => {
        switch (part.type) {
          case "text":
            return part.text ? (
              <Text key={`text-${i}`}>
                {renderMarkdown(
                  part.state === "streaming"
                    ? remend(part.text)
                    : part.text,
                )}
              </Text>
            ) : null;
          case "reasoning":
            return part.text ? (
              <Text key={`reasoning-${i}`} color={colors.fog} dimColor>
                {part.text}
              </Text>
            ) : null;
          case "tool":
            return <ToolStatus key={part.toolCallId} part={part} />;
          case "step-start":
            return i > 0 ? (
              <Text key={`step-${i}`} color={colors.fog}>
                ✦
              </Text>
            ) : null;
          case "source-url":
            return (
              <Text key={`source-${i}`} color={colors.fog}>
                📎 {part.title ?? part.url}
              </Text>
            );
        }
      })}
      {message.interrupted && (
        <Text color={colors.fog}>⏎ 中断しました</Text>
      )}
    </Box>
  );
}

function ToolStatus({
  part,
}: {
  part: Extract<MessagePart, { type: "tool" }>;
}) {
  switch (part.state) {
    case "input-streaming":
    case "input-available":
      return (
        <Text color={colors.fog}>
          ⋯ {part.toolName}
        </Text>
      );
    case "output-available":
      return null;
    case "output-denied":
      return (
        <Text color={colors.fog}>
          ⊘ {part.toolName}{part.errorText ? `: ${part.errorText}` : ""}
        </Text>
      );
    case "output-error":
      return (
        <Box flexDirection="column">
          <Text color={colors.energy}>
            ✗ {part.toolName}
          </Text>
          {part.errorText && (
            <Text color={colors.energy} dimColor>
              {"  "}{part.errorText}
            </Text>
          )}
        </Box>
      );
  }
}
