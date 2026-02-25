# WellGrow Packages

WellGrow の外部配布パッケージ群。

## パッケージ一覧

### [@wellgrow/cli](./cli/)

AI チャットアシスタント CLI。エージェントシステム、MCP 連携、スキル・フック拡張を備えたターミナル AI。

```bash
npm install -g @wellgrow/cli
wellgrow
```

[![npm](https://img.shields.io/npm/v/@wellgrow/cli)](https://www.npmjs.com/package/@wellgrow/cli)

### [wellgrow-skills](./skills/)

WellGrow MCP 用の Agent Skills。AI エージェントに WellGrow の使い方を教える。

| Skill | 説明 |
|-------|------|
| `wellgrow-setup` | MCP サーバーのセットアップガイド |
| `wellgrow` | 基本動作スキル（検索・記録・活用） |

#### Skills のインストール

[Agent Skills 仕様](https://agentskills.io) に準拠。`npx skills add` で Claude Code / Cursor など 40+ エージェントに対応。

```bash
npx skills add kensaku63/wellgrow-packages
```

エージェントの自動検出・対話的な選択でインストールされます。

**オプション:**

```bash
# スキル一覧を確認
npx skills add kensaku63/wellgrow-packages --list

# 特定のスキルだけインストール
npx skills add kensaku63/wellgrow-packages --skill wellgrow --skill wellgrow-setup

# グローバルにインストール（全プロジェクトで利用可）
npx skills add kensaku63/wellgrow-packages -g

# 特定エージェントにインストール
npx skills add kensaku63/wellgrow-packages -a claude-code -a cursor

# 更新
npx skills update
```

<details>
<summary>手動インストール</summary>

**Claude Code:**
```bash
git clone https://github.com/kensaku63/wellgrow-packages.git /tmp/wellgrow-packages
cp -r /tmp/wellgrow-packages/skills/wellgrow ~/.claude/skills/wellgrow
cp -r /tmp/wellgrow-packages/skills/wellgrow-setup ~/.claude/skills/wellgrow-setup
rm -rf /tmp/wellgrow-packages
```

**Cursor:**
```bash
git clone https://github.com/kensaku63/wellgrow-packages.git /tmp/wellgrow-packages
cp -r /tmp/wellgrow-packages/skills/wellgrow ~/.cursor/skills/wellgrow
cp -r /tmp/wellgrow-packages/skills/wellgrow-setup ~/.cursor/skills/wellgrow-setup
rm -rf /tmp/wellgrow-packages
```

</details>
