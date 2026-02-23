# フック

ツール実行やセッションの各タイミングに処理を差し込む仕組み。ガードレール（危険な操作のブロック）や自動チェックに使う。

`~/.wellgrow/hooks/` に JSON ファイルとして配置する。config.toml の `[hooks].paths` が常に読み込まれ、agent.toml の `[hooks].paths` で追加できる。

## イベント

| イベント | タイミング | matcher 対象 |
|---------|-----------|-------------|
| `PreToolUse` | ツール実行前 | ツール名 |
| `PostToolUse` | ツール実行成功後 | ツール名 |
| `PostToolUseFailure` | ツール実行失敗後 | ツール名 |
| `PermissionRequest` | 権限要求時 | ツール名 |
| `SessionStart` | セッション開始時 | ソース名 |
| `SessionEnd` | セッション終了時 | 理由 |
| `UserPromptSubmit` | プロンプト送信時 | — |
| `Stop` | 停止要求時 | — |

## 設定例

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'checking...'",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

`matcher`: 完全一致、正規表現、または `"*"` で全マッチ。

## フック種別

**command**: コマンドを実行する。

- 終了コード 0 → 許可（そのまま続行）
- 終了コード 2 → ブロック（ツール実行を中止し、stderr の内容がエージェントにフィードバックされる）
- それ以外 → 無視（フック自体の失敗として扱われ、ツール実行には影響しない）

```json
{ "type": "command", "command": "...", "timeout": 30 }
```

**prompt**: LLM にプロンプトを送り、その応答をエージェントのコンテキストに注入する。コードレビューや安全性チェックなど、判断を伴う処理に使う。

- `$ARGUMENTS` にはツール名・入力パラメータなどイベントごとのデータが JSON で入る

```json
{ "type": "prompt", "prompt": "...", "model": "claude-sonnet-4-6" }
```
