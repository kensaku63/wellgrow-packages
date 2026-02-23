import { useState, useEffect, useCallback } from "react";
import { render, Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { createElement } from "react";
import { colors } from "./colors.js";

export interface OnboardingResult {
  name: string;
  apiKey: string | null;
}

interface Props {
  onComplete: (result: OnboardingResult) => void;
}

type Step =
  | "welcome"
  | "name"
  | "nameSubmitted"
  | "apiKeyCheck"
  | "apiKeyMethod"
  | "setupTokenGuide"
  | "setupTokenInput"
  | "apiKeyInput"
  | "apiKeySubmitted"
  | "saving"
  | "done";

export type ApiKeyMethod = "setup-token" | "api-key";

export function isValidName(value: string): boolean {
  return value.trim().length > 0;
}

export function isValidApiKey(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.startsWith("sk-ant-");
}

// ink-text-input v6 has a paste truncation bug on Linux/WSL where long pasted
// strings are split across multiple input events, losing characters (Issue #90).
// This component uses useInput directly to handle paste correctly.
function MaskedInput({ onSubmit, placeholder }: { onSubmit: (value: string) => void; placeholder?: string }) {
  const [value, setValue] = useState("");

  useInput((input, key) => {
    if (key.return) {
      onSubmit(value);
      return;
    }
    if (key.backspace || key.delete) {
      setValue((prev) => prev.slice(0, -1));
      return;
    }
    if (key.ctrl || key.meta || key.escape || key.upArrow || key.downArrow || key.leftArrow || key.rightArrow || key.tab) {
      return;
    }
    setValue((prev) => prev + input);
  });

  if (value.length === 0 && placeholder) {
    return <Text dimColor>{placeholder}</Text>;
  }
  return <Text>{"*".repeat(value.length)}</Text>;
}

const API_KEY_OPTIONS: { id: ApiKeyMethod; label: string; description: string }[] = [
  {
    id: "setup-token",
    label: "setup-token",
    description: "Claude Code を使っている方に推奨",
  },
  {
    id: "api-key",
    label: "API キー",
    description: "Anthropic API キーを直接入力",
  },
];

function WelcomeHeader() {
  return (
    <Box
      borderStyle="round"
      borderColor={colors.signature}
      paddingX={1}
      marginBottom={1}
    >
      <Text bold color={colors.signature}>
        {" "}WellGrow{" "}
      </Text>
      <Text color={colors.fog}>|</Text>
      <Text color={colors.energy}> セットアップ </Text>
    </Box>
  );
}

function BotMessage({ children }: { children: React.ReactNode }) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color={colors.signature}>
        WellGrow
      </Text>
      <Box marginLeft={2} flexDirection="column">
        {children}
      </Box>
    </Box>
  );
}

function UserMessage({ text }: { text: string }) {
  return (
    <Box
      borderStyle="bold"
      borderLeft
      borderTop={false}
      borderBottom={false}
      borderRight={false}
      borderColor={colors.joy}
      paddingLeft={1}
      marginBottom={1}
    >
      <Text>{text}</Text>
    </Box>
  );
}

interface MethodSelectorProps {
  onSelect: (method: ApiKeyMethod) => void;
}

function MethodSelector({ onSelect }: MethodSelectorProps) {
  const [cursor, setCursor] = useState(0);

  useInput((_input, key) => {
    if (key.upArrow) setCursor((prev) => Math.max(0, prev - 1));
    if (key.downArrow) setCursor((prev) => Math.min(API_KEY_OPTIONS.length - 1, prev + 1));
    if (key.return) onSelect(API_KEY_OPTIONS[cursor].id);
  });

  return (
    <Box flexDirection="column" marginLeft={2} marginTop={1}>
      {API_KEY_OPTIONS.map((opt, i) => {
        const active = i === cursor;
        return (
          <Box key={opt.id}>
            <Text color={active ? colors.joy : undefined} bold={active}>
              {active ? "❯ " : "  "}
              {opt.label}
            </Text>
            <Text color={colors.fog}> — {opt.description}</Text>
          </Box>
        );
      })}
    </Box>
  );
}

