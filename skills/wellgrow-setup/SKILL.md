---
name: wellgrow-setup
description: >
  WellGrow のセットアップを案内する。
  "wellgrowをセットアップ", "wellgrow MCPを入れたい", "setup wellgrow",
  "install wellgrow", "connect wellgrow", "wellgrowを接続",
  "wellgrow CLIを入れたい", "wellgrow CLIをセットアップ",
  などの発話で使用する。
---

# WellGrow セットアップ

WellGrow のセットアップを案内する。2つの方法がある。

- **方法 A（推奨）**: WellGrow CLI をインストールし、オンボーディングで MCP も含めて一括セットアップする
- **方法 B**: CLI は使わず、WellGrow MCP だけを手動で設定する

## 前提条件

- Node.js 20 以上（未導入なら https://nodejs.org を案内）

## 手順

### Step 1: 方法の選択

ユーザーに以下を聞く：

> WellGrow CLI をインストールしますか？
> CLI をインストールすると、ターミナルで AI チャットが使えるほか、オンボーディングで MCP の設定も一緒にできます（推奨）。
> CLI なしで MCP だけ設定することもできます。

- **はい** → 方法 A へ
- **いいえ** → 方法 B へ

---

## 方法 A: CLI インストール（推奨）

### Step A-1: CLI のインストール

ユーザーにターミナルで以下を実行してもらう：

```bash
npm install -g @wellgrow/cli
```

### Step A-2: オンボーディングの実行

インストール後、ターミナルで以下を実行してもらう：

```bash
wellgrow
```

初回起動時にオンボーディングウィザードが自動的に開始される。ウィザードでは以下が順番に案内される：

1. 名前の入力
2. Anthropic API キーの設定
3. WellGrow MCP の設定（メール・パスワード・OpenAI API キーを含む）
4. 推奨ツール・スキルのインストール

ユーザーにはオンボーディングの指示に従って進めてもらえばよい。MCP も含めてすべて設定できる。

### Step A-3: 完了確認

オンボーディングが完了すると、CLI がそのまま使えるようになる。

```bash
wellgrow --version
```

このスキルの役割はここまで。あとはオンボーディングエージェントが引き継ぐ。

---

## 方法 B: MCP のみ（CLI なし）

CLI をインストールしない場合、WellGrow MCP を手動で設定する。

### Step B-1: 情報の確認

ユーザーに以下を聞く：

1. **使用ツール** — Claude Code か Cursor か
2. **WellGrow アカウント** — メールアドレスとパスワード
3. **OpenAI API キー** — 未取得なら https://platform.openai.com/api-keys を案内

> Supabase の接続情報はパッケージに組み込み済みのため、ユーザーへの確認は不要。

### Step B-2: MCP のグローバルインストール

```bash
npm install -g @wellgrow/mcp
```

グローバルインストールにより `wellgrow-mcp` コマンドが使えるようになり、起動が高速になる。

### Step B-3: MCP サーバーの登録

#### Claude Code

```bash
claude mcp add --transport stdio \
  --env WELLGROW_EMAIL=<email> \
  --env WELLGROW_PASSWORD=<password> \
  --env OPENAI_API_KEY=<openai_key> \
  --scope user \
  wellgrow -- wellgrow-mcp
```

`--scope user` で全プロジェクトから利用可能。

#### Cursor

`~/.cursor/mcp.json` に追加：

```json
{
  "mcpServers": {
    "wellgrow": {
      "command": "wellgrow-mcp",
      "env": {
        "WELLGROW_EMAIL": "<email>",
        "WELLGROW_PASSWORD": "<password>",
        "OPENAI_API_KEY": "<openai_key>"
      }
    }
  }
}
```

### Step B-4: MCP の動作確認

MCP の `list_questions` ツールを呼び出して接続を確認する。
質問一覧が返ってくれば成功。

---

## トラブルシューティング

### CLI 関連

| エラー | 対処 |
|--------|------|
| `wellgrow: command not found` | `npm install -g @wellgrow/cli` を再実行。Node.js のグローバル bin が PATH に含まれているか確認 |
| `ANTHROPIC_API_KEY` 未設定エラー | シェルの環境変数に `export ANTHROPIC_API_KEY=...` を追加し、シェルを再起動 |

### MCP 関連

| エラー | 対処 |
|--------|------|
| `Authentication failed` | メール / パスワードを確認 |
| `OPENAI_API_KEY is required` | OpenAI API キーを確認 |
| `wellgrow-mcp: command not found` | `npm install -g @wellgrow/mcp` を再実行。Node.js のグローバル bin が PATH に含まれているか確認 |
| 接続タイムアウト | ネットワーク接続を確認 |
| パスワード変更後に認証失敗 | env のパスワードを新しいものに更新 |

## アップデート

```bash
npm update -g @wellgrow/cli    # CLI
npm update -g @wellgrow/mcp    # MCP
```
