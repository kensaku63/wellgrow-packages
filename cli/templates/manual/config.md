# 設定ファイル

`~/.wellgrow/config.toml` で全エージェント共通の設定を行う。`[default]` のスカラー値は agent.toml で上書き可能。

> **注意**: `[skills]`・`[mcp]`・`[hooks]` のパスはすべてのエージェントに適用される。特定のエージェントだけで使いたい場合は、ここではなく agent.toml 側に設定すること。

```toml
[default]
model = "claude-opus-4-6"      # LLM モデル
provider = "anthropic"          # "anthropic" | "google" | "openai"
agent = "joy"                   # デフォルトエージェント名
mode = "auto"                   # "auto" | "plan"
max_turns = 100
max_output_tokens = 16384

[user]
name = "あなたの名前"

[providers.anthropic]
api_key_env = "ANTHROPIC_API_KEY"    # 環境変数名を指定
# api_key = "sk-..."                 # 直接指定も可

[providers.google]
api_key_env = "GOOGLE_GENERATIVE_AI_API_KEY"

[providers.openai]
api_key_env = "OPENAI_API_KEY"

# 全エージェント共通で使う場合のみ記載する。
# エージェント固有の設定は agent.toml に書くことを推奨。
[skills]
paths = []
[mcp]
paths = []
[hooks]
paths = []

[permissions]
allowed_mcps = []               # 自動承認する MCP サーバー名

[api]
max_retries = 2
timeout = 600000                # ミリ秒

[logging]
verbose = false
log_dir = "~/.wellgrow/logs"

[history]
storage = "local"
max_sessions = 1000
```
