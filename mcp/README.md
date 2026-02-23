# @wellgrow/mcp

WellGrow MCP Server — AI エージェントからユーザーのパーソナルナレッジベースにアクセスする。

## 機能

- **search_user_context** — 質問・回答をセマンティック検索
- **list_questions** — 質問一覧を取得（タグ・ステータスでフィルタ可）
- **answer_question** — 質問に対して回答を書き込む
- **active-questions** リソース — アクティブな質問一覧（`@wellgrow` で参照）

## セットアップ

### 1. インストール

```bash
npm install -g @wellgrow/mcp
```

### 2. 環境変数

| 変数 | 説明 | 必須 |
|------|------|------|
| `WELLGROW_EMAIL` | WellGrow のログインメール | Yes |
| `WELLGROW_PASSWORD` | WellGrow のログインパスワード | Yes |
| `OPENAI_API_KEY` | OpenAI API キー（検索の embedding 生成用） | Yes |

### 3. MCP サーバーの登録

#### Claude Code

```bash
claude mcp add --transport stdio \
  --env WELLGROW_EMAIL=user@example.com \
  --env WELLGROW_PASSWORD=mypassword \
  --env OPENAI_API_KEY=sk-... \
  --scope user \
  wellgrow -- wellgrow-mcp
```

#### Cursor

`~/.cursor/mcp.json` に追加:

```json
{
  "mcpServers": {
    "wellgrow": {
      "command": "wellgrow-mcp",
      "env": {
        "WELLGROW_EMAIL": "user@example.com",
        "WELLGROW_PASSWORD": "mypassword",
        "OPENAI_API_KEY": "sk-..."
      }
    }
  }
}
```

### 4. 動作確認

```bash
claude mcp list
```

### 5. アップデート

```bash
npm update -g @wellgrow/mcp
```

## 使い方

```
ユーザー: 「私の最近の質問を見せて」
AI: → list_questions → 質問一覧を表示

ユーザー: 「健康に関する過去の回答を調べて」
AI: → search_user_context → 検索結果を表示

ユーザー: 「この質問に『毎朝5分の瞑想から始める』と回答して」
AI: → answer_question → 回答を保存
```

## 開発

```bash
npm install
npm run build
npm run typecheck
```