function OnboardingWizard({ onComplete }: Props) {
  const [step, setStep] = useState<Step>("welcome");
  const [name, setName] = useState("");
  const [nameValue, setNameValue] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [hasEnvKey, setHasEnvKey] = useState(false);
  const [chosenMethod, setChosenMethod] = useState<ApiKeyMethod | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setStep("name"), 800);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (step === "nameSubmitted") {
      const timer = setTimeout(() => {
        if (process.env.ANTHROPIC_API_KEY) {
          setHasEnvKey(true);
          setStep("apiKeyCheck");
        } else {
          setStep("apiKeyMethod");
        }
      }, 400);
      return () => clearTimeout(timer);
    }

    if (step === "apiKeyCheck") {
      const timer = setTimeout(() => setStep("saving"), 800);
      return () => clearTimeout(timer);
    }

    if (step === "apiKeySubmitted") {
      const timer = setTimeout(() => setStep("saving"), 400);
      return () => clearTimeout(timer);
    }

    if (step === "saving") {
      const timer = setTimeout(() => setStep("done"), 600);
      return () => clearTimeout(timer);
    }

    if (step === "done") {
      const timer = setTimeout(() => {
        onComplete({
          name,
          apiKey: hasEnvKey ? null : apiKey || null,
        });
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [step, name, apiKey, hasEnvKey, onComplete]);

  const handleNameSubmit = useCallback((value: string) => {
    if (!isValidName(value)) return;
    setName(value.trim());
    setStep("nameSubmitted");
  }, []);

  const handleMethodSelect = useCallback((method: ApiKeyMethod) => {
    setChosenMethod(method);
    if (method === "setup-token") {
      setStep("setupTokenGuide");
    } else {
      setStep("apiKeyInput");
    }
  }, []);

  const handleApiKeySubmit = useCallback((value: string) => {
    const trimmed = value.trim();
    if (trimmed.length === 0) return;
    if (chosenMethod === "api-key" && !trimmed.startsWith("sk-ant-")) return;
    setApiKey(trimmed);
    setStep("apiKeySubmitted");
  }, [chosenMethod]);

  const pastNameSteps: Step[] = [
    "nameSubmitted", "apiKeyCheck", "apiKeyMethod",
    "setupTokenGuide", "setupTokenInput",
    "apiKeyInput", "apiKeySubmitted", "saving", "done",
  ];

  const pastMethodSteps: Step[] = [
    "setupTokenGuide", "setupTokenInput",
    "apiKeyInput", "apiKeySubmitted", "saving", "done",
  ];

  return (
    <Box flexDirection="column">
      <WelcomeHeader />

      <BotMessage>
        <Text>こんにちは！WellGrow CLIへようこそ。</Text>
        <Text>あなただけのAIアシスタントをセットアップしましょう。</Text>
      </BotMessage>

      {step === "welcome" && (
        <Text color={colors.fog}>...</Text>
      )}

      {step !== "welcome" && (
        <BotMessage>
          <Text>まず、お名前を教えてください。</Text>
        </BotMessage>
      )}

      {step === "name" && (
        <Box>
          <Text color={colors.joy}>{"❯ "}</Text>
          <TextInput
            value={nameValue}
            onChange={setNameValue}
            onSubmit={handleNameSubmit}
            placeholder="名前を入力..."
          />
        </Box>
      )}

      {name && <UserMessage text={name} />}

      {pastNameSteps.includes(step) && (
        <BotMessage>
          <Text>{name}さん、よろしくお願いします！</Text>
        </BotMessage>
      )}

      {/* API key method selection */}
      {step === "apiKeyMethod" && (
        <>
          <BotMessage>
            <Text>次に、AIと会話するためのAPIキーを設定しましょう。</Text>
            <Text>取得方法を選んでください:</Text>
          </BotMessage>
          <MethodSelector onSelect={handleMethodSelect} />
        </>
      )}

      {/* Show chosen method as user message */}
      {chosenMethod && pastMethodSteps.includes(step) && (
        <UserMessage
          text={chosenMethod === "setup-token" ? "setup-token" : "API キー"}
        />
      )}

      {/* setup-token guide */}
      {step === "setupTokenGuide" && (
        <BotMessage>
          <Text>別のターミナルで以下のコマンドを実行してください:</Text>
          <Text />
          <Text color={colors.insight}>{"  $ "}<Text bold>claude setup-token</Text></Text>
          <Text />
          <Text>表示される sk-ant- で始まるAPIキーを貼り付けてください:</Text>
          <Text color={colors.fog}>（※ Authentication Code ではなく、その後に表示されるAPIキーです）</Text>
        </BotMessage>
      )}

      {(step === "setupTokenGuide" || step === "setupTokenInput") && (
        <Box>
          <Text color={colors.joy}>{"❯ "}</Text>
          <MaskedInput onSubmit={handleApiKeySubmit} placeholder="sk-ant-..." />
        </Box>
      )}

      {/* Direct API key input */}
      {step === "apiKeyInput" && (
        <>
          <BotMessage>
            <Text>Anthropic の API キーを入力してください。</Text>
            <Text />
            <Text color={colors.insight}>
              {"💡 "}
              <Text color={colors.flow} underline>
                https://console.anthropic.com/settings/keys
              </Text>
              {" から取得できます"}
            </Text>
          </BotMessage>
          <Box>
            <Text color={colors.joy}>{"❯ "}</Text>
            <MaskedInput onSubmit={handleApiKeySubmit} placeholder="sk-ant-..." />
          </Box>
        </>
      )}

      {step === "apiKeySubmitted" && (
        <BotMessage>
          <Text>APIキーを設定しています...</Text>
        </BotMessage>
      )}

      {step === "apiKeyCheck" && (
        <BotMessage>
          <Text color={colors.growth}>{"✓ "}<Text>APIキーは既に設定されていますね。</Text></Text>
        </BotMessage>
      )}

      {(step === "saving" || step === "done") && (
        <BotMessage>
          <Text color={colors.growth}>{"✓ "}<Text>設定完了！</Text></Text>
          <Text />
          <Text>これからAIアシスタントがセットアップの続きをお手伝いします。</Text>
        </BotMessage>
      )}

      {step === "done" && (
        <Text color={colors.fog}>──────────────────────────────────────</Text>
      )}
    </Box>
  );
}

export async function runOnboardingWizard(): Promise<OnboardingResult> {
  return new Promise((resolve) => {
    const { unmount } = render(
      createElement(OnboardingWizard, {
        onComplete: (result) => {
          unmount();
          resolve(result);
        },
      }),
    );
  });
}
