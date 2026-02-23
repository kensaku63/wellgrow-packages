import { Box, Text } from "ink";
import { colors } from "./colors.js";

interface HeaderProps {
  agentName?: string;
  agentIcon?: string;
  modelName: string;
}
export function Header({ agentName, agentIcon, modelName }: HeaderProps) {

  return (
    <Box
      borderStyle="round"
      borderColor={colors.signature}
      paddingX={1}
      marginBottom={1}
    >
      <Text bold color={colors.signature}> WellGrow </Text>
      {agentName && (
        <>
          <Text color={colors.fog}>│</Text>
          <Text color={colors.energy}> {agentIcon ?? "🤖"} {agentName} </Text>
        </>
      )}
      <Text color={colors.fog}>│</Text>
      <Text color={colors.insight}> {modelName} </Text>
    </Box>
  );
}
