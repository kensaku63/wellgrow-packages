import type { ChildProcess } from "node:child_process";
import type { SessionContext, AbortState } from "./core/context.js";
import type { HookEngine } from "./extensions/hook-engine.js";

type ShutdownHandler = () => Promise<void>;

const shutdownHandlers: ShutdownHandler[] = [];
const backgroundProcesses = new Set<ChildProcess>();
let isShuttingDown = false;
let lastSigintTime = 0;

let activeCtx: SessionContext | null = null;
let activeHookEngine: HookEngine | null = null;

export function setActiveSession(
  ctx: SessionContext | null,
  hookEngine: HookEngine | null,
): void {
  activeCtx = ctx;
  activeHookEngine = hookEngine;
}

export function registerShutdownHandler(handler: ShutdownHandler): void {
  shutdownHandlers.push(handler);
}

export function registerBackgroundProcess(child: ChildProcess): void {
  backgroundProcesses.add(child);
  child.on("close", () => backgroundProcesses.delete(child));
}

export function createAbortController(abort: AbortState, timeoutMs = 600000): AbortController {
  abort.userAbortController = new AbortController();
  abort.timeoutAbortController = new AbortController();

  if (abort.timeoutTimer) clearTimeout(abort.timeoutTimer);
  abort.timeoutTimer = setTimeout(() => {
    abort.timeoutAbortController?.abort();
  }, timeoutMs);

  const combined = new AbortController();
  const onAbort = () => {
    if (!combined.signal.aborted) combined.abort();
  };
  abort.userAbortController.signal.addEventListener("abort", onAbort);
  abort.timeoutAbortController.signal.addEventListener("abort", onAbort);

  return combined;
}

export function clearAbortState(abort: AbortState): void {
  if (abort.timeoutTimer) {
    clearTimeout(abort.timeoutTimer);
    abort.timeoutTimer = null;
  }
  abort.userAbortController = null;
  abort.timeoutAbortController = null;
}

async function cleanupBackgroundProcesses(): Promise<void> {
  for (const child of backgroundProcesses) {
    try {
      child.kill("SIGTERM");
    } catch {
      // already dead
    }
  }

  if (backgroundProcesses.size > 0) {
    await new Promise((r) => setTimeout(r, 3000));
    for (const child of backgroundProcesses) {
      try {
        child.kill("SIGKILL");
      } catch {
        // already dead
      }
    }
  }
}

async function cleanupMcpClients(): Promise<void> {
  if (!activeCtx?.mcpManager) return;
  try {
    await Promise.race([
      activeCtx.mcpManager.disconnectAll(),
      new Promise((r) => setTimeout(r, 3000)),
    ]);
  } catch {
    // ignore MCP cleanup errors
  }
}

async function fireSessionEndHook(reason: string): Promise<void> {
  if (!activeHookEngine) return;
  try {
    await Promise.race([
      activeHookEngine.fire("SessionEnd", { reason }),
      new Promise((r) => setTimeout(r, 5000)),
    ]);
  } catch {
    // ignore hook errors during shutdown
  }
}

async function gracefulShutdown(_reason: string): Promise<void> {
  if (isShuttingDown) {
    process.exit(1);
  }
  isShuttingDown = true;

  const hookReason =
    _reason === "sigint" || _reason === "sigint_double"
      ? "prompt_input_exit"
      : "other";
  await fireSessionEndHook(hookReason);

  for (const handler of shutdownHandlers) {
    try {
      await Promise.race([handler(), new Promise((r) => setTimeout(r, 5000))]);
    } catch {
      // ignore errors during shutdown
    }
  }

  await cleanupBackgroundProcesses();
  await cleanupMcpClients();

  process.exit(0);
}

export function setupSignalHandlers(): void {
  process.on("SIGINT", () => {
    const now = Date.now();
    if (now - lastSigintTime < 500) {
      gracefulShutdown("sigint_double");
      return;
    }
    lastSigintTime = now;

    const ua = activeCtx?.abort.userAbortController;
    if (ua && !ua.signal.aborted) {
      ua.abort();
    } else {
      gracefulShutdown("sigint");
    }
  });

  process.on("SIGTERM", () => gracefulShutdown("sigterm"));
  process.on("SIGHUP", () => gracefulShutdown("sighup"));
}
