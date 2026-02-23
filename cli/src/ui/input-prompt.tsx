import { useState, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import { colors } from "./colors.js";
import type { Mode } from "../tools/pipeline.js";

interface ArgOption {
  value: string;
  label: string;
}

interface SlashCommand {
  name: string;
  description: string;
  hasArgs: boolean;
  args?: ArgOption[];
}

const MODE_ARGS: ArgOption[] = [
  { value: "plan", label: "ツール実行前に承認" },
  { value: "auto", label: "すべて自動実行" },
];

interface InputPromptProps {
  onSubmit: (text: string) => void;
  onModeToggle?: () => void;
  agents?: { id: string; name: string; icon: string }[];
  models?: { value: string; label: string }[];
  mode?: Mode;
}

export function InputPrompt({
  onSubmit,
  onModeToggle,
  agents,
  models,
  mode,
}: InputPromptProps) {
  const [value, setValue] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);

  const commands = useMemo((): SlashCommand[] => {
    const agentArgs: ArgOption[] = (agents ?? []).map((a) => ({
      value: a.id,
      label: `${a.icon} ${a.name}`,
    }));
    const modelArgs: ArgOption[] = models ?? [];
    return [
      { name: "/agent", description: "エージェントを表示/切り替え", hasArgs: true, args: agentArgs },
      { name: "/clear", description: "セッションをクリア", hasArgs: false },
      { name: "/mode", description: "モードを表示/切り替え (plan, auto)", hasArgs: true, args: MODE_ARGS },
      { name: "/model", description: "モデルを切り替え", hasArgs: true, args: modelArgs },
    ];
  }, [agents, models]);

  const spaceIdx = value.indexOf(" ");
  const isArgPhase = spaceIdx > 0;
  const isCmdPhase = value.startsWith("/") && !isArgPhase;

  const cmdSuggestions = isCmdPhase
    ? commands.filter((cmd) => cmd.name.startsWith(value))
    : [];

  const argSuggestions = useMemo((): ArgOption[] => {
    if (!isArgPhase) return [];
    const cmdName = value.slice(0, spaceIdx);
    const argPrefix = value.slice(spaceIdx + 1);
    const cmd = commands.find((c) => c.name === cmdName);
    if (!cmd?.args) return [];
    return cmd.args.filter((a) => a.value.startsWith(argPrefix));
  }, [value, isArgPhase, spaceIdx, commands]);

  const hasSuggestions = cmdSuggestions.length > 0 || argSuggestions.length > 0;

  useInput((input, key) => {
    if (key.tab && key.shift) {
      onModeToggle?.();
      return;
    }

    if (key.return) {
      if (argSuggestions.length > 0) {
        const arg = argSuggestions[Math.min(selectedIdx, argSuggestions.length - 1)];
        const cmdName = value.slice(0, spaceIdx);
        onSubmit(`${cmdName} ${arg.value}`);
        setValue("");
        setSelectedIdx(0);
        return;
      }
      if (cmdSuggestions.length > 0) {
        const cmd = cmdSuggestions[Math.min(selectedIdx, cmdSuggestions.length - 1)];
        if (cmd.hasArgs) {
          setValue(cmd.name + " ");
          setSelectedIdx(0);
        } else {
          onSubmit(cmd.name);
          setValue("");
          setSelectedIdx(0);
        }
        return;
      }
      if (value.trim()) {
        onSubmit(value);
      }
      setValue("");
      setSelectedIdx(0);
      return;
    }

    if (key.tab) {
      if (argSuggestions.length > 0) {
        const arg = argSuggestions[Math.min(selectedIdx, argSuggestions.length - 1)];
        const cmdName = value.slice(0, spaceIdx);
        setValue(`${cmdName} ${arg.value}`);
        setSelectedIdx(0);
        return;
      }
      if (cmdSuggestions.length > 0) {
        const cmd = cmdSuggestions[Math.min(selectedIdx, cmdSuggestions.length - 1)];
        setValue(cmd.name + (cmd.hasArgs ? " " : ""));
        setSelectedIdx(0);
        return;
      }
      return;
    }

    if (hasSuggestions) {
      const len = argSuggestions.length || cmdSuggestions.length;
      if (key.upArrow) {
        setSelectedIdx((prev) => Math.max(0, prev - 1));
        return;
      }
      if (key.downArrow) {
        setSelectedIdx((prev) => Math.min(len - 1, prev + 1));
        return;
      }
    }

    if (key.escape && hasSuggestions) {
      setValue("");
      setSelectedIdx(0);
      return;
    }

    if (key.backspace || key.delete) {
      setValue((prev) => prev.slice(0, -1));
      setSelectedIdx(0);
      return;
    }
    if (input && !key.ctrl && !key.meta) {
      setValue((prev) => prev + input);
      setSelectedIdx(0);
    }
  });

  const modeHint = mode ? ` [${mode}]` : "";

  return (
    <Box flexDirection="column">
      <Text>
        <Text color={colors.joy}>❯ </Text>
        <Text>{value}</Text>
        <Text color={colors.fog}>█</Text>
        {!value && onModeToggle && (
          <Text color={colors.fog}>  Shift+Tab: モード切替{modeHint}</Text>
        )}
      </Text>
      {cmdSuggestions.length > 0 && (
        <Box flexDirection="column" marginLeft={2}>
          {cmdSuggestions.map((cmd, i) => {
            const active = i === selectedIdx;
            return (
              <Box key={cmd.name}>
                <Text color={active ? colors.joy : undefined} bold={active}>
                  {active ? "❯ " : "  "}{cmd.name}
                </Text>
                <Text color={colors.fog}> — {cmd.description}</Text>
              </Box>
            );
          })}
        </Box>
      )}
      {argSuggestions.length > 0 && (
        <Box flexDirection="column" marginLeft={2}>
          {argSuggestions.map((arg, i) => {
            const active = i === selectedIdx;
            return (
              <Box key={arg.value}>
                <Text color={active ? colors.joy : undefined} bold={active}>
                  {active ? "❯ " : "  "}{arg.value}
                </Text>
                <Text color={colors.fog}> — {arg.label}</Text>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
