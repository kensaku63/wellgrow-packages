import { Box, Text, useInput } from "ink";
import { colors } from "./colors.js";

export interface ApprovalRequest {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  source: string;
  category: string;
}

export type ApprovalDecision =
  | { action: "allow" }
  | { action: "deny" };

interface ApprovalPromptProps {
  request: ApprovalRequest;
  onDecision: (decision: ApprovalDecision) => void;
}

function formatToolPreview(toolName: string, args: Record<string, unknown>): string {
  if (toolName === "Bash") {
    return String(args.command ?? "");
  }
  if (toolName === "Write" || toolName === "Edit" || toolName === "Read") {
    return String(args.file_path ?? args.path ?? "");
  }
  if (toolName === "Glob") {
    return String(args.pattern ?? args.glob_pattern ?? "");
  }
  if (toolName === "Grep") {
    return String(args.pattern ?? "");
  }
  if (toolName.startsWith("mcp__")) {
    const parts = toolName.split("__");
    const server = parts[1] ?? "";
    const tool = parts.slice(2).join("__");
    return `${server}/${tool}`;
  }
  return JSON.stringify(args).slice(0, 120);
}

export function ApprovalPrompt({ request, onDecision }: ApprovalPromptProps) {
  useInput((input) => {
    const key = input.toLowerCase();
    if (key === "y") onDecision({ action: "allow" });
    if (key === "n") onDecision({ action: "deny" });
  });

  const preview = formatToolPreview(request.toolName, request.args);
  const sourceLabel = request.source === "mcp" ? " (MCP)" : "";
  const displayName = request.toolName.startsWith("mcp__")
    ? request.toolName.replace(/^mcp__/, "").replace(/__/g, "/")
    : request.toolName;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={colors.energy}
      paddingX={1}
      marginTop={1}
    >
      <Text color={colors.energy} bold>
        承認が必要です{sourceLabel}
      </Text>
      <Box marginTop={1}>
        <Text color={colors.insight} bold>{displayName}</Text>
      </Box>
      {preview && (
        <Box marginLeft={2}>
          <Text color={colors.fog}>{preview}</Text>
        </Box>
      )}
      <Box marginTop={1} gap={2}>
        <Text>
          <Text color={colors.growth} bold>[Y]</Text>
          <Text color={colors.fog}> 許可</Text>
        </Text>
        <Text>
          <Text color={colors.energy} bold>[N]</Text>
          <Text color={colors.fog}> 拒否</Text>
        </Text>
      </Box>
    </Box>
  );
}
