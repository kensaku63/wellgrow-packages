import { describe, it, expect, vi, afterEach } from "vitest";
import { evaluateRetry, sleep, formatErrorMessage } from "../ai/retry.js";

describe("evaluateRetry", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("abort errors", () => {
    it("returns userAborted when AbortError and no isAbortedByUser", () => {
      const error = Object.assign(new Error("aborted"), { name: "AbortError" });
      const result = evaluateRetry(error, 0);

      expect(result.isUserAborted).toBe(true);
      expect(result.shouldRetry).toBe(false);
      expect(result.isContextExceeded).toBe(false);
    });

    it("returns userAborted when isAbortedByUser returns true", () => {
      const error = Object.assign(new Error("aborted"), { name: "AbortError" });
      const result = evaluateRetry(error, 0, { isAbortedByUser: () => true });

      expect(result.isUserAborted).toBe(true);
      expect(result.shouldRetry).toBe(false);
    });

    it("treats AbortError as retryable timeout when isAbortedByUser returns false", () => {
      vi.spyOn(Math, "random").mockReturnValue(0.5);
      const error = Object.assign(new Error("timeout"), { name: "AbortError" });
      const result = evaluateRetry(error, 0, {
        isAbortedByUser: () => false,
        maxRetries: 2,
      });

      expect(result.isUserAborted).toBe(false);
      expect(result.shouldRetry).toBe(true);
      expect(result.delay).toBeGreaterThan(0);
      expect(result.errorMessage).toBe("リクエストがタイムアウトしました");
    });

    it("does not retry timeout abort when attempt >= maxRetries", () => {
      const error = Object.assign(new Error("timeout"), { name: "AbortError" });
      const result = evaluateRetry(error, 2, {
        isAbortedByUser: () => false,
        maxRetries: 2,
      });

      expect(result.shouldRetry).toBe(false);
      expect(result.delay).toBe(0);
    });

    it("recognizes ABORT_ERR code", () => {
      const error = Object.assign(new Error("aborted"), { code: "ABORT_ERR" });
      const result = evaluateRetry(error, 0);

      expect(result.isUserAborted).toBe(true);
    });
  });

  describe("context length errors", () => {
    it("detects context_length error", () => {
      const error = { statusCode: 400, message: "context_length exceeded" };
      const result = evaluateRetry(error, 0);

      expect(result.isContextExceeded).toBe(true);
      expect(result.shouldRetry).toBe(false);
      expect(result.errorMessage).toContain("コンテキストウィンドウ");
    });

    it("detects context_length in responseBody", () => {
      const error = {
        statusCode: 400,
        responseBody: '{"error":"context_length exceeded"}',
      };
      const result = evaluateRetry(error, 0);

      expect(result.isContextExceeded).toBe(true);
    });

    it("does not treat other 400 errors as context length", () => {
      const error = { statusCode: 400, message: "invalid request" };
      const result = evaluateRetry(error, 0);

      expect(result.isContextExceeded).toBe(false);
    });
  });

  describe("retryable HTTP errors", () => {
    it.each([408, 409, 429, 500, 502, 503])(
      "retries on HTTP %i",
      (status) => {
        vi.spyOn(Math, "random").mockReturnValue(0.5);
        const error = { statusCode: status, message: `HTTP ${status}` };
        const result = evaluateRetry(error, 0, { maxRetries: 2 });

        expect(result.shouldRetry).toBe(true);
        expect(result.delay).toBeGreaterThan(0);
      },
    );

    it("does not retry on HTTP 401", () => {
      const error = { statusCode: 401, message: "Unauthorized" };
      const result = evaluateRetry(error, 0, { maxRetries: 2 });

      expect(result.shouldRetry).toBe(false);
    });

    it("does not retry when attempt >= maxRetries", () => {
      const error = { statusCode: 429, message: "Rate limited" };
      const result = evaluateRetry(error, 2, { maxRetries: 2 });

      expect(result.shouldRetry).toBe(false);
    });
  });

  describe("network errors", () => {
    it.each(["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED"])(
      "retries on %s",
      (code) => {
        vi.spyOn(Math, "random").mockReturnValue(0.5);
        const error = { code, message: `connect ${code}` };
        const result = evaluateRetry(error, 0, { maxRetries: 2 });

        expect(result.shouldRetry).toBe(true);
      },
    );

    it("retries when message contains 'timeout'", () => {
      vi.spyOn(Math, "random").mockReturnValue(0.5);
      const error = new Error("request timeout");
      const result = evaluateRetry(error, 0, { maxRetries: 2 });

      expect(result.shouldRetry).toBe(true);
    });

    it("retries when message contains 'ECONNRESET'", () => {
      vi.spyOn(Math, "random").mockReturnValue(0.5);
      const error = new Error("read ECONNRESET");
      const result = evaluateRetry(error, 0, { maxRetries: 2 });

      expect(result.shouldRetry).toBe(true);
    });
  });

  describe("non-retryable errors", () => {
    it("does not retry null", () => {
      const result = evaluateRetry(null, 0, { maxRetries: 2 });
      expect(result.shouldRetry).toBe(false);
    });

    it("does not retry undefined", () => {
      const result = evaluateRetry(undefined, 0, { maxRetries: 2 });
      expect(result.shouldRetry).toBe(false);
    });

    it("does not retry plain Error without matching properties", () => {
      const error = new Error("some random error");
      const result = evaluateRetry(error, 0, { maxRetries: 2 });
      expect(result.shouldRetry).toBe(false);
    });

    it("uses Error.message for errorMessage", () => {
      const error = new Error("specific message");
      const result = evaluateRetry(error, 0);
      expect(result.errorMessage).toBe("specific message");
    });

    it("stringifies non-Error for errorMessage", () => {
      const result = evaluateRetry("string error", 0);
      expect(result.errorMessage).toBe("string error");
    });
  });

  describe("retry delay", () => {
    it("respects retry-after-ms header", () => {
      const error = {
        statusCode: 429,
        message: "rate limited",
        responseHeaders: { "retry-after-ms": "1500" },
      };
      const result = evaluateRetry(error, 0, { maxRetries: 2 });

      expect(result.delay).toBe(1500);
    });

    it("respects retry-after header (seconds)", () => {
      const error = {
        statusCode: 429,
        message: "rate limited",
        responseHeaders: { "retry-after": "3" },
      };
      const result = evaluateRetry(error, 0, { maxRetries: 2 });

      expect(result.delay).toBe(3000);
    });

    it("prefers retry-after-ms over retry-after", () => {
      const error = {
        statusCode: 429,
        message: "rate limited",
        responseHeaders: {
          "retry-after": "5",
          "retry-after-ms": "2000",
        },
      };
      const result = evaluateRetry(error, 0, { maxRetries: 2 });

      expect(result.delay).toBe(2000);
    });

    it("falls back to exponential backoff when no headers", () => {
      vi.spyOn(Math, "random").mockReturnValue(0);
      const error = { statusCode: 500, message: "Internal Server Error" };

      const r0 = evaluateRetry(error, 0, { maxRetries: 5 });
      const r1 = evaluateRetry(error, 1, { maxRetries: 5 });

      expect(r0.delay).toBe(375);
      expect(r1.delay).toBe(750);
    });

    it("caps delay at MAX_BACKOFF_MS (8000)", () => {
      vi.spyOn(Math, "random").mockReturnValue(1);
      const error = { statusCode: 500, message: "error" };

      const result = evaluateRetry(error, 10, { maxRetries: 20 });
      expect(result.delay).toBe(8000);
    });

    it("ignores retry-after-ms > 60000", () => {
      vi.spyOn(Math, "random").mockReturnValue(0.5);
      const error = {
        statusCode: 429,
        message: "rate limited",
        responseHeaders: { "retry-after-ms": "120000" },
      };
      const result = evaluateRetry(error, 0, { maxRetries: 2 });

      expect(result.delay).toBeLessThan(60000);
    });

    it("ignores retry-after > 60 seconds", () => {
      vi.spyOn(Math, "random").mockReturnValue(0.5);
      const error = {
        statusCode: 429,
        message: "rate limited",
        responseHeaders: { "retry-after": "120" },
      };
      const result = evaluateRetry(error, 0, { maxRetries: 2 });

      expect(result.delay).toBeLessThan(60000);
    });
  });

  describe("defaults", () => {
    it("uses default maxRetries of 2 when not specified", () => {
      vi.spyOn(Math, "random").mockReturnValue(0.5);
      const error = { statusCode: 500, message: "error" };

      expect(evaluateRetry(error, 0).shouldRetry).toBe(true);
      expect(evaluateRetry(error, 1).shouldRetry).toBe(true);
      expect(evaluateRetry(error, 2).shouldRetry).toBe(false);
    });
  });
});

