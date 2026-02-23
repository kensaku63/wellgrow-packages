# おすすめツール

WellGrow AI の能力を拡張するツール・MCP サーバー・スキルの一覧。

## スキルのインストール（共通）

各ツールに対応するスキルを `wellgrow skills add` でインストールできる。
詳細な設定方法は [スキル設定](skills.md) を参照。

```shell
wellgrow skills add kensaku63/wellgrow-packages                              # WellGrow 提供スキル（まとめて）
wellgrow skills add kensaku63/wellgrow-packages --skill bird --skill gogcli  # 特定のスキルのみ
wellgrow skills add remotion-dev/skills                                      # 他のリポジトリも可
```

```shell
wellgrow skills list           # インストール済みスキルの一覧
wellgrow skills remove <name>  # スキルの削除
```

---

## WellGrow MCP

ユーザーの質問・回答データ（パーソナルナレッジベース）にアクセスする MCP サーバー。セマンティック検索・一覧取得・回答の書き込みができる。ユーザーの考えや価値観を参照し、その人らしい支援を提供するための基盤。

- **インストール**: 不要（`npx` で自動実行）
- **ユーザー操作**: 環境変数 `WELLGROW_EMAIL`, `WELLGROW_PASSWORD`, `OPENAI_API_KEY` の設定。`~/.wellgrow/.mcp.json` への追記（[MCP 設定参考](mcp.md)）
- **スキル**: `wellgrow-mcp`, `wellgrow-setup`（`wellgrow skills add kensaku63/wellgrow-packages`）
- **URL**: https://www.npmjs.com/package/@wellgrow/mcp

`.mcp.json` に追加する設定:

```json
{
  "mcpServers": {
    "wellgrow": {
      "command": "npx",
      "args": ["-y", "@wellgrow/mcp"]
    }
  }
}
```

---

## bird — X/Twitter CLI

ターミナルから X (Twitter) のタイムライン閲覧・検索・投稿・エンゲージメントを行う CLI。Cookie 認証で GraphQL API を直接操作する。AI エージェントがユーザーの代わりに情報収集・投稿できるようになる。

- **インストール**: `npm install -g @steipete/bird`
- **ユーザー操作**: X の Cookie 認証情報の設定（環境変数 `AUTH_TOKEN`, `CT0` を `~/.bashrc` 等に設定、またはブラウザ Cookie を利用）。`bird check` で認証状態を確認
- **スキル**: `bird`（`wellgrow skills add kensaku63/wellgrow-packages --skill bird`）
- **URL**: https://www.npmjs.com/package/@steipete/bird

---

## gogcli — Google Suite CLI

ターミナルから Gmail・Google Calendar・Tasks・Drive を操作する CLI。スケジュール確認・予定作成・メール検索・タスク管理を AI に任せられるようになる。

- **インストール**: `brew install steipete/tap/gogcli`（ソースビルド: `git clone https://github.com/steipete/gogcli.git && cd gogcli && make`）
- **ユーザー操作**: ① Google Cloud Console で OAuth2 クレデンシャルを作成し JSON をダウンロード（有効化する API: Gmail, Calendar, Tasks, Drive）。② `gog auth credentials ~/Downloads/client_secret_*.json` → `gog auth add you@gmail.com` で認証
- **スキル**: `gogcli`（`wellgrow skills add kensaku63/wellgrow-packages --skill gogcli`）
- **URL**: https://github.com/steipete/gogcli

---

## Obsidian CLI — ナレッジベース操作

Obsidian 1.12+ 標準搭載の公式 CLI。ノートの読み書き・全文検索・デイリーノート・バックリンク解析などを高速に操作できる。Obsidian のインデックスを利用するため grep/find より桁違いに速い。

- **インストール**: Obsidian 1.12+ に標準搭載（Catalyst License / $25 one-time が必要）
- **ユーザー操作**: ① Obsidian の設定 → コマンドラインインターフェース で CLI を有効化し `obs` コマンドにパスを通す。② 利用中は Obsidian デスクトップを起動しておく
- **スキル**: `obsidian-cli`（`wellgrow skills add kensaku63/wellgrow-packages --skill obsidian-cli`）
- **URL**: https://help.obsidian.md/cli

---

## Notion MCP — Notion ワークスペース操作

Notion 公式のリモート MCP サーバー。ページの検索・作成・編集、DB クエリ、コメント管理など 22 ツールを提供。OAuth 認証で API トークン管理が不要。

- **インストール**: 不要（リモート MCP サーバー）
- **ユーザー操作**: `~/.wellgrow/mcp/notion.json` への追記（[MCP 設定参考](mcp.md)）。初回接続時に CLI がブラウザを起動して OAuth 認証（トークンは `~/.wellgrow/oauth/notion/` に自動保存）
- **スキル**: `notion-mcp`（`wellgrow skills add kensaku63/wellgrow-packages --skill notion-mcp`）
- **URL**: https://developers.notion.com/guides/mcp/mcp

`.mcp.json` に追加する設定:

```json
{
  "mcpServers": {
    "notion": {
      "type": "http",
      "url": "https://mcp.notion.com/mcp"
    }
  }
}
```

---

## clasp — Google Apps Script CLI

Google Apps Script プロジェクトの作成・編集・デプロイを行う公式 CLI。TypeScript 対応で、ローカル開発 → push → deploy のワークフローが可能。AI エージェントが GAS プロジェクトの雛形作成からデプロイまでを自動化できる。

- **インストール**: `npm install -g @google/clasp`
- **ユーザー操作**: ① `clasp login` で Google アカウント認証。② Apps Script API を有効化（https://script.google.com/home/usersettings）
- **スキル**: `appscript`（`wellgrow skills add kensaku63/wellgrow-packages --skill appscript`）
- **URL**: https://www.npmjs.com/package/@google/clasp

---

## Remotion — React で動画制作

React コンポーネントでプログラマブルに動画を作成するフレームワーク。公式の Agent Skills が提供されており、Remotion プロジェクトのベストプラクティスをエージェントに組み込める。

- **インストール**: プロジェクトごとに `npm install remotion`
- **ユーザー操作**: なし
- **スキル**: `wellgrow skills add remotion-dev/skills`
- **URL**: https://www.remotion.dev/docs/ai/skills

---

## blogwatcher — ブログ・RSS 監視 CLI

ブログの新着記事を監視し、既読・未読を管理する CLI。RSS/Atom フィードだけでなく CSS セレクタによる HTML スクレイピングにも対応。AI エージェントが新着記事の取得・要約を代行できる。

- **インストール**: `brew install Hyaxia/tap/blogwatcher`（Go: `go install github.com/Hyaxia/blogwatcher/cmd/blogwatcher@latest`）
- **ユーザー操作**: なし
- **スキル**: `blogwatcher`（`wellgrow skills add kensaku63/wellgrow-packages --skill blogwatcher`）
- **URL**: https://github.com/Hyaxia/blogwatcher
