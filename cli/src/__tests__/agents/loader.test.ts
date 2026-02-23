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

async function setupAgent(
  name: string,
  config: Record<string, unknown>,
  prompt?: string,
) {
  const { stringify } = await import("smol-toml");
  const agentDir = `${testHome.dir}/.wellgrow/agents/${name}`;
  await mkdir(agentDir, { recursive: true });
  await writeFile(`${agentDir}/agent.toml`, stringify(config), "utf-8");
  if (prompt !== undefined) {
    await writeFile(`${agentDir}/system-prompt.md`, prompt, "utf-8");
  }
}

describe("loadAgentConfig", () => {
  it("loads valid agent config", async () => {
    await setupAgent("test", {
      agent: {
        name: "Test Agent",
        description: "A test agent",
        icon: "🧪",
      },
    });

    const { loadAgentConfig } = await import("../../agents/loader.js");
    const config = await loadAgentConfig("test");

    expect(config.agent.name).toBe("Test Agent");
    expect(config.agent.description).toBe("A test agent");
    expect(config.agent.icon).toBe("🧪");
  });

  it("applies default icon when not specified", async () => {
    await setupAgent("test", {
      agent: { name: "Test", description: "Desc" },
    });

    const { loadAgentConfig } = await import("../../agents/loader.js");
    const config = await loadAgentConfig("test");
    expect(config.agent.icon).toBe("🤖");
  });

  it("throws on missing agent directory", async () => {
    const { loadAgentConfig } = await import("../../agents/loader.js");
    await expect(loadAgentConfig("nonexistent")).rejects.toThrow();
  });

  it("throws on invalid TOML", async () => {
    const agentDir = `${testHome.dir}/.wellgrow/agents/bad`;
    await mkdir(agentDir, { recursive: true });
    await writeFile(`${agentDir}/agent.toml`, "[[[[invalid", "utf-8");

    const { loadAgentConfig } = await import("../../agents/loader.js");
    await expect(loadAgentConfig("bad")).rejects.toThrow();
  });

  it("throws on schema validation failure", async () => {
    await setupAgent("invalid", { agent: { name: 123 } });

    const { loadAgentConfig } = await import("../../agents/loader.js");
    await expect(loadAgentConfig("invalid")).rejects.toThrow();
  });

  it("parses optional fields", async () => {
    await setupAgent("full", {
      agent: {
        name: "Full",
        description: "Full agent",
        model: "gemini-3.1-pro-preview",
        mode: "plan",
        max_turns: 50,
      },
      tools: { builtin: ["Read", "Write"] },
      skills: { paths: ["~/skills"] },
    });

    const { loadAgentConfig } = await import("../../agents/loader.js");
    const config = await loadAgentConfig("full");
    expect(config.agent.model).toBe("gemini-3.1-pro-preview");
    expect(config.agent.mode).toBe("plan");
    expect(config.agent.max_turns).toBe(50);
    expect(config.tools?.builtin).toEqual(["Read", "Write"]);
    expect(config.skills?.paths).toEqual(["~/skills"]);
  });
});

describe("loadAgentPrompt", () => {
  it("returns prompt content", async () => {
    await setupAgent(
      "test",
      { agent: { name: "Test", description: "D" } },
      "You are a helpful assistant.",
    );

    const { loadAgentPrompt } = await import("../../agents/loader.js");
    const prompt = await loadAgentPrompt("test");
    expect(prompt).toBe("You are a helpful assistant.");
  });

  it("returns null when prompt file missing", async () => {
    await setupAgent("test", { agent: { name: "Test", description: "D" } });

    const { loadAgentPrompt } = await import("../../agents/loader.js");
    const prompt = await loadAgentPrompt("test");
    expect(prompt).toBeNull();
  });

  it("returns null for empty prompt file", async () => {
    await setupAgent(
      "test",
      { agent: { name: "Test", description: "D" } },
      "   ",
    );

    const { loadAgentPrompt } = await import("../../agents/loader.js");
    const prompt = await loadAgentPrompt("test");
    expect(prompt).toBeNull();
  });
});

describe("listAgents", () => {
  it("returns empty array when agents dir missing", async () => {
    const { listAgents } = await import("../../agents/loader.js");
    const agents = await listAgents();
    expect(agents).toEqual([]);
  });

  it("lists valid agents", async () => {
    await setupAgent("alpha", {
      agent: { name: "Alpha", description: "First", icon: "🅰️" },
    });
    await setupAgent("beta", {
      agent: { name: "Beta", description: "Second", icon: "🅱️" },
    });

    const { listAgents } = await import("../../agents/loader.js");
    const agents = await listAgents();
    expect(agents).toHaveLength(2);
    const names = agents.map((a) => a.name);
    expect(names).toContain("Alpha");
    expect(names).toContain("Beta");
  });

  it("skips invalid agent directories", async () => {
    await setupAgent("valid", {
      agent: { name: "Valid", description: "OK" },
    });

    const invalidDir = `${testHome.dir}/.wellgrow/agents/invalid`;
    await mkdir(invalidDir, { recursive: true });
    await writeFile(`${invalidDir}/agent.toml`, "bad toml {{", "utf-8");

    const { listAgents } = await import("../../agents/loader.js");
    const agents = await listAgents();
    expect(agents).toHaveLength(1);
    expect(agents[0].name).toBe("Valid");
  });
});

describe("getAgentsDir / getAgentDir", () => {
  it("returns correct paths", async () => {
    const { getAgentsDir, getAgentDir } = await import("../../agents/loader.js");
    expect(getAgentsDir()).toBe(`${testHome.dir}/.wellgrow/agents`);
    expect(getAgentDir("joy")).toBe(`${testHome.dir}/.wellgrow/agents/joy`);
  });
});
