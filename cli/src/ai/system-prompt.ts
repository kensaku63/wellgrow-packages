import { loadAgentPrompt } from "../agents/loader.js";
import { expandTemplate } from "./template-vars.js";

export interface SkillMetadata {
  name: string;
  description: string;
  location: string;
}

export interface SystemPromptOptions {
  agentName: string;
  templateVars: Record<string, string>;
  skills?: SkillMetadata[];
}

function buildAvailableSkillsSection(skills: SkillMetadata[]): string {
  const entries = skills
    .map(
      (s) =>
        `<skill>\n  <name>${s.name}</name>\n  <description>${s.description}</description>\n  <location>${s.location}</location>\n</skill>`,
    )
    .join("\n");

  return `## Skills

利用可能なスキルが <available_skills> に列挙されている。
ユーザーの要求に関連するスキルがあると判断した場合、まず Read ツールで該当する SKILL.md を読み、その指示に従うこと。
スキルは編集・追加できる。手順は \`~/.wellgrow/manual/skills.md\` を参照。

<available_skills>
${entries}
</available_skills>`;
}

export async function buildSystemPrompt(
  options: SystemPromptOptions,
): Promise<string> {
  const rawPrompt = await loadAgentPrompt(options.agentName);

  const parts: string[] = [];

  if (rawPrompt) {
    parts.push(expandTemplate(rawPrompt, options.templateVars));
  }

  if (options.skills?.length) {
    parts.push(buildAvailableSkillsSection(options.skills));
  }

  return parts.join("\n\n");
}
