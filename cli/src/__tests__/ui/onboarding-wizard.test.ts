import { describe, it, expect } from "vitest";
import { isValidName, isValidApiKey } from "../../ui/onboarding-wizard.js";

describe("isValidName", () => {
  it("accepts non-empty string", () => {
    expect(isValidName("太郎")).toBe(true);
  });

  it("accepts string with leading/trailing whitespace", () => {
    expect(isValidName("  太郎  ")).toBe(true);
  });

  it("rejects empty string", () => {
    expect(isValidName("")).toBe(false);
  });

  it("rejects whitespace-only string", () => {
    expect(isValidName("   ")).toBe(false);
  });

  it("accepts single character name", () => {
    expect(isValidName("A")).toBe(true);
  });

  it("accepts names with special characters", () => {
    expect(isValidName("John Doe")).toBe(true);
    expect(isValidName("田中-太郎")).toBe(true);
  });
});

describe("isValidApiKey", () => {
  it("accepts key with sk-ant- prefix", () => {
    expect(isValidApiKey("sk-ant-api03-abcdef")).toBe(true);
  });

  it("rejects empty string", () => {
    expect(isValidApiKey("")).toBe(false);
  });

  it("rejects key without correct prefix", () => {
    expect(isValidApiKey("sk-invalid-key")).toBe(false);
  });

  it("rejects key with only prefix", () => {
    expect(isValidApiKey("sk-ant-")).toBe(true);
  });

  it("accepts key with whitespace (trims)", () => {
    expect(isValidApiKey("  sk-ant-key123  ")).toBe(true);
  });

  it("rejects whitespace-only string", () => {
    expect(isValidApiKey("   ")).toBe(false);
  });

  it("accepts OAuth token format", () => {
    expect(isValidApiKey("sk-ant-oat01-abcdef")).toBe(true);
  });
});
