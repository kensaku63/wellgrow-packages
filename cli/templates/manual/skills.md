# スキル

## インストール

`wellgrow skills add` でリポジトリからスキルを `~/.wellgrow/skills/` にインストールできる。

```shell
wellgrow skills add kensaku63/wellgrow-packages           # WellGrow 提供スキル
wellgrow skills add kensaku63/wellgrow-packages --skill bird  # 特定のスキルのみ
wellgrow skills add remotion-dev/skills                    # 他のリポジトリも可
wellgrow skills add ./local/path                           # ローカルパスも可
```

```shell
wellgrow skills list           # インストール済みスキルの一覧
wellgrow skills remove <name>  # スキルの削除
```

## パス設定

インストールしただけではエージェントから利用できない。`agent.toml` か `config.toml` の `[skills].paths` にパスを追加する。

```toml
# agent.toml — そのエージェントのみ
[skills]
paths = ["~/.wellgrow/skills"]

# config.toml — 全エージェント共通
[skills]
paths = ["~/.wellgrow/skills"]
```

ディレクトリ指定（配下を全スキャン）と個別指定（`SKILL.md` を含むディレクトリを直接指定）の両方が使える。予期せぬスキルの混入を防ぐため、個別指定を推奨。

```toml
# 個別指定の例
[skills]
paths = [
  "~/.wellgrow/skills/bird",
  "~/.wellgrow/skills/gogcli",
]
```

## 自作スキル

`~/.wellgrow/skills/{name}/SKILL.md` を作成する。フロントマターに `name` と `description` が必須。`description` はスキルを使うかどうかの判断材料になるため、どんな場面で使うかを具体的に書く。

```markdown
---
name: my-skill
description: >
  どんな場面でこのスキルを使うかを具体的に書く。
---

スキルの指示をここに記述する。
```
