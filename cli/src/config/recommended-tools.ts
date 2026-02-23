import { detectTool } from "../ai/environment.js";

// ----- Types -----

export interface RecommendedTool {
  name: string;
  description: string;
  install: { brew: string; apt: string };
}

export interface RecommendedCategory {
  label: string;
  tools: RecommendedTool[];
}

export interface ToolCheckResult {
  name: string;
  description: string;
  installed: boolean;
  version: string | null;
  install: { brew: string; apt: string };
}

export interface DoctorResult {
  categories: Array<{
    label: string;
    tools: ToolCheckResult[];
  }>;
  installedCount: number;
  missingCount: number;
}

// ----- Catalog -----

export const RECOMMENDED_TOOLS: RecommendedCategory[] = [
  {
    label: "データ処理",
    tools: [
      { name: "jq", description: "JSON 加工・抽出", install: { brew: "brew install jq", apt: "sudo apt install -y jq" } },
    ],
  },
  {
    label: "高速検索",
    tools: [
      { name: "rg", description: "grep の高速版 (ripgrep)", install: { brew: "brew install ripgrep", apt: "sudo apt install -y ripgrep" } },
    ],
  },
  {
    label: "JS/TS 実行",
    tools: [
      { name: "bun", description: "高速 JS/TS ランタイム", install: { brew: "brew install bun", apt: "curl -fsSL https://bun.sh/install | bash" } },
    ],
  },
  {
    label: "Python 実行",
    tools: [
      { name: "uv", description: "高速 Python パッケージ実行", install: { brew: "brew install uv", apt: "curl -LsSf https://astral.sh/uv/install.sh | sh" } },
    ],
  },
  {
    label: "Git / GitHub",
    tools: [
      { name: "gh", description: "GitHub CLI（PR 作成等）", install: { brew: "brew install gh", apt: "sudo apt install -y gh" } },
    ],
  },
  {
    label: "Google Apps Script",
    tools: [
      { name: "clasp", description: "Apps Script CLI（作成・デプロイ）", install: { brew: "npm install -g @google/clasp", apt: "npm install -g @google/clasp" } },
    ],
  },
];

// ----- Markdown -----

export function toMarkdown(): string {
  const lines = [
    "",
    "---",
    "",
    "以下はエージェントの基本動作に役立つ CLI ツールです。`wellgrow doctor` でインストール状況を確認できます。",
    "",
  ];

  for (const cat of RECOMMENDED_TOOLS) {
    for (const t of cat.tools) {
      lines.push(`## ${t.name} — ${t.description}`, "");
      lines.push(`\`${t.install.brew}\` / \`${t.install.apt}\``);
      lines.push("");
    }
  }

  return lines.join("\n");
}

// ----- Check -----

export async function checkRecommendedTools(): Promise<DoctorResult> {
  const allTools = RECOMMENDED_TOOLS.flatMap((c) => c.tools);
  const results = await Promise.all(
    allTools.map(async (t) => {
      const info = await detectTool(t.name);
      return {
        name: t.name,
        description: t.description,
        installed: info !== null,
        version: info?.version ?? null,
        install: t.install,
      };
    }),
  );

  let idx = 0;
  const categories = RECOMMENDED_TOOLS.map((cat) => {
    const catTools = cat.tools.map(() => results[idx++]!);
    return { label: cat.label, tools: catTools };
  });

  const installedCount = results.filter((r) => r.installed).length;
  const missingCount = results.filter((r) => !r.installed).length;

  return { categories, installedCount, missingCount };
}