describe("formatErrorMessage", () => {
  it("returns friendly message for 529 Overloaded", () => {
    const error = Object.assign(new Error("Overloaded"), { statusCode: 529 });
    expect(formatErrorMessage(error)).toContain("混み合っています");
  });

  it("returns friendly message for 503 Service Unavailable", () => {
    const error = { statusCode: 503, message: "Service Unavailable" };
    expect(formatErrorMessage(error)).toContain("混み合っています");
  });

  it("returns friendly message for 429 rate limit", () => {
    const error = { statusCode: 429, message: "Rate limited" };
    expect(formatErrorMessage(error)).toContain("レート制限");
  });

  it("returns friendly message for 401 unauthorized", () => {
    const error = { statusCode: 401, message: "Unauthorized" };
    expect(formatErrorMessage(error)).toContain("APIキー");
  });

  it("returns friendly message for 500+ server errors", () => {
    const error = { statusCode: 500, message: "Internal Server Error" };
    expect(formatErrorMessage(error)).toContain("サーバーでエラー");
  });

  it("returns friendly message for connection errors", () => {
    const error = new Error("connect ECONNREFUSED");
    expect(formatErrorMessage(error)).toContain("接続できません");
  });

  it("unwraps RetryError to check lastError", () => {
    const inner = Object.assign(new Error("Overloaded"), { statusCode: 529 });
    const retryError = Object.assign(
      new Error("Failed after 3 attempts"),
      { reason: "maxRetriesExceeded", lastError: inner },
    );
    expect(formatErrorMessage(retryError)).toContain("混み合っています");
  });

  it("returns Error.message for unknown errors", () => {
    expect(formatErrorMessage(new Error("something"))).toBe("something");
  });

  it("stringifies non-Error values", () => {
    expect(formatErrorMessage("string error")).toBe("string error");
  });

  it("returns default message for null/undefined", () => {
    expect(formatErrorMessage(null)).toBe("不明なエラーが発生しました");
    expect(formatErrorMessage(undefined)).toBe("不明なエラーが発生しました");
  });
});

describe("evaluateRetry with RetryError", () => {
  it("unwraps RetryError and retries on retryable inner error", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const inner = Object.assign(new Error("Overloaded"), { statusCode: 529 });
    const retryError = Object.assign(
      new Error("Failed after 3 attempts"),
      { reason: "maxRetriesExceeded", lastError: inner },
    );

    const result = evaluateRetry(retryError, 0, { maxRetries: 2 });

    expect(result.shouldRetry).toBe(true);
    expect(result.delay).toBeGreaterThan(0);
    expect(result.errorMessage).toContain("混み合っています");
  });

  it("unwraps RetryError and does not retry on non-retryable inner error", () => {
    const inner = Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    const retryError = Object.assign(
      new Error("Failed after 3 attempts"),
      { reason: "maxRetriesExceeded", lastError: inner },
    );

    const result = evaluateRetry(retryError, 0, { maxRetries: 2 });

    expect(result.shouldRetry).toBe(false);
    expect(result.errorMessage).toContain("APIキー");
  });
});

describe("sleep", () => {
  it("resolves after specified ms", async () => {
    const start = Date.now();
    await sleep(50);
    expect(Date.now() - start).toBeGreaterThanOrEqual(40);
  });
});
