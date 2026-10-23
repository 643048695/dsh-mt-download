# dsh-mt-download

[English](README.en.md) | 中文

**给 DeepSeek Harness 的多通道文件下载器：优先用 aria2c 开 16 个连接分块并发，拿不到就自动退回 Node.js 原生单流。**

A [DeepSeek Harness](https://www.deepseek.com/harness/) plugin.

---

## 为什么有这个

Agent 需要下载素材、模型、视频、GitHub 安装包时，用单连接流式下载有三个老问题：

1. **慢**：单连接吃不满带宽，几百兆的文件要等很久，还容易在超时边缘反复中断。
2. **拦**：抖音、B站、小红书这类资源带防盗链，不补 `Referer` 直接 403。
3. **挂**：Node.js 走系统证书库，Windows 上系统证书链损坏时，HTTPS 下载会报证书错误。

这个插件把这三件事一次性包进一个工具里，Agent 只需要给 URL 和目标路径。

## 它做什么

- **主通道**：调本机 aria2c 的 JSON-RPC（默认 `127.0.0.1:16801`），16 连接分块并发下载。服务没起来时按需拉起，平时零占用。
- **备用通道**：aria2c 不可用、或下载中途报错时，自动改用 Node.js 原生 `fetch` 流式单连接落盘，保证文件最终能下完。
- **防盗链自适应**：按域名自动注入 `Referer`（抖音 / B站 / 小红书 / 微博 / GitHub），并统一带现代浏览器 `User-Agent`。调用方也可以传自己的 `headers` 覆盖。
- **路径解析**：目标路径可以是具体文件名，也可以是目录或带结尾斜杠的路径；给目录时从 URL 末段推断文件名。
- **结果回报**：返回绝对路径、字节数、耗时、平均速度和实际走通的通道。

## 安装

Web UI 的插件页填 `github:643048695/dsh-mt-download`，或命令行：

```bash
dsh plugin --profile <profile> add github:643048695/dsh-mt-download
```

## 配置

写在 profile 的 `cordis.patch.yml` 里本插件那一行的 `config` 下：

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `defaultConnections` | `16` | 默认并发连接数（工具入参可逐个覆盖，上限 32） |
| `timeoutSeconds` | `600` | 默认超时秒数 |
| `aria2Port` | `16801` | aria2c JSON-RPC 端口 |
| `aria2Path` | `""` | aria2c 可执行文件绝对路径；留空则自动探测 |

## 关于 aria2c 从哪来

插件**不打包** aria2c 二进制，只负责找到并驱动本机已有的那份。查找顺序：

1. 配置项 `aria2Path`
2. 环境变量 `MT_ARIA2C_PATH` / `ARIA2C_PATH` / `DOUYIN_ARIA2C_PATH`
3. 系统 `PATH` 上的 `aria2c`
4. 常见安装位置（Windows 的 `Program Files\aria2`、Motrix 内置目录；macOS/Linux 的 `/usr/bin`、`/usr/local/bin`、`/opt/homebrew/bin` 等）

一个都找不到时不会失败——直接走备用通道。

## 工具签名

### `download_file`

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `url` | string | 是 | 下载地址 |
| `output_path` | string | 是 | 保存路径（文件名或目录） |
| `connections` | integer | 否 | 并发连接数，默认 16，范围 1–32 |
| `timeout_seconds` | integer | 否 | 超时秒数，默认 600 |
| `headers` | object | 否 | 自定义请求头，覆盖自动注入的同名项 |

返回：

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

失败时返回 `{ "success": false, "error": "..." }`，并带上两个通道各自的失败原因。

## 说明与限制

- aria2c 拉起来后是 detached 后台进程，插件退出不会主动关掉它；下次下载直接复用。
- 分块并发要服务端支持 `Range`。不支持时 aria2c 会自然退化成单连接，不会下坏文件。
- 自动注入的 `Referer` 只覆盖几个已知站点，其他站点请自己传 `headers`。
- 只做 HTTP/HTTPS 直链下载，不处理网页解析、m3u8 切片或登录态。

## 兼容性

Node.js >= 20。宿主侧只用到 `tools` 服务的 `register`，没有硬依赖，任何带工具注册表的 DSH profile 都能挂上。

## 开发

```bash
npm install
npm test
```

测试只覆盖纯函数（大小/速度格式化、文件名推断、防盗链头匹配），不联网、不启动 aria2c。

## License

MIT，Copyright (c) 2026 643048695。
