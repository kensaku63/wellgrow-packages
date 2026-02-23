import { useState, useEffect } from "react";
import { Text } from "ink";
import { colors } from "./colors.js";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function ThinkingIndicator() {
  const [frame, setFrame] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <Text>
      <Text color={colors.signature}>{SPINNER_FRAMES[frame]}</Text>
      {elapsed >= 2 && <Text color={colors.fog} dimColor> {elapsed}s</Text>}
    </Text>
  );
}
