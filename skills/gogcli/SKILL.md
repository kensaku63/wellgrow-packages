---
name: gogcli
description: >
  gogcli (gog) を使って Gmail, Google Calendar, Google Tasks, Google Drive を操作する。
  メール検索・送信、カレンダーの予定管理、タスク管理、ファイル操作ができる。
  "メールを検索", "メールを送って", "カレンダーを見て", "予定を入れて", "スケジュール確認",
  "タスクを見て", "タスクを追加", "タスク完了", "ドライブを検索", "ファイルをアップロード",
  "gmailを確認", "未読メールある?", "今日の予定は?", "明日のスケジュール",
  "gog gmail", "gog calendar", "gog tasks", "gog drive" などで使用する。
---

# gogcli — Google Suite CLI

`gog` CLI で Gmail・Calendar・Tasks・Drive を操作する。JSON 出力・複数アカウント・最小権限認証に対応。

- リポジトリ: https://github.com/steipete/gogcli

## Known IDs

スキル利用前に、以下のコマンドで自分の ID を確認し、このセクションに記入する。

### Calendar IDs

```bash
gog calendar calendars
```

| ID | Title |
|----|-------|
| (ここに記入) | (ここに記入) |

### Task List IDs

```bash
gog tasks lists
```

| ID | Title |
|----|-------|
| (ここに記入) | (ここに記入) |

## インストール

```bash
# Homebrew
brew install steipete/tap/gogcli

# ソースビルド
git clone https://github.com/steipete/gogcli.git && cd gogcli && make
```

## 初期セットアップ

### 1. OAuth2 クレデンシャル取得

Google Cloud Console でデスクトップアプリ用 OAuth クライアントを作成し JSON をダウンロード。
有効にする API: Gmail API, Calendar API, Tasks API, Drive API

### 2. クレデンシャル登録 → アカウント認可

```bash
gog auth credentials ~/Downloads/client_secret_*.json
gog auth add you@gmail.com
```

### 3. 動作確認

```bash
gog gmail labels list
```

## 出力モード

| フラグ | 用途 |
|--------|------|
| (なし) | 人間向けテーブル（色付き） |
| `--json` | JSON（スクリプト・エージェント向け。データは stdout、エラーは stderr） |
| `--plain` | TSV（パイプ向け） |

エージェントは基本 `--json` を使う。

## 環境変数

| 変数 | 用途 |
|------|------|
| `GOG_ACCOUNT` | デフォルトアカウント |
| `GOG_JSON` | デフォルトで JSON 出力 |
| `GOG_TIMEZONE` | 出力タイムゾーン（IANA / UTC / local） |

---

## Gmail

### メール検索

```bash
# スレッド検索（デフォルト）
gog gmail search 'newer_than:7d' --max 10
gog gmail search 'from:alice@example.com subject:meeting' --max 20
gog gmail search 'is:unread newer_than:1d' --max 50
gog gmail search 'has:attachment filename:pdf' --max 10
gog gmail search 'newer_than:7d' --max 10 --json

# メッセージ単位で検索（本文取得オプションあり）
gog gmail messages search 'newer_than:7d' --max 10
gog gmail messages search 'newer_than:7d' --max 5 --include-body --json
```

Gmail 検索構文（`search` のクエリ）:

| 演算子 | 例 |
|--------|-----|
| `from:` | `from:alice@example.com` |
| `to:` | `to:bob@example.com` |
| `subject:` | `subject:invoice` |
| `is:` | `is:unread`, `is:starred`, `is:important` |
| `has:` | `has:attachment` |
| `filename:` | `filename:pdf` |
| `newer_than:` | `newer_than:1d`, `newer_than:7d`, `newer_than:1m` |
| `older_than:` | `older_than:1y` |
| `label:` | `label:work` |
| `in:` | `in:inbox`, `in:sent`, `in:trash` |
| 論理演算 | `OR`, `AND`, `-`（除外）, `()` |

### スレッド・メッセージ取得

```bash
gog gmail thread get <threadId>
gog gmail thread get <threadId> --json
gog gmail thread get <threadId> --download                    # 添付ファイルダウンロード
gog gmail thread get <threadId> --download --out-dir ./files  # 出力先指定
gog gmail get <messageId>
gog gmail url <threadId>                                      # Gmail Web URL
```

### メール送信

```bash
# 基本
gog gmail send --to a@b.com --subject "件名" --body "本文"

# ファイルから本文を読み込み
gog gmail send --to a@b.com --subject "件名" --body-file ./message.txt

# stdin から本文
gog gmail send --to a@b.com --subject "件名" --body-file -

# HTML メール
gog gmail send --to a@b.com --subject "件名" --body "Plain fallback" --body-html "<p>Hello</p>"

# 返信（引用付き）
gog gmail send --reply-to-message-id <messageId> --quote \
  --to a@b.com --subject "Re: 件名" --body "返信内容"
```

### 下書き

```bash
gog gmail drafts list
gog gmail drafts create --to a@b.com --subject "件名" --body "本文"
gog gmail drafts update <draftId> --subject "更新" --body "更新本文"
gog gmail drafts send <draftId>
```

