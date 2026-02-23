import { describe, it, expect } from "vitest";
import { isValidName, isValidApiKey } from "../../ui/onboarding-wizard.js";

// ---------------------------------------------------------------------------
// isValidName
// ---------------------------------------------------------------------------

describe("isValidName", () => {
  it("accepts non-empty string", () => {
    expect(isValidName("太郎")).toBe(true);
  });

  it("accepts string with surrounding whitespace", () => {
    expect(isValidName("  太郎  ")).toBe(true);
  });

  it("rejects empty string", () => {
    expect(isValidName("")).toBe(false);
  });

  it("rejects whitespace-only string", () => {
    expect(isValidName("   ")).toBe(false);
    expect(isValidName("\t\n")).toBe(false);
  });

  it("accepts single character", () => {
    expect(isValidName("A")).toBe(true);
  });

  it("accepts names with special characters", () => {
    expect(isValidName("山田 太郎")).toBe(true);
    expect(isValidName("O'Brien")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isValidApiKey
// ---------------------------------------------------------------------------

describe("isValidApiKey", () => {
  it("accepts valid Anthropic API key", () => {
    expect(isValidApiKey("sk-ant-api03-abcdefg123456789")).toBe(true);
  });

  it("accepts key with surrounding whitespace", () => {
    expect(isValidApiKey("  sk-ant-abc123  ")).toBe(true);
  });

  it("rejects empty string", () => {
    expect(isValidApiKey("")).toBe(false);
  });

  it("rejects whitespace-only string", () => {
    expect(isValidApiKey("   ")).toBe(false);
  });

  it("rejects key without sk-ant- prefix", () => {
    expect(isValidApiKey("sk-abc123")).toBe(false);
    expect(isValidApiKey("api-key-123")).toBe(false);
    expect(isValidApiKey("random-string")).toBe(false);
  });

  it("rejects keys from other providers", () => {
    expect(isValidApiKey("sk-proj-abc123")).toBe(false);
    expect(isValidApiKey("gsk_abc123")).toBe(false);
  });

  it("accepts the bare minimum valid prefix", () => {
    expect(isValidApiKey("sk-ant-x")).toBe(true);
  });
});
