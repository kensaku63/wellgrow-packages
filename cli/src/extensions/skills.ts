import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import matter from "gray-matter";
import type { SkillMetadata } from "../ai/system-prompt.js";

function expandTilde(p: string): string {
  return p.startsWith("~") ? join(homedir(), p.slice(1)) : p;
}

async function loadSkillMetadata(
  skillDir: string,
): Promise<SkillMetadata | null> {
  const skillPath = join(skillDir, "SKILL.md");
  try {
    const content = await readFile(skillPath, "utf-8");
    const { data } = matter(content);
    if (!data.name || !data.description) return null;
    return {
      name: data.name as string,
      description: (data.description as string).trim(),
      location: skillPath,
    };
  } catch {
    return null;
  }
}

export async function discoverSkills(
  paths: string[],
): Promise<SkillMetadata[]> {
  const skills: SkillMetadata[] = [];
  const seen = new Set<string>();

  for (const rawPath of paths) {
    const resolved = resolve(expandTilde(rawPath));

    const direct = await loadSkillMetadata(resolved);
    if (direct) {
      if (!seen.has(direct.name)) {
        seen.add(direct.name);
        skills.push(direct);
      }
      continue;
    }

    let entries: string[];
    try {
      entries = await readdir(resolved);
    } catch {
      continue;
    }

    for (const entry of entries) {
      const meta = await loadSkillMetadata(join(resolved, entry));
      if (meta && !seen.has(meta.name)) {
        seen.add(meta.name);
        skills.push(meta);
      }
    }
  }

  return skills;
}
