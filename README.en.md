# dsh-mt-download

English | [中文](README.md)

**A multi-channel file downloader for DeepSeek Harness: 16-connection chunked downloads through aria2c, with an automatic fallback to a plain Node.js stream.**

A [DeepSeek Harness](https://www.deepseek.com/harness/) plugin.

---

## Why this exists

When an agent downloads assets, models, videos or GitHub release archives, a single streaming connection has three recurring problems:

1. **Slow** — one connection leaves bandwidth unused, so large files take far longer and hover near the timeout.
2. **Blocked** — resources on Douyin, Bilibili and Xiaohongshu are hotlink-protected and return 403 without a matching `Referer`.
3. **Broken TLS** — Node.js uses the system trust store, so a damaged certificate chain on Windows makes HTTPS downloads fail outright.

This plugin folds all three into one tool. The agent supplies a URL and a destination path.

## What it does

- **Primary channel** — drives a local aria2c JSON-RPC endpoint (default `127.0.0.1:16801`) with 16 parallel connections. The daemon is started on demand and costs nothing while idle.
- **Fallback channel** — if aria2c is missing or a download errors out, the file is streamed once through Node.js `fetch` so it still lands on disk.
- **Hotlink handling** — a `Referer` is injected per known host (Douyin, Bilibili, Xiaohongshu, Weibo, GitHub) together with a modern browser `User-Agent`. Callers can pass their own `headers` to override.
- **Path resolution** — the destination may be a file path, a directory, or a path with a trailing separator; for a directory the filename is taken from the URL.
- **Reporting** — returns the absolute path, byte count, elapsed seconds, average speed, and which channel actually delivered the file.

## Install

Use `github:643048695/dsh-mt-download` in the Web UI plugin page, or:

```bash
dsh plugin --profile <profile> add github:643048695/dsh-mt-download
```

## Configure

Set these under the plugin's `config` in the profile `cordis.patch.yml`:

| Field | Default | Meaning |
| --- | --- | --- |
| `defaultConnections` | `16` | Default parallel connections (per-call argument wins, max 32) |
| `timeoutSeconds` | `600` | Default timeout in seconds |
| `aria2Port` | `16801` | aria2c JSON-RPC port |
| `aria2Path` | `""` | Absolute path to aria2c; empty means auto-detect |

## Where aria2c comes from

The plugin does **not** bundle the aria2c binary — it locates and drives the copy already on your machine. Lookup order:

1. The `aria2Path` config value
2. Environment variables `MT_ARIA2C_PATH` / `ARIA2C_PATH` / `DOUYIN_ARIA2C_PATH`
3. `aria2c` on the system `PATH`
4. Common install locations (on Windows `Program Files\aria2` and Motrix's bundled directory; on macOS/Linux `/usr/bin`, `/usr/local/bin`, `/opt/homebrew/bin`, and similar)

If none is found the plugin still works — it goes straight to the fallback channel.

## Tool signature

### `download_file`

| Parameter | Type | Required | Meaning |
| --- | --- | --- | --- |
| `url` | string | yes | The file to download |
| `output_path` | string | yes | Destination file path or directory |
| `connections` | integer | no | Parallel connections, default 16, range 1–32 |
| `timeout_seconds` | integer | no | Timeout in seconds, default 600 |
| `headers` | object | no | Extra request headers, overriding auto-injected ones |

Result:

```json
{
  "success": true,
  "file_path": "C:\\path\\to\\file.bin",
  "file_size_bytes": 25098,
  "file_size_human": "24.51 KB",
  "duration_seconds": 1,
  "speed_human": "24.51 KB/s",
  "method": "aria2c (16 并发通道)"
}
```

On failure it returns `{ "success": false, "error": "..." }` with the reason from both channels.

## Notes and limits

- The aria2c daemon is spawned detached and is not shut down when the plugin unloads; the next download reuses it.
- Chunked downloads need server-side `Range` support. Without it aria2c degrades to a single connection rather than corrupting the file.
- Auto-injected `Referer` covers only a handful of hosts; pass `headers` for anything else.
- Direct HTTP/HTTPS links only — no page scraping, no m3u8 segmentation, no authenticated sessions.

## Compatibility

Node.js >= 20. On the host side only `tools.register` is used, with no hard service dependency, so any DSH profile with a tool registry can mount it.

## Development

```bash
npm install
npm test
```

Tests cover the pure helpers (size and speed formatting, filename inference, hotlink header matching) and touch neither the network nor aria2c.

## License

MIT, Copyright (c) 2026 643048695.