### ラベル管理

```bash
gog gmail labels list
gog gmail labels get INBOX --json                              # メッセージ数含む
gog gmail labels create "My Label"
gog gmail labels delete <labelIdOrName>                        # ユーザーラベルのみ
gog gmail thread modify <threadId> --add STARRED --remove INBOX  # アーカイブ+スター
```

### バッチ操作

```bash
gog gmail batch delete <messageId1> <messageId2>
gog gmail batch modify <messageId1> <messageId2> --add STARRED --remove INBOX

# パイプで大量処理
gog --json gmail search 'from:noreply@example.com' --max 200 | \
  jq -r '.threads[].id' | xargs -n 50 gog gmail labels modify --remove UNREAD

gog --json gmail search 'older_than:1y' --max 200 | \
  jq -r '.threads[].id' | xargs -n 50 gog gmail labels modify --remove INBOX
```

### フィルタ

```bash
gog gmail filters list
gog gmail filters create --from 'noreply@example.com' --add-label 'Notifications'
gog gmail filters delete <filterId>
```

### 不在設定

```bash
gog gmail vacation get
gog gmail vacation enable --subject "不在です" --message "◯日まで不在にしています"
gog gmail vacation disable
```

---

## Calendar

### カレンダー一覧・情報

```bash
gog calendar calendars
gog calendar colors          # 利用可能な色
```

### イベント取得

```bash
gog calendar events <calendarId> --today
gog calendar events <calendarId> --tomorrow
gog calendar events <calendarId> --week
gog calendar events <calendarId> --days 3
gog calendar events <calendarId> --from today --to friday
gog calendar events <calendarId> --from today --to friday --weekday   # 曜日列付き
gog calendar events --all                                             # 全カレンダー
gog calendar events --cal Work --cal Personal                         # 名前指定
```

### イベント検索

```bash
gog calendar search "meeting" --today
gog calendar search "meeting" --days 365
gog calendar search "meeting" --from 2026-01-01 --to 2026-01-31 --max 50
```

### イベント詳細（JSON）

```bash
gog calendar get <calendarId> <eventId> --json
# → startDayOfWeek, endDayOfWeek, startLocal, endLocal などの便利フィールド含む
```

### イベント作成

```bash
gog calendar create <calendarId> \
  --summary "Meeting" \
  --from 2026-02-24T10:00:00+09:00 \
  --to 2026-02-24T11:00:00+09:00

# 詳細オプション
gog calendar create <calendarId> \
  --summary "Team Sync" \
  --description "議題: プロジェクト進捗" \
  --from 2026-02-24T14:00:00+09:00 \
  --to 2026-02-24T15:00:00+09:00 \
  --attendees "alice@example.com,bob@example.com" \
  --location "Zoom" \
  --send-updates all
```

主要オプション:

| オプション | 用途 |
|-----------|------|
| `--description` | 説明文 |
| `--location` | 場所 |
| `--attendees` | 参加者（カンマ区切り） |
| `--visibility` | 公開範囲（default/public/private） |
| `--with-meet` | Google Meet リンク自動作成 |
| `--send-updates` | 通知（all/externalOnly/none） |
| `--event-color` | 色（1-11） |

### イベント更新・削除

```bash
gog calendar update <calendarId> <eventId> \
  --summary "Updated" --from 2026-02-24T11:00:00+09:00 --to 2026-02-24T12:00:00+09:00

gog calendar update <calendarId> <eventId> \
  --add-attendee "alice@example.com"   # 既存参加者を保持

gog calendar delete <calendarId> <eventId>
gog calendar delete <calendarId> <eventId> --send-updates all --force
```

### 繰り返し・リマインダー

```bash
gog calendar create <calendarId> \
  --summary "月次レビュー" \
  --from 2026-03-01T09:00:00+09:00 --to 2026-03-01T09:30:00+09:00 \
  --rrule "RRULE:FREQ=MONTHLY;BYMONTHDAY=1" \
  --reminder "popup:30m"
```

### 特殊イベントタイプ

```bash
gog calendar create primary --event-type focus-time \
  --from 2026-02-24T13:00:00+09:00 --to 2026-02-24T14:00:00+09:00

gog calendar create primary --event-type out-of-office \
  --from 2026-03-01 --to 2026-03-02 --all-day
```

### 招待への返答

```bash
gog calendar respond <calendarId> <eventId> --status accepted
gog calendar respond <calendarId> <eventId> --status declined
gog calendar respond <calendarId> <eventId> --status tentative
```

### 空き時間確認

```bash
gog calendar freebusy --calendars "primary" \
  --from 2026-02-24T00:00:00+09:00 --to 2026-02-25T00:00:00+09:00

gog calendar conflicts --calendars "primary" --today
```

---

## Tasks

### タスクリスト

```bash
gog tasks lists --max 50
gog tasks lists create "プロジェクトA"
```

### タスク CRUD

