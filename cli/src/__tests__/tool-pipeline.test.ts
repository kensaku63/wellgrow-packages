import { describe, it, expect, beforeEach } from "vitest";
import {
  createToolPipeline,
  isBashReadOnly,
  type ToolPipeline,
} from "../tools/pipeline.js";
import type { ToolMeta } from "../tools/registry.js";

function meta(
  category: ToolMeta["category"],
  source: ToolMeta["source"] = "builtin",
): ToolMeta {
  return { category, source };
}

// ---------------------------------------------------------------------------
// isBashReadOnly
// ---------------------------------------------------------------------------

describe("isBashReadOnly", () => {
  it("allows simple read-only commands", () => {
    expect(isBashReadOnly("ls")).toBe(true);
    expect(isBashReadOnly("pwd")).toBe(true);
    expect(isBashReadOnly("cat foo.txt")).toBe(true);
    expect(isBashReadOnly("echo hello")).toBe(true);
    expect(isBashReadOnly("head -n 10 file.ts")).toBe(true);
    expect(isBashReadOnly("tree src/")).toBe(true);
    expect(isBashReadOnly("wc -l file.ts")).toBe(true);
  });

  it("allows read-only git subcommands", () => {
    expect(isBashReadOnly("git status")).toBe(true);
    expect(isBashReadOnly("git log --oneline")).toBe(true);
    expect(isBashReadOnly("git diff")).toBe(true);
    expect(isBashReadOnly("git show HEAD")).toBe(true);
    expect(isBashReadOnly("git branch -a")).toBe(true);
    expect(isBashReadOnly("git blame file.ts")).toBe(true);
  });

  it("rejects write git subcommands", () => {
    expect(isBashReadOnly("git commit -m 'msg'")).toBe(false);
    expect(isBashReadOnly("git push")).toBe(false);
    expect(isBashReadOnly("git checkout -b new-branch")).toBe(false);
    expect(isBashReadOnly("git merge main")).toBe(false);
    expect(isBashReadOnly("git rebase main")).toBe(false);
    expect(isBashReadOnly("git reset --hard")).toBe(false);
  });

  it("rejects bare git without subcommand", () => {
    expect(isBashReadOnly("git")).toBe(false);
  });

  it("allows piped read-only commands", () => {
    expect(isBashReadOnly("cat file.ts | grep foo")).toBe(true);
    expect(isBashReadOnly("ls -la | sort | head -5")).toBe(true);
    expect(isBashReadOnly("git log --oneline | wc -l")).toBe(true);
  });

  it("rejects commands with redirects", () => {
    expect(isBashReadOnly("echo hello > file.txt")).toBe(false);
    expect(isBashReadOnly("cat a.txt >> b.txt")).toBe(false);
    expect(isBashReadOnly("ls > output.txt")).toBe(false);
  });

  it("rejects non-whitelisted commands", () => {
    expect(isBashReadOnly("rm -rf /")).toBe(false);
    expect(isBashReadOnly("npm install")).toBe(false);
    expect(isBashReadOnly("mkdir foo")).toBe(false);
    expect(isBashReadOnly("chmod 755 script.sh")).toBe(false);
    expect(isBashReadOnly("cp a.txt b.txt")).toBe(false);
    expect(isBashReadOnly("mv a.txt b.txt")).toBe(false);
  });

  it("rejects piped commands with non-whitelisted segment", () => {
    expect(isBashReadOnly("cat file.ts | npm install")).toBe(false);
    expect(isBashReadOnly("ls | rm -rf")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// evaluate — auto mode
// ---------------------------------------------------------------------------

describe("evaluate in auto mode", () => {
  let pipeline: ToolPipeline;

  beforeEach(() => {
    pipeline = createToolPipeline({ mode: "auto" });
  });

  it("auto-approves read tools", () => {
    expect(pipeline.evaluate("Read", meta("read")).action).toBe("auto");
    expect(pipeline.evaluate("Glob", meta("read")).action).toBe("auto");
    expect(pipeline.evaluate("Grep", meta("read")).action).toBe("auto");
  });

  it("auto-approves write tools", () => {
    expect(pipeline.evaluate("Write", meta("write")).action).toBe("auto");
    expect(pipeline.evaluate("Edit", meta("write")).action).toBe("auto");
  });

  it("auto-approves execute tools", () => {
    expect(pipeline.evaluate("Bash", meta("execute"), { command: "npm install" }).action).toBe("auto");
  });

  it("auto-approves interactive and internal tools", () => {
    expect(pipeline.evaluate("AskUser", meta("interactive")).action).toBe("auto");
    expect(pipeline.evaluate("TodoWrite", meta("internal")).action).toBe("auto");
  });

  it("blocks dangerous commands", () => {
    const result = pipeline.evaluate("Bash", meta("execute"), { command: "rm -rf /" });
    expect(result.action).toBe("block");
  });

  it("requires approval for unapproved MCP tools", () => {
    expect(pipeline.evaluate("mcp__server__tool", meta("read", "mcp")).action).toBe("approve");
  });

  it("auto-approves allowed MCP tools", () => {
    pipeline.markMcpAllowed("server");
    expect(pipeline.evaluate("mcp__server__tool", meta("read", "mcp")).action).toBe("auto");
  });
});

// ---------------------------------------------------------------------------
// evaluate — plan mode
// ---------------------------------------------------------------------------

describe("evaluate in plan mode", () => {
  let pipeline: ToolPipeline;

  beforeEach(() => {
    pipeline = createToolPipeline({ mode: "plan" });
  });

  it("auto-approves read category", () => {
    expect(pipeline.evaluate("Read", meta("read")).action).toBe("auto");
    expect(pipeline.evaluate("Glob", meta("read")).action).toBe("auto");
    expect(pipeline.evaluate("Grep", meta("read")).action).toBe("auto");
  });

  it("auto-approves interactive and internal categories", () => {
    expect(pipeline.evaluate("AskUser", meta("interactive")).action).toBe("auto");
    expect(pipeline.evaluate("TodoWrite", meta("internal")).action).toBe("auto");
  });

  it("requires approval for write category", () => {
    expect(pipeline.evaluate("Write", meta("write")).action).toBe("approve");
    expect(pipeline.evaluate("Edit", meta("write")).action).toBe("approve");
  });

  it("auto-approves read-only Bash commands", () => {
    expect(pipeline.evaluate("Bash", meta("execute"), { command: "ls -la" }).action).toBe("auto");
    expect(pipeline.evaluate("Bash", meta("execute"), { command: "git status" }).action).toBe("auto");
    expect(pipeline.evaluate("Bash", meta("execute"), { command: "cat file.ts | grep foo" }).action).toBe("auto");
  });

  it("requires approval for write Bash commands", () => {
    expect(pipeline.evaluate("Bash", meta("execute"), { command: "npm install" }).action).toBe("approve");
    expect(pipeline.evaluate("Bash", meta("execute"), { command: "echo foo > file.txt" }).action).toBe("approve");
  });

  it("requires approval for Bash without command arg", () => {
    expect(pipeline.evaluate("Bash", meta("execute")).action).toBe("approve");
    expect(pipeline.evaluate("Bash", meta("execute"), {}).action).toBe("approve");
  });

  it("blocks dangerous commands", () => {
    const result = pipeline.evaluate("Bash", meta("execute"), { command: "rm -rf /" });
    expect(result.action).toBe("block");
  });

  it("requires approval for unapproved MCP tools", () => {
    expect(pipeline.evaluate("mcp__server__tool", meta("read", "mcp")).action).toBe("approve");
  });

  it("returns approve for unknown tools", () => {
    expect(pipeline.evaluate("Unknown", undefined).action).toBe("approve");
  });
});

// ---------------------------------------------------------------------------
// isDangerous
// ---------------------------------------------------------------------------

describe("dangerous command detection", () => {
  let pipeline: ToolPipeline;

  beforeEach(() => {
    pipeline = createToolPipeline({ mode: "auto" });
  });

  it("blocks rm -rf /", () => {
    expect(pipeline.evaluate("Bash", meta("execute"), { command: "rm -rf /" }).action).toBe("block");
  });

  it("blocks chmod 777", () => {
    expect(pipeline.evaluate("Bash", meta("execute"), { command: "chmod 777 /tmp" }).action).toBe("block");
  });

  it("blocks mkfs", () => {
    expect(pipeline.evaluate("Bash", meta("execute"), { command: "mkfs.ext4 /dev/sda1" }).action).toBe("block");
  });

  it("blocks dd to device", () => {
    expect(pipeline.evaluate("Bash", meta("execute"), { command: "dd if=/dev/zero of=/dev/sda" }).action).toBe("block");
  });

  it("does not block safe commands", () => {
    expect(pipeline.evaluate("Bash", meta("execute"), { command: "ls -la" }).action).toBe("auto");
    expect(pipeline.evaluate("Bash", meta("execute"), { command: "npm run test" }).action).toBe("auto");
  });

  it("only checks Bash tool", () => {
    expect(pipeline.evaluate("Read", meta("read"), { command: "rm -rf /" }).action).toBe("auto");
  });
});

// ---------------------------------------------------------------------------
// MCP allowed management
// ---------------------------------------------------------------------------

describe("MCP allowed management", () => {
  it("initializes with provided allowed list", () => {
    const pipeline = createToolPipeline({ mode: "auto", allowedMcps: ["wellgrow"] });
    expect(pipeline.evaluate("mcp__wellgrow__search", meta("read", "mcp")).action).toBe("auto");
    expect(pipeline.evaluate("mcp__other__search", meta("read", "mcp")).action).toBe("approve");
  });

  it("adds server to allowed list via markMcpAllowed", () => {
    const pipeline = createToolPipeline({ mode: "auto" });
    expect(pipeline.evaluate("mcp__server__tool", meta("read", "mcp")).action).toBe("approve");

    pipeline.markMcpAllowed("server");
    expect(pipeline.evaluate("mcp__server__tool", meta("read", "mcp")).action).toBe("auto");
  });
});

// ---------------------------------------------------------------------------
// setMode
// ---------------------------------------------------------------------------

describe("setMode", () => {
  it("changes mode at runtime", () => {
    const pipeline = createToolPipeline({ mode: "auto" });
    expect(pipeline.evaluate("Write", meta("write")).action).toBe("auto");

    pipeline.setMode("plan");
    expect(pipeline.evaluate("Write", meta("write")).action).toBe("approve");
    expect(pipeline.evaluate("Read", meta("read")).action).toBe("auto");
  });

  it("exposes current mode via mode getter", () => {
    const pipeline = createToolPipeline({ mode: "plan" });
    expect(pipeline.mode).toBe("plan");

    pipeline.setMode("auto");
    expect(pipeline.mode).toBe("auto");
  });
});

// ---------------------------------------------------------------------------
// createDeniedResult
// ---------------------------------------------------------------------------

describe("createDeniedResult", () => {
  it("creates a denied tool result", () => {
    const pipeline = createToolPipeline({ mode: "plan" });
    const result = pipeline.createDeniedResult("call-1", "Write", "ユーザーが拒否");

    expect(result).toEqual({
      type: "tool-result",
      toolCallId: "call-1",
      toolName: "Write",
      output: {
        type: "execution-denied",
        reason: "ユーザーが拒否",
      },
    });
  });
});
