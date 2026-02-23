import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir, platform, release } from "node:os";
import type { WellGrowConfig } from "../config/types.js";

const WELLGROW_HOME = join(homedir(), ".wellgrow");
const MANUAL_DIR = join(WELLGROW_HOME, "manual");

const DAY_NAMES = [
  "日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日",
];

export interface TemplateVarContext {
  agentName: string;
  agentDir: string;
  config: WellGrowConfig;
  environment?: string;
}

async function buildManualListing(): Promise<string> {
  let entries: string[];
  try {
    entries = (await readdir(MANUAL_DIR)).filter((e) => e.endsWith(".md")).sort();
  } catch {
    return "";
  }
  if (entries.length === 0) return "";

  const lines = entries.map((e) => `- ${MANUAL_DIR}/${e}`);
  return lines.join("\n");
}

export async function buildTemplateVars(ctx: TemplateVarContext): Promise<Record<string, string>> {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const localDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  const vars: Record<string, string> = {
    WELLGROW_HOME: WELLGROW_HOME,
    AGENT_NAME: ctx.agentName,
    AGENT_DIR: ctx.agentDir,
    CURRENT_DATE: `${localDate} ${pad(now.getHours())}:00`,
    CURRENT_DATETIME: now.toISOString(),
    DAY_OF_WEEK: DAY_NAMES[now.getDay()],
    OS: `${platform()} ${release()}`,
    SHELL: process.env.SHELL ?? "unknown",
    CWD: process.cwd(),
    HOME: homedir(),
  };

  if (ctx.config.user?.name) {
    vars.USER_NAME = ctx.config.user.name;
  }

  if (ctx.environment) {
    vars.ENVIRONMENT = ctx.environment;
  }

  const manualListing = await buildManualListing();
  if (manualListing) {
    vars.WELLGROW_MANUAL = manualListing;
  }

  return vars;
}

export function expandTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => vars[key] ?? match);
}