```bash
gog tasks list <tasklistId> --max 50
gog tasks get <tasklistId> <taskId>
gog tasks add <tasklistId> --title "タスク名"
gog tasks add <tasklistId> --title "タスク名" --due 2026-02-28
gog tasks update <tasklistId> <taskId> --title "新しいタイトル"
gog tasks done <tasklistId> <taskId>
gog tasks undo <tasklistId> <taskId>
gog tasks delete <tasklistId> <taskId>
gog tasks clear <tasklistId>              # 完了済みタスクを一括削除
```

### 繰り返しタスク

```bash
gog tasks add <tasklistId> --title "週次レビュー" --due 2026-03-01 --repeat weekly --repeat-count 4
gog tasks add <tasklistId> --title "日次スタンドアップ" --due 2026-03-01 --repeat daily --repeat-until 2026-03-07
```

Google Tasks の due は日付のみ（時刻は無視される）。

---

## Drive

### ファイル一覧・検索

```bash
gog drive ls --max 20
gog drive ls --parent <folderId> --max 20
gog drive search "invoice" --max 20
gog drive search "invoice" --max 20 --json
gog drive search "mimeType = 'application/pdf'" --raw-query   # 生クエリ
gog drive get <fileId>                                         # メタデータ
gog drive url <fileId>                                         # Web URL
```

### アップロード・ダウンロード

```bash
gog drive upload ./path/to/file
gog drive upload ./path/to/file --parent <folderId>
gog drive upload ./path/to/file --replace <fileId>   # 共有リンク保持で上書き
gog drive upload ./report.docx --convert             # Google ドキュメントに変換
gog drive download <fileId> --out ./downloaded.bin
gog drive download <fileId> --format pdf --out ./exported.pdf   # Google Workspace ファイルのエクスポート
gog drive download <fileId> --format docx --out ./doc.docx
```

### フォルダ・ファイル整理

```bash
gog drive mkdir "新フォルダ"
gog drive mkdir "新フォルダ" --parent <parentFolderId>
gog drive rename <fileId> "新しい名前"
gog drive move <fileId> --parent <destinationFolderId>
gog drive copy <fileId> "コピー名"
gog drive delete <fileId>             # ゴミ箱へ
gog drive delete <fileId> --permanent # 完全削除
```

### 共有・権限

```bash
gog drive permissions <fileId>
gog drive share <fileId> --to user --email user@example.com --role reader
gog drive share <fileId> --to user --email user@example.com --role writer
gog drive share <fileId> --to domain --domain example.com --role reader
gog drive unshare <fileId> --permission-id <permissionId>
```

### 共有ドライブ

```bash
gog drive drives --max 100
```

---

## 効果的なワークフロー

### 朝のルーティン

```bash
# 今日の予定を確認
gog calendar events <calendarId> --today

# 未読メールを確認
gog gmail search 'is:unread newer_than:1d' --max 20

# タスク一覧を確認
gog tasks list <tasklistId> --max 50
```

### メールの整理

```bash
# 特定の送信者のメールをまとめてラベル付け
gog --json gmail search 'from:boss@example.com newer_than:30d' --max 100 | \
  jq -r '.threads[].id' | xargs -n 50 gog gmail labels modify --add IMPORTANT

# 古いメールをアーカイブ
gog --json gmail search 'older_than:1y' --max 200 | \
  jq -r '.threads[].id' | xargs -n 50 gog gmail labels modify --remove INBOX
```

### 予定調整

```bash
# 空き時間を確認してから予定を作成
gog calendar freebusy --calendars "primary" \
  --from 2026-02-24T09:00:00+09:00 --to 2026-02-24T18:00:00+09:00

gog calendar create <calendarId> \
  --summary "1on1" \
  --from 2026-02-24T15:00:00+09:00 --to 2026-02-24T15:30:00+09:00
```

### Drive からファイルを検索してダウンロード

```bash
gog --json drive search "invoice filetype:pdf" --max 20 | \
  jq -r '.files[] | .id' | \
  while read fileId; do gog drive download "$fileId"; done
```

### 複数アカウント

```bash
gog gmail search 'is:unread' --account personal@gmail.com
gog gmail search 'is:unread' --account work@company.com
```

---

## 注意事項

- タイムゾーンは日本時間 (JST / +09:00) を基本とする
- イベント作成時、ユーザーが時刻を指定しなかった場合は確認する
- 削除操作は実行前にユーザーに確認する
- メール送信は送信先・件名・本文を確認してから実行する

## トラブルシューティング

| 問題 | 対処 |
|------|------|
| `gog: command not found` | `brew install steipete/tap/gogcli` を実行。または PATH を確認 |
| `insufficient scopes` (403) | `gog auth add <email> --services user --force-consent` で再認証 |
| トークン失効 | `gog auth list --check` で確認し、`gog auth add <email>` で再認証 |
| Drive 書き込み失敗 | `--drive-scope full` で認証しているか確認 |
| JSON パースエラー | データは stdout、エラーは stderr に分離。`2>/dev/null` でエラー出力を除外 |
