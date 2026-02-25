import { render } from "ink";
import { createElement } from "react";
import { Command } from "commander";
import { randomUUID } from "node:crypto";
import { loadConfig, initConfig, isFirstRun, saveOnboardingResult, ConfigLoadError } from "./config/index.js";
import { createSession, sendMessage } from "./core/session.js";
import { getModelDisplayName } from "./ai/providers.js";
import { createSessionRecorder } from "./core/history.js";
import { formatErrorMessage } from "./ai/retry.js";
import { initLogger } from "./logging.js";
import { App } from "./ui/app.js";
import { setupSignalHandlers, createAbortController, setActiveSession } from "./signals.js";
import { registerConfigCommand } from "./commands/config.js";
import { registerHistoryCommand } from "./commands/history.js";
import { registerInitCommand } from "./commands/init.js";
import { registerDoctorCommand } from "./commands/doctor.js";
import { registerSkillsCommand } from "./commands/skills.js";
import { registerCommandsCommand } from "./commands/custom/index.js";
import { runOnboardingWizard } from "./ui/onboarding-wizard.js";
import type { Mode } from "./tools/pipeline.js";

declare const PKG_VERSION: string;

const VALID_MODES: Mode[] = ["plan", "auto"];

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf-8").trim();
}

async function runOneShot(
  effectivePrompt: string,
  opts: { model?: string; agent?: string; mode?: string; verbose?: boolean },
): Promise<void> {
  const config = await loadConfig();
  const agentName = opts.agent ?? config.default.agent;
  const mode = (opts.mode as Mode | undefined) ?? config.default.mode;

  const session = await createSession({
    agentName,
    modelOverride: opts.model,
    modeOverride: mode,
  });
  setActiveSession(session.ctx, session.agent.hookEngine);

  const verbose = opts.verbose ?? config.logging.verbose;
  if (verbose) {
    session.ctx.logFile = await initLogger(randomUUID(), config.logging.log_dir);
  }

  const modelName = getModelDisplayName(session.agent.modelId);
  const recorder = await createSessionRecorder(modelName, agentName);
  await recorder.recordUser(effectivePrompt);

  if (mode === "plan") {
    process.stderr.write(
      "Policy: one-shot の plan モードでは承認が必要なツール実行を自動拒否します。\n",
    );
  }

  const ac = createAbortController(session.ctx.abort, config.api.timeout);
  let lastText = "";
  try {
    const result = await sendMessage(session, effectivePrompt, {
      onMessageUpdate: (parts) => {
        const text = parts
          .filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join("");
        const delta = text.slice(lastText.length);
        if (delta) process.stdout.write(delta);
        lastText = text;
      },
      onRetry: (attempt, maxRetries, delayMs) => {
        process.stderr.write(
          `⟳ API エラー。リトライ中... (${attempt}/${maxRetries}, ${Math.round(delayMs / 1000)}秒後)\n`,
        );
      },
      onContextExceeded: () => {
        process.stderr.write(
          "コンテキストウィンドウの上限に達しました。入力を短くして再試行してください。\n",
        );
      },
      onApprovalRequest:
        mode === "plan"
          ? async () => ({ action: "deny" as const })
          : undefined,
    }, {
      abortSignal: ac.signal,
      maxRetries: config.api.max_retries,
      maxOutputTokens: config.default.max_output_tokens,
    });
    process.stdout.write("\n");

    await recorder.recordAssistant(result.fullText);
    await recorder.finalize(2);
  } catch (error) {
    process.stderr.write(`\nError: ${formatErrorMessage(error)}\n`);
    process.exitCode = 1;
  }
}

const program = new Command();

program
  .name("wellgrow")
  .description("WellGrow CLI — AI chat assistant")
  .version(PKG_VERSION)
  .argument("[prompt]", "ワンショット質問（省略でインタラクティブモード）")
  .option("--model <model>", "使用するモデル")
  .option("-a, --agent <agent>", "使用するエージェント")
  .option(
    "--mode <mode>",
    "モード (plan, auto)",
  )
  .option("--verbose", "詳細ログを出力")
  .option("-p, --pipe", "パイプ入力モード（stdinからの入力を受け付ける）")
  .action(async (prompt: string | undefined, opts: { model?: string; agent?: string; mode?: string; verbose?: boolean; pipe?: boolean }) => {
    try {
      setupSignalHandlers();

      const firstRun = await isFirstRun();

      if (firstRun && !prompt && !opts.pipe) {
        const result = await runOnboardingWizard();
        await saveOnboardingResult(result);
        await initConfig();
        const config = await loadConfig();
        const verbose = opts.verbose ?? config.logging.verbose;
        render(createElement(App, {
          agentName: "wellgrow-onboarding",
          config,
          initialMessage: "セットアップを始めてください",
          verbose,
        }));
        return;
      }

      await initConfig();

      if (opts.mode && !VALID_MODES.includes(opts.mode as Mode)) {
        process.stderr.write(
          `Error: 無効なモードです: ${opts.mode}\n有効な値: ${VALID_MODES.join(", ")}\n`,
        );
        process.exit(1);
      }

      if (opts.pipe) {
        const stdinData = await readStdin();
        const effectivePrompt = prompt && stdinData
          ? `${prompt}\n\n${stdinData}`
          : stdinData || prompt;
        if (!effectivePrompt) {
          process.stderr.write("Error: -p オプション使用時はパイプ入力またはプロンプトが必要です\n");
          process.exit(1);
        }
        await runOneShot(effectivePrompt, opts);
        return;
      }

      if (prompt) {
        await runOneShot(prompt, opts);
        return;
      }

      const config = await loadConfig();
      const verbose = opts.verbose ?? config.logging.verbose;
      const mode = opts.mode as Mode | undefined;
      render(createElement(App, {
        agentName: opts.agent,
        modelOverride: opts.model,
        config,
        mode,
        verbose,
      }));
    } catch (error) {
      if (error instanceof ConfigLoadError) {
        process.stderr.write(`Error: ${error.message}\n`);
      } else {
        process.stderr.write(
          `Error: ${error instanceof Error ? error.message : String(error)}\n`,
        );
      }
      process.exit(1);
    }
  });

registerConfigCommand(program);
registerHistoryCommand(program);
registerInitCommand(program);
registerDoctorCommand(program);
registerSkillsCommand(program);
registerCommandsCommand(program);

program.parse();
