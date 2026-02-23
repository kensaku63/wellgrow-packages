---
name: bird
description: X/Twitter CLIツール。投稿の閲覧・検索・投稿・エンゲージメントが可能。トピックやユーザーの調査・リサーチにも活用できる。
homepage: https://bird.fast

---

# bird 🐦

Fast X/Twitter CLI using GraphQL + cookie auth.

## Authentication

`bird` uses cookie-based auth. 認証方法は以下の優先順位:

1. **環境変数** (推奨): `AUTH_TOKEN` と `CT0` を設定済み (`~/.bashrc`)
2. **CLI引数**: `--auth-token` / `--ct0` で直接指定
3. **ブラウザクッキー**: `--cookie-source=chrome|firefox|safari`

Run `bird check` to see which source is active.

## when
- ユーザーの思考を追いかける時。
   →ユーザーの投稿を調べる。
- ユーザーが何に興味を持っているかを調べる時。
   →ユーザーがブックマーク、いいねを押した投稿を調べる。
- 何が話題になっているかを調べる時。
   →たくさんのクエリでx上でどのようなことが話題になっているかを調べる。
- 最先端の情報を調べたい時。   
   →調べたいテーマの第一人者や専門家を見つけて、その人の投稿を調べ上げて、最新の情報のトレンドを把握する。

## Commands

### Account & Auth

```bash
bird whoami                    # Show logged-in account
bird check                     # Show credential sources
bird query-ids --fresh         # Refresh GraphQL query ID cache
```

### Reading Tweets

```bash
bird read <url-or-id>          # Read a single tweet
bird <url-or-id>               # Shorthand for read
bird thread <url-or-id>        # Full conversation thread
bird replies <url-or-id>       # List replies to a tweet
```

### Timelines

```bash
bird home                      # Home timeline (For You)
bird home --following          # Following timeline
bird user-tweets @handle -n 20 # User's profile timeline
bird mentions                  # Tweets mentioning you
bird mentions --user @handle   # Mentions of another user
```

### Search

```bash
bird search "query" -n 10
bird search "from:steipete" --all --max-pages 3
```

### News & Trending

```bash
bird news -n 10                # AI-curated from Explore tabs
bird news --ai-only            # Filter to AI-curated only
bird news --sports             # Sports tab
bird news --with-tweets        # Include related tweets
bird trending                  # Alias for news
```

### Lists

```bash
bird lists                     # Your lists
bird lists --member-of         # Lists you're a member of
bird list-timeline <id> -n 20  # Tweets from a list
```

### Bookmarks & Likes

```bash
bird bookmarks -n 10
bird bookmarks --folder-id <id>           # Specific folder
bird bookmarks --include-parent           # Include parent tweet
bird bookmarks --author-chain             # Author's self-reply chain
bird bookmarks --full-chain-only          # Full reply chain
bird unbookmark <url-or-id>
bird likes -n 10
```

### Social Graph

```bash
bird following -n 20           # Users you follow
bird followers -n 20           # Users following you
bird following --user <id>     # Another user's following
bird about @handle             # Account origin/location info
```

### Engagement Actions

```bash
bird follow @handle            # Follow a user
bird unfollow @handle          # Unfollow a user
```

### Posting

```bash
bird tweet "hello world"
bird reply <url-or-id> "nice thread!"
bird tweet "check this out" --media image.png --alt "description"
```

**⚠️ Posting risks**: Posting is more likely to be rate limited; if blocked, use the browser tool instead.

## Media Uploads

```bash
bird tweet "hi" --media img.png --alt "description"
bird tweet "pics" --media a.jpg --media b.jpg  # Up to 4 images
bird tweet "video" --media clip.mp4            # Or 1 video
```

## Pagination

Commands supporting pagination: `replies`, `thread`, `search`, `bookmarks`, `likes`, `list-timeline`, `following`, `followers`, `user-tweets`

```bash
bird bookmarks --all                    # Fetch all pages
bird bookmarks --max-pages 3            # Limit pages
bird bookmarks --cursor <cursor>        # Resume from cursor
bird replies <id> --all --delay 1000    # Delay between pages (ms)
```

## Output Options

```bash
--json          # JSON output
--json-full     # JSON with raw API response
--plain         # No emoji, no color (script-friendly)
--no-emoji      # Disable emoji
--no-color      # Disable ANSI colors (or set NO_COLOR=1)
--quote-depth n # Max quoted tweet depth in JSON (default: 1)
```

## Global Options

```bash
--auth-token <token>       # Set auth_token cookie
--ct0 <token>              # Set ct0 cookie
--cookie-source <source>   # Cookie source for browser cookies (repeatable)
--chrome-profile <name>    # Chrome profile name
--chrome-profile-dir <path> # Chrome/Chromium profile dir or cookie DB path
--firefox-profile <name>   # Firefox profile
--timeout <ms>             # Request timeout
--cookie-timeout <ms>      # Cookie extraction timeout
```

## Config File

`~/.config/bird/config.json5` (global) or `./.birdrc.json5` (project):

```json5
{
  cookieSource: ["chrome"],
  chromeProfileDir: "/path/to/Arc/Profile",
  timeoutMs: 20000,
  quoteDepth: 1,
}
```

Environment variables: `BIRD_TIMEOUT_MS`, `BIRD_COOKIE_TIMEOUT_MS`, `BIRD_QUOTE_DEPTH`

## Troubleshooting

### Query IDs stale (404 errors)

```bash
bird query-ids --fresh
```

### Cookie extraction fails

- Check browser is logged into X
- Try different `--cookie-source`
- For Arc/Brave: use `--chrome-profile-dir`

---

**TL;DR**: Read/search/engage with CLI. Post carefully or use browser. 🐦