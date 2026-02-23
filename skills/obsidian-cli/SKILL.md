---
name: obsidian-cli
description: >
  Obsidian CLI を使って Vault のノートを操作する。
  "obsidianのノートを検索", "ノートを読んで", "ノートに書いて",
  "デイリーノートに追記", "バックリンクを調べて", "orphanノートを探して",
  "Vaultの情報を見て", "タスクを確認", "テンプレートを適用",
  "obsidian search", "obsidian files", "obsidian daily"
  などの発話で使用する。
---

# Obsidian CLI — Vault 操作スキル

Obsidian 1.12.0 (Early Access, 2026-02-10) で導入された公式 CLI。
Obsidian の内部検索インデックスに直接アクセスするため、grep/find によるファイルスキャンと比べて桁違いに高速・低コスト。

## 前提条件

- **Obsidian 1.12.0 以上** が起動していること（CLI は Obsidian アプリの IPC 経由で動作する）
- **Catalyst License** (Insider tier, $25 one-time) が必要
- 設定 → コマンドラインインターフェース で CLI を有効化済み

> CLI は Obsidian のインデックスを利用するため、ヘッドレス環境（デスクトップ環境なしのサーバー等）では動作しない。

## なぜ CLI を使うべきか

| 操作 | grep/find | CLI |
|------|-----------|-----|
| 全文検索 (4,663 files) | 1.95s | 0.32s |
| Orphan ノート検出 | 15.6s, ~7M tokens | 0.26s, ~100 tokens |

ファイルスキャンでは得られないバックリンク、タグ、プロパティ等の構造情報にアクセスできる。

## コマンド一覧

```
obsidian [options] [command]
```

| カテゴリ | サブコマンド | 説明 |
|----------|-------------|------|
| `files` | `list`, `read`, `write`, `total` | ノートの一覧・読み書き・総数 |
| `search` | `content`, `path` | 全文検索、パス検索 |
| `daily` | `prepend`, その他 | デイリーノートの操作 |
| `tasks` | `all`, `pending` | チェックボックスの一括操作 |
| `properties` | `read`, `set` | フロントマター（YAML メタデータ）の読み書き |
| `tags` | `all` | タグ一覧 |
| `links` | `backlinks`, `orphans` 等 | リンク・バックリンク・孤立ノート |
| `bookmarks` | — | ブックマーク管理 |
| `templates` | `list`, `apply` | テンプレートの一覧・適用 |
| `plugins` | `list`, `versions` | プラグインの一覧・バージョン確認 |
| `themes` | — | テーマ管理 |
| `sync` | — | Obsidian Sync 関連 |
| `dev` | `eval` | JavaScript 実行 |
| `vault` | — | Vault 統計情報（ファイル数、フォルダ数） |
| `version` | — | バージョン表示 |

## よく使うコマンド例

### ノート検索

```bash
# 全文検索
obsidian search content "プロジェクト計画"

# パス名で検索
obsidian search path "daily"
```

### ノートの読み書き

```bash
# ノート一覧
obsidian files list

# ノートを読む
obsidian files read "Projects/my-project.md"

# ノートに書き込む
obsidian files write "Projects/my-project.md" "新しい内容"

# ファイル総数
obsidian files total
```

### デイリーノート

```bash
# 今日のデイリーノートに先頭追記（日付やファイル名の計算不要）
obsidian daily prepend "- クライアントミーティング完了"
```

### リンク・グラフ

```bash
# バックリンク取得
obsidian links backlinks "Project Alpha"

# 孤立ノート（どこからもリンクされていないノート）
obsidian links orphans
```

### プロパティ（フロントマター）

```bash
# プロパティ読み取り
obsidian properties read "Projects/my-project.md"

# プロパティ設定
obsidian properties set "Projects/my-project.md" status "in-progress"
```

### タスク管理

```bash
# 全タスク一覧
obsidian tasks all

# 未完了タスクのみ
obsidian tasks pending
```

### テンプレート

```bash
# テンプレート一覧
obsidian templates list

# テンプレート適用
obsidian templates apply "meeting-template"
```

### Vault 情報

```bash
# Vault 概要（ファイル数、フォルダ数）
obsidian vault

# 全タグ一覧
obsidian tags all

# プラグインとバージョン
obsidian plugins versions
```

### JavaScript 実行

```bash
# 開発者向け: JavaScript を Obsidian 内で実行
obsidian dev eval "app.vault.getMarkdownFiles().length"
```

## Vault の指定

複数の Vault がある場合は `--vault` フラグで指定する:

```bash
obsidian search content "keyword" --vault MyVault
```

## TUI モード

引数なしで `obsidian` を実行するとターミナル UI が起動する:

```bash
obsidian
```

| キー | 操作 |
|------|------|
| `↑↓` | ファイル選択 |
| `Enter` | ファイルを開く |
| `/` | 検索 |
| `n` | 新規ファイル作成 |
| `d` | ファイル削除 |
| `r` | ファイル名変更 |
| `q` | 終了 |

## AI エージェントでの活用ガイドライン

### 基本方針

- **常に `obsidian` CLI を優先する**: grep/find でのファイルスキャンは最後の手段
- **`obsidian search` を使う**: ファイルシステムの全文スキャンの代わりに
- **`obsidian links` を使う**: バックリンクやグラフ構造のクエリに
- **`obsidian properties` を使う**: フロントマターの読み書きに

### 典型的なワークフロー

1. **コンテキスト収集**: `obsidian search content "テーマ"` で関連ノートを探す
2. **詳細確認**: `obsidian files read "path/to/note.md"` で内容を読む
3. **構造理解**: `obsidian links backlinks "note"` でつながりを把握する
4. **書き込み**: `obsidian files write` や `obsidian daily prepend` で結果を保存する

### パフォーマンスのコツ

- 検索は CLI のインデックスを使うので何度呼んでも低コスト
- ファイル内容を全部読む必要がない場合は `search` で十分
- 大量のノートを一括処理するときは `files list` + パイプライン

## トラブルシューティング

| 問題 | 原因 | 対処 |
|------|------|------|
| コマンドが何も返さない | Obsidian が起動していない | Obsidian アプリを起動する |
| 出力が空 (Windows) | 管理者権限のターミナル | 通常ユーザー権限で実行 |
| `obsidian: command not found` | CLI 未有効化 or PATH 未設定 | 設定 → CLI を有効化 |
| IPC 接続エラー | Obsidian のバージョンが古い | 1.12.0 以上にアップデート |

## 参考リンク

- [Obsidian CLI 公式ドキュメント](https://help.obsidian.md/cli)
- [Obsidian 1.12.0 Changelog](https://obsidian.md/changelog/2026-02-10-desktop-v1.12.0/)
