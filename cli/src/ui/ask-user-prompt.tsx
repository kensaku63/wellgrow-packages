import { useState, useCallback, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import type { AskUserQuestion, AskUserAnswer } from "../tools/ask-user.js";
import { colors } from "./colors.js";

interface AskUserPromptProps {
  questions: AskUserQuestion[];
  queueSize?: number;
  onComplete: (answers: Record<string, AskUserAnswer>) => void;
}

const OTHER_OPTION = { label: "Other", description: "自由入力で回答" };

export function AskUserPrompt({ questions, queueSize = 0, onComplete }: AskUserPromptProps) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [cursorIdx, setCursorIdx] = useState(0);
  const [selectedSet, setSelectedSet] = useState<Set<number>>(new Set());
  const [isOtherInput, setIsOtherInput] = useState(false);
  const [otherText, setOtherText] = useState("");
  const [answers, setAnswers] = useState<Record<string, AskUserAnswer>>({});

  const question = questions[currentIdx];

  const optionsWithOther = useMemo(
    () => (question ? [...question.options, OTHER_OPTION] : []),
    [question],
  );
  const otherIdx = optionsWithOther.length - 1;

  const advanceQuestion = useCallback(
    (answer: AskUserAnswer) => {
      if (!question) return;
      const newAnswers = { ...answers, [question.header]: answer };
      setAnswers(newAnswers);

      if (currentIdx < questions.length - 1) {
        setCurrentIdx((prev) => prev + 1);
        setCursorIdx(0);
        setSelectedSet(new Set());
        setIsOtherInput(false);
        setOtherText("");
      } else {
        onComplete(newAnswers);
      }
    },
    [answers, currentIdx, question, questions.length, onComplete],
  );

  const handleOtherSubmit = useCallback(
    (value: string) => {
      const text = value.trim();
      if (!text || !question) return;
      if (question.multiSelect) {
        const selected = [...selectedSet]
          .filter((i) => i !== otherIdx)
          .map((i) => optionsWithOther[i].label);
        advanceQuestion({ selected, otherText: text });
      } else {
        advanceQuestion({ selected: [OTHER_OPTION.label], otherText: text });
      }
    },
    [question, selectedSet, otherIdx, optionsWithOther, advanceQuestion],
  );

  useInput(
    (input, key) => {
      if (!question || isOtherInput) return;

      if (key.upArrow) {
        setCursorIdx((prev) => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setCursorIdx((prev) => Math.min(optionsWithOther.length - 1, prev + 1));
      } else if (question.multiSelect && input === " ") {
        setSelectedSet((prev) => {
          const next = new Set(prev);
          if (next.has(cursorIdx)) {
            next.delete(cursorIdx);
          } else {
            next.add(cursorIdx);
          }
          return next;
        });
      } else if (key.return) {
        if (question.multiSelect) {
          if (selectedSet.has(otherIdx)) {
            setIsOtherInput(true);
            return;
          }
          const selected = [...selectedSet].map(
            (i) => optionsWithOther[i].label,
          );
          if (selected.length === 0) return;
          advanceQuestion({ selected });
        } else {
          if (cursorIdx === otherIdx) {
            setIsOtherInput(true);
            return;
          }
          advanceQuestion({ selected: [optionsWithOther[cursorIdx].label] });
        }
      }
    },
    { isActive: !!question && !isOtherInput },
  );

  if (!question) return null;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={colors.joy}
      paddingX={1}
      marginTop={1}
    >
      <Box>
        <Text color={colors.joy} bold>💬 質問</Text>
        {questions.length > 1 && (
          <Text color={colors.fog}> ({currentIdx + 1}/{questions.length})</Text>
        )}
        {queueSize > 1 && (
          <Text color={colors.fog}> — 残り {queueSize - 1} 件待機中</Text>
        )}
      </Box>
      <Text color={colors.accent} bold>
        {question.question}
      </Text>
      {question.multiSelect && (
        <Text color={colors.fog}>（Space で選択/解除、Enter で確定）</Text>
      )}
      <Box flexDirection="column" marginLeft={2} marginTop={1}>
        {optionsWithOther.map((opt, i) => {
          const isCursor = i === cursorIdx;
          const isSelected = selectedSet.has(i);
          const prefix = question.multiSelect
            ? `${isCursor ? "❯" : " "} ${isSelected ? "◉" : "○"}`
            : `${isCursor ? "❯" : " "}`;
          return (
            <Box key={i}>
              <Text color={isCursor ? colors.joy : undefined}>
                {prefix} {opt.label}
              </Text>
              <Text color={colors.fog}> — {opt.description}</Text>
            </Box>
          );
        })}
      </Box>
      {isOtherInput && (
        <Box marginLeft={2} marginTop={1}>
          <Text color={colors.insight}>自由入力: </Text>
          <TextInput
            value={otherText}
            onChange={setOtherText}
            onSubmit={handleOtherSubmit}
          />
        </Box>
      )}
    </Box>
  );
}
