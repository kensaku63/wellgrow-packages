import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

function skillContent(name: string, description: string): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\nSkill content here.`;
}

describe("discoverSkills", () => {
  it("discovers skill from direct path", async () => {
    const skillDir = `${testHome.dir}/skills/bird`;
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      `${skillDir}/SKILL.md`,
      skillContent("bird", "X/Twitter CLI"),
      "utf-8",
    );

    const { discoverSkills } = await import("../../extensions/skills.js");
    const skills = await discoverSkills([skillDir]);

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("bird");
    expect(skills[0].description).toBe("X/Twitter CLI");
  });

  it("discovers skills from parent directory", async () => {
    const parentDir = `${testHome.dir}/skills`;

    for (const name of ["bird", "gog"]) {
      const skillDir = `${parentDir}/${name}`;
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        `${skillDir}/SKILL.md`,
        skillContent(name, `${name} skill`),
        "utf-8",
      );
    }

    const { discoverSkills } = await import("../../extensions/skills.js");
    const skills = await discoverSkills([parentDir]);

    expect(skills).toHaveLength(2);
    const names = skills.map((s) => s.name);
    expect(names).toContain("bird");
    expect(names).toContain("gog");
  });

  it("deduplicates skills with same name", async () => {
    const dir1 = `${testHome.dir}/skills1/bird`;
    const dir2 = `${testHome.dir}/skills2/bird`;
    await mkdir(dir1, { recursive: true });
    await mkdir(dir2, { recursive: true });
    await writeFile(`${dir1}/SKILL.md`, skillContent("bird", "First"), "utf-8");
    await writeFile(`${dir2}/SKILL.md`, skillContent("bird", "Second"), "utf-8");

    const { discoverSkills } = await import("../../extensions/skills.js");
    const skills = await discoverSkills([dir1, dir2]);

    expect(skills).toHaveLength(1);
    expect(skills[0].description).toBe("First");
  });

  it("skips SKILL.md without required frontmatter", async () => {
    const skillDir = `${testHome.dir}/skills/incomplete`;
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      `${skillDir}/SKILL.md`,
      "---\nname: test\n---\nNo description.",
      "utf-8",
    );

    const { discoverSkills } = await import("../../extensions/skills.js");
    const skills = await discoverSkills([skillDir]);

    expect(skills).toHaveLength(0);
  });

  it("handles nonexistent path gracefully", async () => {
    const { discoverSkills } = await import("../../extensions/skills.js");
    const skills = await discoverSkills(["/nonexistent/path"]);
    expect(skills).toEqual([]);
  });

  it("handles empty paths array", async () => {
    const { discoverSkills } = await import("../../extensions/skills.js");
    const skills = await discoverSkills([]);
    expect(skills).toEqual([]);
  });

  it("expands tilde in paths", async () => {
    const skillDir = `${testHome.dir}/skills/home-skill`;
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      `${skillDir}/SKILL.md`,
      skillContent("home-skill", "Home skill"),
      "utf-8",
    );

    const { discoverSkills } = await import("../../extensions/skills.js");
    const skills = await discoverSkills(["~/skills/home-skill"]);

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("home-skill");
  });

  it("merges skills from multiple paths", async () => {
    const dir1 = `${testHome.dir}/a/s1`;
    const dir2 = `${testHome.dir}/b/s2`;
    await mkdir(dir1, { recursive: true });
    await mkdir(dir2, { recursive: true });
    await writeFile(`${dir1}/SKILL.md`, skillContent("s1", "Skill 1"), "utf-8");
    await writeFile(`${dir2}/SKILL.md`, skillContent("s2", "Skill 2"), "utf-8");

    const { discoverSkills } = await import("../../extensions/skills.js");
    const skills = await discoverSkills([dir1, dir2]);

    expect(skills).toHaveLength(2);
  });
});
