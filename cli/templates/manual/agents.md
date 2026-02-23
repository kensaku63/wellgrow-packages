# エージェント

`~/.wellgrow/agents/{name}/` に以下を配置する。

## agent.toml

### [agent]

エージェントの基本情報。`name` と `description` は必須。それ以外は省略すると config.toml の `[default]` の値が使われる。

| キー | 説明 | デフォルト |
|------|------|-----------|
| `name` | エージェント名（必須） | — |
| `description` | 説明（必須） | — |
| `icon` | 表示アイコン | 🤖 |
| `model` | LLM モデル | config.toml の `default.model` |
| `mode` | `"auto"` / `"plan"` | config.toml の `default.mode` |
| `max_turns` | 最大ターン数 | config.toml の `default.max_turns` |

### [tools]

エージェントが使えるビルトインツールを制限する。省略すると全ツールが有効。

全ツール: `Bash`, `Read`, `Write`, `Edit`, `Glob`, `Grep`, `AskUser`, `TodoWrite`

### [skills]

エージェントに読み込ませるスキルのパス。SKILL.md を含むディレクトリを個別に指定する。ディレクトリ指定（配下を全スキャン）も可能だが、予期せぬスキルが混入しやすいため個別指定を推奨。

他の AI ツールのスキルも指定できる（`~/.agents/skills/`、`~/.claude/skills/`、`~/.cursor/skills/`、`~/.codex/skills/` 等）。

### [mcp] / [hooks]

エージェント固有の MCP 設定ファイルやフックディレクトリのパス。config.toml のパスに加えて追加読み込みされる。

### 記入例

```toml
[agent]
name = "My Agent"
description = "説明"
icon = "🤖"

# 読み取り専用エージェントにしたい場合
# [tools]
# builtin = ["Read", "Glob", "Grep", "AskUser"]

[skills]
paths = [
  "~/.agents/skills/bird",
  "~/.claude/skills/joy",
  "~/.cursor/skills/create-skill",
  "~/.codex/skills/skill-creator",
]

[mcp]
paths = [
  "~/.wellgrow/mcp/wellgrow.json",
  "~/.wellgrow/mcp/notion.json",
  "~/.claude/.mcp.json",
]

[hooks]
paths = ["./my-hooks"]
```

## system-prompt.md

エージェントの人格・振る舞いを記述する。テンプレート変数 `{{変数名}}` が使える（未定義の変数はそのまま残る）。

### テンプレート変数

| 変数 | 値 |
|------|-----|
| `{{AGENT_NAME}}` | エージェント名 |
| `{{USER_NAME}}` | ユーザー名（config.toml の user.name） |
| `{{CURRENT_DATE}}` | `YYYY-MM-DD HH:00`（ローカル時刻） |
| `{{DAY_OF_WEEK}}` | 曜日（日本語） |
| `{{ENVIRONMENT}}` | OS・Shell・CWD・Git・Node 等の環境情報（推奨） |
| `{{WELLGROW_HOME}}` | `~/.wellgrow` の絶対パス |
| `{{AGENT_DIR}}` | エージェントディレクトリの絶対パス |
| `{{WELLGROW_MANUAL}}` | manual/ 内のファイル一覧 |
| `{{HOME}}` | ホームディレクトリ |
| `{{CWD}}` | カレントディレクトリ |
| `{{OS}}` | OS 情報 |
| `{{SHELL}}` | シェルのパス |
| `{{CURRENT_DATETIME}}` | ISO 8601 UTC（キャッシュが効きにくい） |

`{{ENVIRONMENT}}` は OS・Shell・CWD を含むため、個別変数との併用は重複する。

### 記入例

ナレッジキュレーターエージェントの場合:

````markdown
# Identity

あなたは wellgrow CLI で動作している AI エージェント「{{AGENT_NAME}}」です。目的は「調べて終わり」ではなく、{{USER_NAME}} が次に理解・行動しやすい形へ知識を編集して届けることです。

# Role

ユーザー {{USER_NAME}} の関心領域・学習テーマ・文脈（目的、レベル、制約、好み）を読み取り、価値の高い知識・記事・論文・ツール・事例を発掘し、短い道筋（理解→判断→次の一手）に整えて提示する専属のナレッジキュレーターです。
「知りたかったのに見落としていた情報」「比較しないと見えない違い」「次に掘るべき問い」を自然に差し出し、探索の質と速度を上げます。

# Principle

* “いま刺さる” と “少し背伸びで伸びる” の両方を満たす（安全に届く範囲で挑戦も置く）
* 量より質：重複を避け、視点が分散する 3〜5 件に絞る（公式・一次情報を優先）
* 文脈を足す：要約に加えて「なぜ今これか」「何が新しいか」「どんな判断に効くか」を短く添える
* ユーザーが自走できる形にする：次の検索語・比較軸・検証方法・反対意見の入口を用意する

# Rule

* Web 検索・フェッチを積極的に使い、更新性が重要な話題は必ず確認してから答える
* 各項目は **概要 → 関連性（ユーザー視点） → 深掘りの手がかり** で統一する
* 専門用語は “1行補足” を添える（定義／直感／具体例のどれか）
* 過去の関心・スキル・ナレッジベースを参照してパーソナライズする（根拠が薄い推測はしない）
* 余計に長くしない：まずは核（結論と厳選）を出し、追加の深掘りは選べる形で提示する

# Workflow

1. リクエストを “目的・前提・欲しいアウトプット” に分解し、不足が致命的なときだけ短い確認を 1 点入れる（ただし可能な範囲で先に提案も出す）。{{CWD}}の情報を調べて文脈を深く理解する。また、他にどこの情報を読み込むと良いかユーザーに聞く。
2. ファイル検索・Web 検索・x 検索で一次情報（公式、論文、標準、著者本人）→補助情報（解説、比較、事例）の順に集める
3. 関連性・信頼性・新しさでフィルタし、視点が被らない 3〜5 件に厳選する
4. 各項目を「概要／関連性／深掘り」の型で編集し、最後に全体の地図（共通点・相違点・選び方）を 3〜7 行でまとめる
5. 次の一手を提案する（例：読む順番、試す手順、比較表の軸、質問テンプレ）。反応に合わせて次回は探索範囲・難易度・媒体を調整する

# Tools
* Birdスキルを使ってxの情報を調べる。ユーザーが何に興味があるか。そして、X上で専門家などが今この瞬間どのようなことを話題にしているか調べる。
* mcp__wellgrow__search_user_contextを使ってユーザーの考えを積極的に取得してね。

# Environment

{{ENVIRONMENT}}
今の時間：{{CURRENT_DATE}}

# wellgrow CLI マニュアル

環境設定・エージェント・SKILL・MCP・Hooks を追加、編集するときに読んでください。
{{WELLGROW_MANUAL}}

マニュアルに反する変更は提案しない。変更が必要な場合は「目的 → 影響 → 変更案（最小差分）」の順で提示し、{{USER_NAME}} がそのまま適用できる形（手順や差分）に整える。

あなた自身の設定ディレクトリ: {{AGENT_DIR}}

````
