import { spawn, type ChildProcess } from "node:child_process";
import { writeFile, mkdir, stat } from "node:fs/promises";
import { join, resolve, isAbsolute } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  MAX_BASH_OUTPUT_CHARS,
  MAX_BASH_OUTPUT_BYTES,
  BASH_DEFAULT_TIMEOUT,
  BASH_MAX_TIMEOUT,
  BASH_IO_DRAIN_TIMEOUT,
  BASH_BACKGROUND_FLUSH_INTERVAL,
} from "./constants.js";
import { registerBackgroundProcess } from "../signals.js";
import { defineTool } from "./definition.js";

export interface BashState {
  cwd: string;
  nextTerminalId: number;
}

// Process-level cache: user's shell doesn't change during process lifetime
let cachedShell: { path: string; name: string } | null = null;
const dirStack: string[] = [];

export interface BashOutput {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  interrupted: boolean;
  backgroundTaskId?: string;
  backgroundedByUser?: boolean;
  returnCodeInterpretation?: string;
  noOutputExpected?: boolean;
  persistedOutputPath?: string;
  persistedOutputSize?: number;
}

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

// ---------------------------------------------------------------------------
// Output masking — sensitive env var values are redacted from tool output
// so they never reach the LLM context or logs, while still being available
// to child processes.
// ---------------------------------------------------------------------------

const SENSITIVE_ENV_PATTERNS = [
  /key/i,
  /secret/i,
  /token/i,
  /password/i,
  /credential/i,
];

const MIN_SECRET_LENGTH = 8;

const sensitiveValues: string[] = [];
for (const [key, value] of Object.entries(process.env)) {
  if (!value || value.length < MIN_SECRET_LENGTH) continue;
  if (SENSITIVE_ENV_PATTERNS.some((p) => p.test(key))) {
    sensitiveValues.push(value);
  }
}
sensitiveValues.sort((a, b) => b.length - a.length);

function maskSensitiveOutput(text: string): string {
  let masked = text;
  for (const secret of sensitiveValues) {
    masked = masked.replaceAll(secret, "***");
  }
  return masked;
}

const spawnEnv: Record<string, string> = {
  ...(process.env as Record<string, string>),
  TERM: "dumb",
  NO_COLOR: "1",
  FORCE_COLOR: "0",
  CI: "1",
  NODE_NO_READLINE: "1",
};

// ---------------------------------------------------------------------------
// User shell detection
// ---------------------------------------------------------------------------

function detectShell(): { path: string; name: string } {
  if (cachedShell) return cachedShell;

  const shellPath = process.env.SHELL;
  if (shellPath) {
    const name = shellPath.split("/").pop() ?? "sh";
    if (name === "zsh" || name === "bash") {
      cachedShell = { path: shellPath, name };
      return cachedShell;
    }
  }

  cachedShell = { path: "sh", name: "sh" };
  return cachedShell;
}

function buildShellArgs(shellName: string, command: string): string[] {
  if (shellName === "zsh") {
    // -l で .zprofile を読み込む（高速・安定重視）
    return ["-l", "-c", command];
  }
  if (shellName === "bash") {
    // -l で .bash_profile を読み込む（大抵 .bashrc もソースされる）
    return ["-l", "-c", command];
  }
  return ["-c", command];
}

function spawnShell(
  command: string,
  options: { cwd: string; detached?: boolean },
): ChildProcess {
  const shell = detectShell();
  return spawn(shell.path, buildShellArgs(shell.name, command), {
    cwd: options.cwd,
    env: spawnEnv as NodeJS.ProcessEnv,
    stdio: ["ignore", "pipe", "pipe"],
    detached: options.detached,
  });
}

// ---------------------------------------------------------------------------
// CWD tracking
// Parses chain operators (;, &&, ||, newlines) and tracks cd/pushd/popd
// through command sequences. Subshells and pipelines are ignored since
// directory changes within them don't affect the parent shell.
// ---------------------------------------------------------------------------

function containsDirChange(command: string): boolean {
  return /\b(cd|pushd|popd)\b/.test(command);
}

