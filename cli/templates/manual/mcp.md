# MCP サーバー

`.mcp.json` 形式は Claude Code・Cursor・Windsurf 等で共通の MCP 標準フォーマット。既存の `.mcp.json` をそのまま利用できる。

agent.toml の `[mcp].paths` にファイルパスを指定して読み込む。複数ファイルを指定でき、すべてマージされる。config.toml の `[mcp].paths` に書くと全エージェントに適用される。

```toml
# agent.toml の設定例
[mcp]
paths = [
  "~/.wellgrow/mcp/wellgrow.json",
  "~/.wellgrow/mcp/notion.json",
  "~/.claude/.mcp.json",
  "./project/.mcp.json",
]
```

1 MCP = 1 JSON で管理すると、エージェントごとに必要なサーバーだけを選んで読み込める。

`~/.wellgrow/mcp/wellgrow.json` の例:

```json
{
  "mcpServers": {
    "wellgrow": {
      "type": "http",
      "url": "https://wellgrow.ai/api/mcp"
    }
  }
}
```

`type` は `"stdio"`（デフォルト）、`"http"`、`"sse"` に対応。`http`/`sse` の場合は `command` の代わりに `url` を指定する。

同名サーバーは後勝ち（agent.toml 側が優先）。

## アプリでの MCP 設定

ChatGPT や Claude のアプリからも MCP サーバーに接続できる。CLI を使わずブラウザだけで完結する。

### ChatGPT

1. 設定 → アプリ → 「アプリを作成する（高度な設定）」を開く
2. 名前に `wellgrow` を入力
3. MCP サーバー URL に `https://wellgrow.ai/api/mcp` を入力
4. 保存して、OAuth ログインを完了する

### Claude

1. 設定 → コネクタ → 「カスタムコネクタを追加」を開く
2. 名前に `wellgrow` を入力
3. リモート MCP サーバー URL に `https://wellgrow.ai/api/mcp` を入力
4. 保存して、OAuth ログインを完了する
