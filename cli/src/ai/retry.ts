const DEFAULT_MAX_RETRIES = 2;
const MAX_BACKOFF_MS = 8000;

interface RetryConfig {
  maxRetries?: number;
  isAbortedByUser?: () => boolean;
}

function isRetryableStatus(status: number): boolean {
  if (status === 408 || status === 409 || status === 429) return true;
  if (status >= 500) return true;
  return false;
}

function unwrapError(error: unknown): unknown {
  if (!error || typeof error !== "object") return error;
  const err = error as Record<string, unknown>;
  if (err.reason === "maxRetriesExceeded" && err.lastError) {
    return err.lastError;
  }
  return error;
}

function isRetryableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const err = error as Record<string, unknown>;

  if (err.statusCode && typeof err.statusCode === "number") {
    return isRetryableStatus(err.statusCode);
  }

  if (err.code === "ECONNRESET" || err.code === "ETIMEDOUT" || err.code === "ECONNREFUSED") {
    return true;
  }

  const message = String(err.message ?? "");
  if (message.includes("timeout") || message.includes("ECONNRESET")) {
    return true;
  }

  return false;
}

function getErrorStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const code = (error as Record<string, unknown>).statusCode;
  return typeof code === "number" ? code : undefined;
}

export function formatErrorMessage(error: unknown): string {
  const unwrapped = unwrapError(error);
  const status = getErrorStatusCode(unwrapped);

  if (status === 529 || status === 503) {
    return "APIサーバーが混み合っています。しばらく待ってから再試行してください。";
  }
  if (status === 429) {
    return "APIのレート制限に達しました。しばらく待ってから再試行してください。";
  }
  if (status === 401) {
    return "APIキーが無効です。設定を確認してください。";
  }
  if (status === 403) {
    return "APIへのアクセスが拒否されました。APIキーの権限を確認してください。";
  }
  if (status !== undefined && status >= 500) {
    return "APIサーバーでエラーが発生しました。しばらく待ってから再試行してください。";
  }

  const message = unwrapped instanceof Error ? unwrapped.message : String(unwrapped ?? "");
  if (message.includes("ECONNREFUSED") || message.includes("ECONNRESET") || message.includes("ETIMEDOUT")) {
    return "APIサーバーに接続できません。ネットワーク接続を確認してください。";
  }

  if (error instanceof Error) return error.message;
  const str = error != null ? String(error) : "";
  return str || "不明なエラーが発生しました";
}

function isContextLengthError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const err = error as Record<string, unknown>;
  const status = err.statusCode;
  const message = String(err.message ?? err.responseBody ?? "");

  return status === 400 && message.includes("context_length");
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as Record<string, unknown>;
  return err.name === "AbortError" || err.code === "ABORT_ERR";
}

function getRetryDelay(attempt: number, error: unknown): number {
  const err = error as Record<string, unknown>;
  const responseHeaders = err.responseHeaders as Record<string, string> | undefined;

  if (responseHeaders) {
    const retryAfter = responseHeaders["retry-after"];
    const retryAfterMs = responseHeaders["retry-after-ms"];

    if (retryAfterMs) {
      const ms = parseInt(retryAfterMs);
      if (!isNaN(ms) && ms <= 60000) return ms;
    }
    if (retryAfter) {
      const seconds = parseInt(retryAfter);
      if (!isNaN(seconds) && seconds <= 60) return seconds * 1000;
    }
  }

  const baseDelay = 500 * Math.pow(2, attempt);
  const jitter = 0.75 + Math.random() * 0.25;
  return Math.min(baseDelay * jitter, MAX_BACKOFF_MS);
}

export interface RetryResult {
  shouldRetry: boolean;
  isContextExceeded: boolean;
  isUserAborted: boolean;
  delay: number;
  attempt: number;
  errorMessage: string;
}

export function evaluateRetry(
  error: unknown,
  attempt: number,
  config?: RetryConfig,
): RetryResult {
  const maxRetries = config?.maxRetries ?? DEFAULT_MAX_RETRIES;
  const unwrapped = unwrapError(error);

  if (isAbortError(unwrapped)) {
    const userAborted = config?.isAbortedByUser ? config.isAbortedByUser() : true;
    if (userAborted) {
      return {
        shouldRetry: false,
        isContextExceeded: false,
        isUserAborted: true,
        delay: 0,
        attempt,
        errorMessage: "",
      };
    }
    const retryable = attempt < maxRetries;
    return {
      shouldRetry: retryable,
      isContextExceeded: false,
      isUserAborted: false,
      delay: retryable ? getRetryDelay(attempt, unwrapped) : 0,
      attempt,
      errorMessage: "リクエストがタイムアウトしました",
    };
  }

  if (isContextLengthError(unwrapped)) {
    return {
      shouldRetry: false,
      isContextExceeded: true,
      isUserAborted: false,
      delay: 0,
      attempt,
      errorMessage: "コンテキストウィンドウの上限に達しました。\n→ /clear で新しいセッションを開始してください。",
    };
  }

  const retryable = isRetryableError(unwrapped) && attempt < maxRetries;

  return {
    shouldRetry: retryable,
    isContextExceeded: false,
    isUserAborted: false,
    delay: retryable ? getRetryDelay(attempt, unwrapped) : 0,
    attempt,
    errorMessage: formatErrorMessage(error),
  };
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
