import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { createTempWorkspace, type TempWorkspace } from "../helpers/temp-workspace.js";

const mockHome = vi.hoisted(() => {
  let dir = "/tmp/test-home";
  return { get: () => dir, set: (d: string) => { dir = d; } };
});

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, homedir: () => mockHome.get() };
});

let testHome: TempWorkspace;

beforeEach(async () => {
  testHome = await createTempWorkspace();
  mockHome.set(testHome.dir);
  vi.resetModules();
});

afterEach(async () => {
  await testHome.cleanup();
});

async function setupAgent(name: string, promptContent: string) {
  const agentDir = `${testHome.dir}/.wellgrow/agents/${name}`;
  await mkdir(agentDir, { recursive: true });
  await writeFile(`${agentDir}/system-prompt.md`, promptContent, "utf-8");
}

describe("buildSystemPrompt", () => {
  it("expands template variables in agent prompt", async () => {
    await setupAgent("test", "Hello {{USER_NAME}}, I am {{AGENT_NAME}}.");

    const { buildSystemPrompt } = await import("../../ai/system-prompt.js");
    const result = await buildSystemPrompt({
      agentName: "test",
      templateVars: { USER_NAME: "太郎", AGENT_NAME: "Test" },
    });

    expect(result).toBe("Hello 太郎, I am Test.");
  });

  it("returns empty string when no prompt and no skills", async () => {
    const { buildSystemPrompt } = await import("../../ai/system-prompt.js");
    const result = await buildSystemPrompt({
      agentName: "nonexistent",
      templateVars: {},
    });
    expect(result).toBe("");
  });

  it("appends skills section when skills provided", async () => {
    await setupAgent("test", "Base prompt.");

    const { buildSystemPrompt } = await import("../../ai/system-prompt.js");
    const result = await buildSystemPrompt({
      agentName: "test",
      templateVars: {},
      skills: [
        { name: "bird", description: "X/Twitter CLI", location: "/skills/bird/SKILL.md" },
      ],
    });

    expect(result).toContain("Base prompt.");
    expect(result).toContain("## Skills");
    expect(result).toContain("<name>bird</name>");
    expect(result).toContain("<description>X/Twitter CLI</description>");
    expect(result).toContain("<location>/skills/bird/SKILL.md</location>");
  });

  it("omits skills section when skills array is empty", async () => {
    await setupAgent("test", "No skills.");

    const { buildSystemPrompt } = await import("../../ai/system-prompt.js");
    const result = await buildSystemPrompt({
      agentName: "test",
      templateVars: {},
      skills: [],
    });

    expect(result).toBe("No skills.");
    expect(result).not.toContain("## Skills");
  });

  it("builds skills-only prompt when no agent prompt exists", async () => {
    const { buildSystemPrompt } = await import("../../ai/system-prompt.js");
    const result = await buildSystemPrompt({
      agentName: "nonexistent",
      templateVars: {},
      skills: [
        { name: "gog", description: "Google Calendar", location: "/skills/gog/SKILL.md" },
      ],
    });

    expect(result).toContain("## Skills");
    expect(result).toContain("<name>gog</name>");
  });
});