function splitChainSegments(command: string): string[] {
  const segments: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  let parenDepth = 0;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    const prev = i > 0 ? command[i - 1] : "";

    if (ch === "'" && !inDouble && prev !== "\\") {
      inSingle = !inSingle;
      current += ch;
      continue;
    }
    if (ch === '"' && !inSingle && prev !== "\\") {
      inDouble = !inDouble;
      current += ch;
      continue;
    }
    if (inSingle || inDouble) {
      current += ch;
      continue;
    }

    if (ch === "(") {
      parenDepth++;
      current += ch;
      continue;
    }
    if (ch === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
      current += ch;
      continue;
    }
    if (parenDepth > 0) {
      current += ch;
      continue;
    }

    if (ch === ";" || ch === "\n") {
      segments.push(current);
      current = "";
      continue;
    }
    if (ch === "&" && command[i + 1] === "&") {
      segments.push(current);
      current = "";
      i++;
      continue;
    }
    if (ch === "|" && command[i + 1] === "|") {
      segments.push(current);
      current = "";
      i++;
      continue;
    }

    current += ch;
  }

  if (current.trim()) segments.push(current);
  return segments;
}

function extractDirCommand(
  segment: string,
): { type: "cd" | "pushd" | "popd"; target?: string } | null {
  const trimmed = segment.trim();

  // cd in a pipeline runs in a subshell — ignore
  if (/(?<!\|)\|(?!\|)/.test(trimmed)) return null;

  const cdMatch = trimmed.match(
    /^cd(?:\s+(?:"([^"]*)"|'([^']*)'|(\S+)))?(?:\s|$)/,
  );
  if (cdMatch) {
    return { type: "cd", target: cdMatch[1] ?? cdMatch[2] ?? cdMatch[3] };
  }

  const pushdMatch = trimmed.match(
    /^pushd(?:\s+(?:"([^"]*)"|'([^']*)'|(\S+)))?(?:\s|$)/,
  );
  if (pushdMatch) {
    return {
      type: "pushd",
      target: pushdMatch[1] ?? pushdMatch[2] ?? pushdMatch[3],
    };
  }

  if (/^popd(?:\s|$)/.test(trimmed)) {
    return { type: "popd" };
  }

  return null;
}

async function trackCwdChanges(
  state: BashState,
  command: string,
  cwd: string,
): Promise<void> {
  if (!containsDirChange(command)) return;

  const segments = splitChainSegments(command);
  let effectiveCwd = cwd;

  for (const segment of segments) {
    const dirCmd = extractDirCommand(segment);
    if (!dirCmd) continue;

    if (dirCmd.type === "popd") {
      const popped = dirStack.pop();
      if (popped) effectiveCwd = popped;
      continue;
    }

    let target = dirCmd.target;
    if (!target) {
      if (dirCmd.type === "cd") {
        effectiveCwd = homedir();
      }
      continue;
    }
    if (target === "-") continue;

    target = target.replace(/^~(?=\/|$)/, homedir());
    const resolved = isAbsolute(target) ? target : resolve(effectiveCwd, target);

    try {
      const s = await stat(resolved);
      if (s.isDirectory()) {
        if (dirCmd.type === "pushd") {
          dirStack.push(effectiveCwd);
        }
        effectiveCwd = resolved;
      }
    } catch {
      // directory not accessible
    }
  }

  state.cwd = effectiveCwd;
}

// ---------------------------------------------------------------------------
// Error formatting
// ---------------------------------------------------------------------------

function formatSpawnError(error: NodeJS.ErrnoException): string {
  switch (error.code) {
    case "ENOENT":
      return `コマンドが見つかりません: ${error.path ?? "unknown"}。wellgrow doctor でインストール状況を確認するか、別のコマンドを使用してください`;
    case "EACCES":
      return `実行権限がありません: ${error.path ?? "unknown"}。chmod +x で実行権限を付与してください`;
    case "EPERM":
      return `操作が許可されていません: ${error.message}。sudo が必要か、または別の方法を検討してください`;
    default:
      return `プロセス起動エラー: ${error.message}`;
  }
}

