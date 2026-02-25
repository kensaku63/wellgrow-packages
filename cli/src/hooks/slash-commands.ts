import type { Session } from "../core/session.js";
import type { SessionRecorder } from "../core/history.js";
import type { TodoItem } from "../tools/todo-write.js";
import type { Mode } from "../tools/pipeline.js";
import {
  discoverCommands,
  loadCommand,
  resolvePrompt,
} from "../commands/custom/loader.js";

export interface SlashCommandContext {
  session: Session;
  status: "ready" | "submitted" | "streaming" | "error";
  mode: Mode;
  currentAgentName: string;
  currentAgentIcon: string;
  recorder: SessionRecorder | null;
  messageCountRef: { current: number };
  cancelAllAskUser: () => void;
  resetSession: () => Promise<void>;
  clearMessages: () => void;
  setTodos: (todos: TodoItem[]) => void;
  setMode: (mode: Mode) => void;
  switchModel: (modelId: string) => { message: string };
  switchAgent: (
    agentName: string,
  ) => Promise<{ success: boolean; message: string }>;
  addSystemMessage: (text: string) => void;
  submitPrompt: (prompt: string) => void;
  onExit: () => void;
}

export async function handleSlashCommand(
  text: string,
  ctx: SlashCommandContext,
): Promise<boolean> {
  if (text === "exit" || text === "quit") {
    ctx.cancelAllAskUser();
    if (ctx.recorder) {
      await ctx.recorder.finalize(ctx.messageCountRef.current);
    }
    ctx.onExit();
    return true;
  }

  if (text === "/clear") {
    ctx.cancelAllAskUser();
    await ctx.resetSession();
    ctx.clearMessages();
    ctx.setTodos([]);
    return true;
  }

  const agentMatch = text.match(/^\/agent(?:\s+(.+))?$/);
  if (agentMatch) {
    const newAgent = agentMatch[1]?.trim();
    if (!newAgent) {
      ctx.addSystemMessage(
        `現在のエージェント: ${ctx.currentAgentIcon} ${ctx.currentAgentName}`,
      );
      return true;
    }
    if (ctx.status !== "ready") {
      ctx.addSystemMessage(
        "推論中はエージェントを切り替えられません。完了後に再度お試しください。",
      );
      return true;
    }
    ctx.cancelAllAskUser();
    ctx.clearMessages();
    ctx.setTodos([]);
    const result = await ctx.switchAgent(newAgent);
    if (result.success) {
      ctx.setMode(ctx.session.agent.pipeline.mode);
    }
    ctx.addSystemMessage(result.message);
    return true;
  }

  const modeMatch = text.match(/^\/mode(?:\s+(.+))?$/);
  if (modeMatch) {
    const newMode = modeMatch[1]?.trim() as Mode | undefined;
    if (!newMode) {
      ctx.addSystemMessage(`現在のモード: ${ctx.mode}`);
      return true;
    }
    const valid: Mode[] = ["plan", "auto"];
    if (!valid.includes(newMode)) {
      ctx.addSystemMessage(
        `無効なモードです。有効な値: ${valid.join(", ")}`,
      );
      return true;
    }
    ctx.session.agent.pipeline.setMode(newMode);
    ctx.setMode(newMode);
    ctx.addSystemMessage(`モードを ${newMode} に切り替えました。`);
    return true;
  }

  const modelMatch = text.match(/^\/model\s+(.+)/);
  if (modelMatch) {
    if (ctx.status !== "ready") {
      ctx.addSystemMessage(
        "推論中はモデルを切り替えられません。完了後に再度お試しください。",
      );
      return true;
    }
    const result = ctx.switchModel(modelMatch[1].trim());
    ctx.addSystemMessage(result.message);
    return true;
  }

  if (text === "/help") {
    await showHelp(ctx);
    return true;
  }

  // Custom commands: /name arg1 arg2 ...
  if (text.startsWith("/")) {
    const parts = text.slice(1).split(/\s+/);
    const commandName = parts[0];
    if (!commandName) return false;

    const command = await loadCommand(commandName);
    if (!command) return false;

    if (ctx.status !== "ready") {
      ctx.addSystemMessage(
        "推論中はコマンドを実行できません。完了後に再度お試しください。",
      );
      return true;
    }

    const positionalArgs = parts.slice(1);
    const { prompt, errors } = resolvePrompt(command, positionalArgs);

    if (errors.length > 0) {
      const usage = formatCommandUsage(command);
      ctx.addSystemMessage(`${errors.join("\n")}\n\n${usage}`);
      return true;
    }

    ctx.submitPrompt(prompt);
    return true;
  }

  return false;
}

const BUILTIN_COMMANDS = [
  { name: "/clear", description: "セッションをクリア" },
  { name: "/agent", description: "エージェントを表示・切り替え" },
  { name: "/mode", description: "モードを表示・切り替え (plan, auto)" },
  { name: "/model", description: "モデルを切り替え" },
  { name: "/help", description: "コマンド一覧を表示" },
];

function formatCommandUsage(command: { name: string; args: { name: string; required: boolean }[] }): string {
  const argParts = command.args.map((a) =>
    a.required ? `<${a.name}>` : `[${a.name}]`,
  );
  return `使い方: /${command.name} ${argParts.join(" ")}`.trim();
}

async function showHelp(ctx: SlashCommandContext): Promise<void> {
  const lines: string[] = ["ビルトイン:"];
  for (const cmd of BUILTIN_COMMANDS) {
    lines.push(`  ${cmd.name.padEnd(12)} ${cmd.description}`);
  }

  const customs = await discoverCommands();
  if (customs.length > 0) {
    lines.push("");
    lines.push("カスタム:");
    for (const cmd of customs) {
      const argHint = cmd.args.length > 0
        ? ` ${cmd.args.map((a) => a.required ? `<${a.name}>` : `[${a.name}]`).join(" ")}`
        : "";
      lines.push(`  /${cmd.name.padEnd(12)} ${cmd.description}${argHint}`);
    }
  }

  lines.push("");
  lines.push("exit / quit で終了");
  ctx.addSystemMessage(lines.join("\n"));
}
