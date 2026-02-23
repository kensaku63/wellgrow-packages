import { marked } from "marked";
import { colors } from "./colors.js";

// marked-terminal は内部で chalk を使用しており、chalk は ESM モジュール
// 初期化時に NO_COLOR / FORCE_COLOR 環境変数でカラーレベルを決定する。
// static import では環境変数操作が間に合わないため、dynamic import で
// chalk 初期化前に FORCE_COLOR=1 を設定してカラーレンダリングを有効にする。
let initialized = false;

async function ensureInitialized(): Promise<void> {
  if (initialized) return;
  initialized = true;

  const savedNoColor = process.env.NO_COLOR;
  const savedForceColor = process.env.FORCE_COLOR;
  delete process.env.NO_COLOR;
  process.env.FORCE_COLOR = "1";

  const { markedTerminal } = await import("marked-terminal");
  const chalk = (await import("chalk")).default;

  marked.use(
    markedTerminal({
      firstHeading: chalk.hex(colors.growth).bold,
      heading: chalk.hex(colors.growth).bold,
      code: chalk.hex("#e5c07b"),
      codespan: chalk.hex("#e5c07b"),
      link: chalk.hex("#569cd6"),
      href: chalk.hex("#569cd6").underline,
      blockquote: chalk.hex(colors.fog).italic,
      del: chalk.hex(colors.fog).strikethrough,
    }),
  );

  if (savedNoColor !== undefined) {
    process.env.NO_COLOR = savedNoColor;
  }
  if (savedForceColor !== undefined) {
    process.env.FORCE_COLOR = savedForceColor;
  } else {
    delete process.env.FORCE_COLOR;
  }
}

// アプリ起動時に呼び出して初期化を完了させる
export const markdownReady = ensureInitialized();

export function renderMarkdown(text: string): string {
  try {
    const result = marked.parse(text);
    if (typeof result === "string") {
      return result.trimEnd();
    }
    return text;
  } catch {
    return text;
  }
}