function attachSpawnErrorHandler(
  child: ChildProcess,
  resolve: (value: BashOutput) => void,
  timer?: ReturnType<typeof setTimeout>,
): void {
  child.on("error", (error: NodeJS.ErrnoException) => {
    if (timer) clearTimeout(timer);
    resolve({
      stdout: "",
      stderr: formatSpawnError(error),
      exitCode: 1,
      interrupted: false,
    });
  });
}

// ---------------------------------------------------------------------------
// Output truncation
// ---------------------------------------------------------------------------

function truncateMiddle(
  text: string,
  maxChars: number,
): { truncated: string; totalLines: number } {
  const totalLines = text.split("\n").length;
  if (text.length <= maxChars) return { truncated: text, totalLines };

  const leftBudget = Math.floor(maxChars / 2);
  const rightBudget = maxChars - leftBudget;

  const left = text.slice(0, leftBudget);
  const right = text.slice(-rightBudget);
  const removedChars = text.length - leftBudget - rightBudget;

  const truncated = `${left}\n\n…${removedChars}文字省略…\n\n${right}`;
  return { truncated, totalLines };
}

// ---------------------------------------------------------------------------
// Memory-capped buffer accumulation
// ---------------------------------------------------------------------------

function appendCapped(
  current: string,
  chunk: string,
  maxBytes: number,
): string {
  const currentBytes = Buffer.byteLength(current, "utf-8");
  if (currentBytes >= maxBytes) return current;
  const remaining = maxBytes - currentBytes;
  const chunkBytes = Buffer.byteLength(chunk, "utf-8");
  if (chunkBytes <= remaining) return current + chunk;
  const buf = Buffer.from(chunk, "utf-8");
  return current + buf.subarray(0, remaining).toString("utf-8");
}

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

const inputSchema = z.object({
  command: z.string().describe("実行するシェルコマンド"),
  description: z
    .string()
    .optional()
    .describe("コマンドの簡潔な説明（5-10語、ユーザーへの表示用）"),
  working_directory: z
    .string()
    .optional()
    .describe("実行ディレクトリの絶対パス"),
  timeout: z
    .number()
    .optional()
    .describe("タイムアウト（ミリ秒、デフォルト: 120000、最大: 600000）"),
  run_in_background: z
    .boolean()
    .optional()
    .describe("バックグラウンド実行フラグ"),
});

export const BashTool = defineTool({
  name: "Bash",
  category: "execute",
  description: `シェルコマンドを実行します。作業ディレクトリは呼び出し間で永続化されますが、シェル状態（変数、エイリアス等）は永続化されません。

重要: ファイル操作には専用ツールを使ってください:
- ファイル読み取り → Read（cat, head, tail は使わない）
- ファイル検索 → Glob（find は使わない）
- テキスト検索 → Grep（grep, rg は使わない）
- ファイル作成 → Write（echo やリダイレクトは使わない）
- ファイル編集 → Edit（sed, awk は使わない）

実行前のチェック:
1. ディレクトリ確認: ファイルやディレクトリを新規作成する場合、先に Glob や Bash(ls) で親ディレクトリの存在を確認すること
2. パスのクォーティング: スペースを含むパスは必ずダブルクォートで囲むこと

ガイドライン:
- 独立したコマンドは並列で複数の Bash 呼び出しにしてください
- 依存するコマンドは && でチェインしてください
- description パラメータでユーザーに何をしているか伝えてください
- タイムアウト: デフォルト120秒、最大600秒。超過時はバックグラウンドに自動移行
- 出力が30000文字を超える場合は切り詰められ、完全な出力はファイルに保存されます
- セキュリティのためAPIキーや環境変数やパスワードは自動でマスキングがかかる仕様です
- run_in_background: true でバックグラウンド実行。出力は ~/.wellgrow/terminals/ に保存
  → Read ツールでターミナルファイルを定期的に確認してモニタリングできます`,
  inputSchema,
  execute: async (input, ctx) => {
    const state: BashState = {
      cwd: ctx.session.cwd,
      nextTerminalId: ctx.session.nextTerminalId,
    };
    const result = await executeBash(state, input, ctx.abortSignal);
    ctx.session.cwd = state.cwd;
    ctx.session.nextTerminalId = state.nextTerminalId;
    return result;
  },
});

