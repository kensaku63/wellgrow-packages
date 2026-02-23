---
name: blogwatcher
description: >
  BlogWatcher CLI を使ってブログ記事を追跡・管理する。
  RSS/Atom フィードと HTML スクレイピングの両方に対応し、新着記事の検出と既読管理ができる。
  "ブログを登録", "ブログをウォッチ", "新着記事をスキャン", "未読記事を見せて",
  "blogwatcher add", "blogwatcher scan", "blogwatcher articles",
  "ブログを追加して", "記事を既読にして" などで使用する。
---

# BlogWatcher CLI — ブログ記事トラッカー

お気に入りのブログの新着記事を自動検出し、未読/既読を管理する Go 製 CLI ツール。
RSS/Atom フィードを優先的に使い、フィードがないサイトには HTML スクレイピングでフォールバックする。

- リポジトリ: https://github.com/Hyaxia/blogwatcher
- データ保存先: `~/.blogwatcher/blogwatcher.db`（SQLite）

## コマンド一覧

| コマンド | 用途 |
|----------|------|
| `blogwatcher add <名前> <URL>` | ブログを追跡対象に追加 |
| `blogwatcher blogs` | 追跡中のブログ一覧 |
| `blogwatcher remove <名前>` | ブログを削除（記事も削除） |
| `blogwatcher scan [名前]` | 新着記事をスキャン（名前省略で全ブログ） |
| `blogwatcher articles` | 未読記事を一覧表示 |
| `blogwatcher articles --all` | 全記事を一覧表示（既読含む） |
| `blogwatcher articles --blog <名前>` | 特定ブログの記事のみ表示 |
| `blogwatcher read <ID>` | 記事を既読にする |
| `blogwatcher unread <ID>` | 記事を未読に戻す |
| `blogwatcher read-all` | 全未読記事を既読にする |

## ブログの追加パターン

### 1. 基本（RSS 自動検出）

```bash
blogwatcher add "Real Python" https://realpython.com
```

ブログの HTML から `<link rel="alternate">` タグや `/feed`, `/rss`, `/atom.xml` 等のパスを自動検出する。

### 2. フィード URL を明示指定

```bash
blogwatcher add "Go Blog" https://go.dev/blog --feed-url https://go.dev/blog/feed.atom
```

自動検出がうまくいかない場合や、特定のフィードを指定したい場合に使う。

### 3. HTML スクレイピング（RSS がないサイト）

```bash
blogwatcher add "No-RSS Blog" https://example.com --scrape-selector "article h2 a"
```

CSSセレクタで記事リンクを指定する。よく使うセレクタ例：

| セレクタ | 対象 |
|----------|------|
| `article h2 a` | `<article>` 内の `<h2>` のリンク |
| `.post-title a` | `.post-title` クラスのリンク |
| `#blog-posts a` | `#blog-posts` 内のリンク |
| `.entry-title a` | WordPress 系サイトでよく使われるパターン |

## 効果的なワークフロー

### 日常の使い方

```bash
# 1. 朝に全ブログをスキャン
blogwatcher scan

# 2. 未読記事を確認
blogwatcher articles

# 3. 読んだ記事を既読にする（記事IDを指定）
blogwatcher read 42

# 4. 特定ブログの記事だけ確認したいとき
blogwatcher articles --blog "Real Python"
```

### まとめて既読にする

```bash
# 全ブログの未読を一括既読
blogwatcher read-all

# 特定ブログだけ一括既読（確認プロンプトをスキップ）
blogwatcher read-all --blog "Real Python" --yes
```

### ブログの整理

```bash
# 追跡中のブログ一覧を確認
blogwatcher blogs

# 不要になったブログを削除（確認プロンプトあり）
blogwatcher remove "Old Blog"

# 確認なしで削除
blogwatcher remove "Old Blog" -y
```

## おすすめブログ登録例

技術ブログのウォッチに特に便利。以下は登録例：

```bash
blogwatcher add "Go Blog" https://go.dev/blog
blogwatcher add "React Blog" https://react.dev/blog
blogwatcher add "Hacker News Best" https://news.ycombinator.com/best --feed-url https://hnrss.org/best
blogwatcher add "GitHub Blog" https://github.blog
```

## スキャンの仕組み

1. 各ブログに対して、まず RSS/Atom フィードのパースを試みる
2. フィード URL が未設定なら、ブログのトップページからフィードを自動検出
3. RSS パースが失敗し `scrape_selector` が設定されていれば、HTML スクレイピングにフォールバック
4. 新しい記事は未読としてデータベースに保存
5. 既に追跡済みの記事はスキップ（重複防止）

## トラブルシューティング

| 問題 | 対処 |
|------|------|
| `blogwatcher: command not found` | インストール方法を確認。`go install` の場合は `$GOPATH/bin` が PATH に含まれているか確認 |
| スキャンしても記事が見つからない | `--feed-url` でフィード URL を明示指定するか、`--scrape-selector` で HTML スクレイピングを試す |
| スクレイピングで記事が取れない | ブラウザの開発者ツールで記事リンクの CSS セレクタを確認し、`--scrape-selector` を調整する |
| 同じ記事が重複して登録される | 通常は URL ベースで重複防止されるが、URL が変わった場合は手動で `remove` → `add` し直す |
