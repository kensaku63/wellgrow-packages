import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { parseSource, discoverSkillsInRepo } from "../../commands/skills.js";
import {
  createTempWorkspace,
  type TempWorkspace,
} from "../helpers/temp-workspace.js";

// ---------------------------------------------------------------------------
// parseSource
// ---------------------------------------------------------------------------

describe("parseSource", () => {
  it("expands shorthand GitHub notation", () => {
    const result = parseSource("user/repo");
    expect(result.url).toBe("https://github.com/user/repo.git");
    expect(result.ref).toBeUndefined();
  });

  it("handles shorthand with dots and hyphens", () => {
    const result = parseSource("my-org/my-repo.js");
    expect(result.url).toBe("https://github.com/my-org/my-repo.js.git");
  });

  it("preserves raw HTTPS URL", () => {
    const result = parseSource("https://github.com/user/repo.git");
    expect(result.url).toBe("https://github.com/user/repo.git");
    expect(result.ref).toBeUndefined();
  });

  it("strips trailing slash from HTTPS URL", () => {
    const result = parseSource("https://github.com/user/repo/");
    expect(result.url).toBe("https://github.com/user/repo");
  });

  it("extracts ref from GitHub tree URL", () => {
    const result = parseSource(
      "https://github.com/user/repo/tree/feature-branch",
    );
    expect(result.url).toBe("https://github.com/user/repo.git");
    expect(result.ref).toBe("feature-branch");
  });

  it("preserves git@ SSH URL", () => {
    const result = parseSource("git@github.com:user/repo.git");
    expect(result.url).toBe("git@github.com:user/repo.git");
  });

  it("treats relative path as local directory", () => {
    const result = parseSource("./my-skills");
    expect(result.url).toMatch(/\/my-skills$/);
    expect(result.ref).toBeUndefined();
  });

  it("treats absolute path as local directory", () => {
    const result = parseSource("/home/user/skills");
    expect(result.url).toBe("/home/user/skills");
  });
});

// ---------------------------------------------------------------------------
// discoverSkillsInRepo
// ---------------------------------------------------------------------------

describe("discoverSkillsInRepo", () => {
  let ws: TempWorkspace;

  beforeEach(async () => {
    ws = await createTempWorkspace();
  });

  afterEach(async () => {
    await ws.cleanup();
  });

  async function writeSkill(
    relativePath: string,
    name: string,
    description: string,
  ): Promise<void> {
    const dir = join(ws.dir, relativePath);
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "SKILL.md"),
      `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`,
      "utf-8",
    );
  }

  it("discovers a skill at root level", async () => {
    await writeSkill(".", "my-skill", "My awesome skill");

    const skills = await discoverSkillsInRepo(ws.dir);

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("my-skill");
    expect(skills[0].description).toBe("My awesome skill");
    expect(skills[0].sourceDir).toBe(ws.dir);
  });

  it("discovers skills in subdirectories", async () => {
    await writeSkill("skills/alpha", "alpha", "Alpha skill");
    await writeSkill("skills/beta", "beta", "Beta skill");

    const skills = await discoverSkillsInRepo(ws.dir);

    expect(skills).toHaveLength(2);
    const names = skills.map((s) => s.name).sort();
    expect(names).toEqual(["alpha", "beta"]);
  });

  it("returns empty array for directory with no SKILL.md", async () => {
    await mkdir(join(ws.dir, "empty-dir"), { recursive: true });

    const skills = await discoverSkillsInRepo(ws.dir);

    expect(skills).toEqual([]);
  });

  it("skips SKILL.md without required frontmatter", async () => {
    const dir = join(ws.dir, "bad-skill");
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "SKILL.md"),
      "# No frontmatter\n\nJust content.",
      "utf-8",
    );

    const skills = await discoverSkillsInRepo(ws.dir);

    expect(skills).toEqual([]);
  });

  it("skips SKILL.md missing name", async () => {
    const dir = join(ws.dir, "no-name");
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "SKILL.md"),
      "---\ndescription: has desc but no name\n---\n",
      "utf-8",
    );

    const skills = await discoverSkillsInRepo(ws.dir);

    expect(skills).toEqual([]);
  });

  it("skips SKILL.md missing description", async () => {
    const dir = join(ws.dir, "no-desc");
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "SKILL.md"),
      "---\nname: has-name\n---\n",
      "utf-8",
    );

    const skills = await discoverSkillsInRepo(ws.dir);

    expect(skills).toEqual([]);
  });

  it("deduplicates skills with same name", async () => {
    await writeSkill("a", "same-name", "First occurrence");
    await writeSkill("b", "same-name", "Second occurrence");

    const skills = await discoverSkillsInRepo(ws.dir);

    expect(skills).toHaveLength(1);
  });

  it("skips .git directories", async () => {
    await writeSkill(".git/hooks", "hidden", "Should be skipped");
    await writeSkill("visible", "visible", "Should be found");

    const skills = await discoverSkillsInRepo(ws.dir);

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("visible");
  });

  it("skips node_modules directories", async () => {
    await writeSkill("node_modules/pkg", "pkg-skill", "Should be skipped");
    await writeSkill("src", "src-skill", "Should be found");

    const skills = await discoverSkillsInRepo(ws.dir);

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("src-skill");
  });

  it("respects max depth of 3", async () => {
    await writeSkill("a/b/c", "deep-ok", "Depth 3 - should be found");
    await writeSkill("a/b/c/d", "too-deep", "Depth 4 - should be skipped");

    const skills = await discoverSkillsInRepo(ws.dir);

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("deep-ok");
  });

  it("stops scanning into subdirectories when SKILL.md is found", async () => {
    await writeSkill("parent", "parent-skill", "Parent");
    await writeSkill("parent/child", "child-skill", "Child");

    const skills = await discoverSkillsInRepo(ws.dir);

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("parent-skill");
  });

  it("handles nonexistent directory gracefully", async () => {
    const skills = await discoverSkillsInRepo("/nonexistent/path/xyz");

    expect(skills).toEqual([]);
  });
});