// ---------------------------------------------------------------------------
// Main execution
// ---------------------------------------------------------------------------

export async function executeBash(
  state: BashState,
  args: {
    command: string;
    description?: string;
    working_directory?: string;
    timeout?: number;
    run_in_background?: boolean;
  },
  abortSignal?: AbortSignal,
): Promise<BashOutput> {
  const cwd = args.working_directory ?? state.cwd;
  const timeout = Math.min(
    args.timeout ?? BASH_DEFAULT_TIMEOUT,
    BASH_MAX_TIMEOUT,
  );

  if (args.run_in_background) {
    const result = await runInBackground(state, args.command, cwd);
    result.backgroundedByUser = true;
    return result;
  }

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let interrupted = false;
    let resolved = false;
    let building = false;
    let exitedCode: number | null = null;
    let closeTimer: ReturnType<typeof setTimeout> | null = null;

    const safeResolve = (value: BashOutput) => {
      if (resolved) return;
      resolved = true;
      if (closeTimer) clearTimeout(closeTimer);
      resolve(value);
    };

    const child = spawnShell(args.command, { cwd });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) child.kill("SIGKILL");
      }, 3000);
    }, timeout);

    if (abortSignal) {
      const onAbort = () => {
        if (!resolved && !interrupted) {
          interrupted = true;
          child.kill("SIGINT");
          setTimeout(() => {
            if (!child.killed && !resolved) child.kill("SIGKILL");
          }, 3000);
        }
      };
      if (abortSignal.aborted) {
        onAbort();
      } else {
        abortSignal.addEventListener("abort", onAbort, { once: true });
      }
    }

    attachSpawnErrorHandler(child, safeResolve, timer);

    child.stdout!.on("data", (data: Buffer) => {
      stdout = appendCapped(stdout, data.toString(), MAX_BASH_OUTPUT_BYTES);
    });

    child.stderr!.on("data", (data: Buffer) => {
      stderr = appendCapped(stderr, data.toString(), MAX_BASH_OUTPUT_BYTES);
    });

    const finalize = async (code: number | null) => {
      if (building || resolved) return;
      building = true;
      clearTimeout(timer);
      if (closeTimer) clearTimeout(closeTimer);

      if (timedOut) {
        safeResolve(await runInBackground(state, args.command, cwd));
        return;
      }

      await trackCwdChanges(state, args.command, cwd);

      let finalStdout = stdout;
      let persistedOutputPath: string | undefined;
      let persistedOutputSize: number | undefined;

      if (finalStdout.length > MAX_BASH_OUTPUT_CHARS) {
        const hash = createHash("md5")
          .update(finalStdout)
          .digest("hex")
          .slice(0, 12);
        const outputsDir = join(homedir(), ".wellgrow", "outputs");
        await ensureDir(outputsDir);
        persistedOutputPath = join(outputsDir, `${hash}.txt`);
        await writeFile(persistedOutputPath, finalStdout, "utf-8");
        persistedOutputSize = Buffer.byteLength(finalStdout, "utf-8");

        const { truncated, totalLines } = truncateMiddle(
          finalStdout,
          MAX_BASH_OUTPUT_CHARS,
        );
        finalStdout =
          `[出力が${MAX_BASH_OUTPUT_CHARS}文字を超えたため切り詰めました (全${totalLines}行)]\n` +
          `完全な出力: ${persistedOutputPath} (${persistedOutputSize} bytes)\n` +
          `Read ツールで参照できます。\n\n${truncated}`;
      }

      let returnCodeInterpretation: string | undefined;
      if (code !== null && code > 128) {
        const signal = code - 128;
        const signalNames: Record<number, string> = {
          1: "SIGHUP",
          2: "SIGINT",
          9: "SIGKILL",
          15: "SIGTERM",
        };
        returnCodeInterpretation = `killed by ${signalNames[signal] ?? `signal ${signal}`}`;
      }

      const noOutputExpected = !stdout && !stderr && code === 0;

      finalStdout = maskSensitiveOutput(finalStdout);
      const maskedStderr = maskSensitiveOutput(stderr);

      safeResolve({
        stdout: interrupted
          ? `${finalStdout}\n[ユーザーにより中断されました]`
          : finalStdout,
        stderr: maskedStderr,
        exitCode: code,
        interrupted,
        persistedOutputPath,
        persistedOutputSize,
        returnCodeInterpretation,
        noOutputExpected,
      });
    };

    // I/O drain strategy:
    // 'exit' fires when the process terminates; 'close' fires after all stdio
    // streams are destroyed. Grandchild processes may keep pipes open, causing
    // 'close' to hang indefinitely. We set a drain timeout on 'exit' and
    // forcefully destroy streams if 'close' doesn't arrive in time.
    child.on("exit", (code) => {
      exitedCode = code;
      closeTimer = setTimeout(() => {
        child.stdout?.destroy();
        child.stderr?.destroy();
        finalize(exitedCode);
      }, BASH_IO_DRAIN_TIMEOUT);
    });

    child.on("close", (code) => {
      finalize(code ?? exitedCode);
    });
  });
}

// ---------------------------------------------------------------------------
// Background execution
// ---------------------------------------------------------------------------

async function runInBackground(
  state: BashState,
  command: string,
  cwd: string,
): Promise<BashOutput> {
  const terminalId = state.nextTerminalId++;
  const terminalsDir = join(homedir(), ".wellgrow", "terminals");
  await ensureDir(terminalsDir);
  const terminalFile = join(terminalsDir, `${terminalId}.txt`);

  let child: ChildProcess;
  try {
    child = spawnShell(command, { cwd, detached: true });
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    return {
      stdout: "",
      stderr: formatSpawnError(err),
      exitCode: 1,
      interrupted: false,
    };
  }

  registerBackgroundProcess(child);

  const pid = child.pid;
  const startTime = Date.now();

  let header = `---\npid: ${pid}\ncwd: ${cwd}\nlast_command: ${command}\nrunning_for_ms: 0\n---\n> ${command}\n\n`;
  await writeFile(terminalFile, header, "utf-8");

  let output = "";
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  const flushToFile = async () => {
    const runningFor = Date.now() - startTime;
    header =
      `---\npid: ${pid}\ncwd: ${cwd}\nlast_command: ${command}\n` +
      `running_for_ms: ${runningFor}\n---\n> ${command}\n\n`;
    await writeFile(terminalFile, header + maskSensitiveOutput(output), "utf-8").catch(() => {});
  };

  const scheduleFlush = () => {
    if (flushTimer) return;
    flushTimer = setTimeout(async () => {
      flushTimer = null;
      await flushToFile();
    }, BASH_BACKGROUND_FLUSH_INTERVAL);
  };

  child.on("error", (error: NodeJS.ErrnoException) => {
    if (flushTimer) clearTimeout(flushTimer);
    const elapsed = Date.now() - startTime;
    const footer = `\n---\nerror: ${formatSpawnError(error)}\nexit_code: 1\nelapsed_ms: ${elapsed}\n---\n`;
    writeFile(terminalFile, header + maskSensitiveOutput(output) + footer, "utf-8").catch(() => {});
  });

  child.stdout!.on("data", (data: Buffer) => {
    output = appendCapped(output, data.toString(), MAX_BASH_OUTPUT_BYTES);
    scheduleFlush();
  });

  child.stderr!.on("data", (data: Buffer) => {
    output = appendCapped(output, data.toString(), MAX_BASH_OUTPUT_BYTES);
    scheduleFlush();
  });

  child.on("close", async (code) => {
    if (flushTimer) clearTimeout(flushTimer);
    const elapsed = Date.now() - startTime;
    const footer = `\n---\nexit_code: ${code}\nelapsed_ms: ${elapsed}\n---\n`;
    await writeFile(terminalFile, header + maskSensitiveOutput(output) + footer, "utf-8").catch(
      () => {},
    );
  });

  child.unref();

  return {
    stdout: `コマンドをバックグラウンドに移行しました。\nターミナルファイル: ${terminalFile}`,
    stderr: "",
    exitCode: null,
    interrupted: false,
    backgroundTaskId: String(terminalId),
  };
}
