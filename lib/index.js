import fs from 'node:fs';
import path from 'node:path';
import { formatBytes, formatSpeed, guessFilenameFromUrl } from './utils.js';
import { findAria2Executable, ensureAria2Rpc, downloadWithAria2 } from './aria2.js';
import { downloadWithFallback } from './fallback.js';

export const name = 'dsh-mt-download';
export const inject = [];

/**
 * 默认配置
 */
const defaultConfig = {
  defaultConnections: 16,
  timeoutSeconds: 600,
  aria2Port: 16801,
  aria2Path: ''
};

export function apply(ctx, rawConfig) {
  const config = { ...defaultConfig, ...(rawConfig || {}) };
  const defaultConnections = config.defaultConnections || 16;
  const timeoutSeconds = config.timeoutSeconds || 600;
  const aria2Port = config.aria2Port || 16801;

  ctx.inject(['tools'], (scope) => {
    const tools = scope.tools;
    if (!tools || typeof tools.register !== 'function') return;

    tools.register({
      name: 'download_file',
      description: 'Download a file from a URL using multi-connection acceleration (16 parallel streams via aria2c) with automatic fallback to single-connection stream. Automatically bypasses anti-hotlinking (Referer/User-Agent) and Windows TLS certificate issues.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The HTTP/HTTPS download URL of the file.'
          },
          output_path: {
            type: 'string',
            description: 'Target save path. Can be an exact file path or a destination directory. If directory or omitted filename, filename is auto-detected.'
          },
          connections: {
            type: 'integer',
            description: `Number of parallel download connections/parts (default: ${defaultConnections}, range: 1-32).`
          },
          timeout_seconds: {
            type: 'integer',
            description: `Timeout limit in seconds (default: ${timeoutSeconds}).`
          },
          headers: {
            type: 'object',
            description: 'Optional custom HTTP request headers (key-value pairs, e.g. {"Referer": "..."}).'
          }
        },
        required: ['url', 'output_path'],
        additionalProperties: false
      },
      output: {
        schema: {
          type: 'object',
          properties: {
            success: { type: 'boolean', description: 'Whether the download succeeded.' },
            file_path: { type: 'string', description: 'Absolute path of the saved file.' },
            file_size_bytes: { type: 'number', description: 'Size of the downloaded file in bytes.' },
            file_size_human: { type: 'string', description: 'Human-readable file size.' },
            duration_seconds: { type: 'number', description: 'Download elapsed time in seconds.' },
            speed_human: { type: 'string', description: 'Average download speed.' },
            method: { type: 'string', description: 'Download channel used (e.g. aria2c-16x or fallback-stream).' },
            error: { type: 'string', description: 'Error message if download failed.' }
          },
          required: ['success'],
          additionalProperties: true
        },
        render(_args, value) {
          if (value?.success) {
            return [{
              type: 'text',
              text: `✅ [Download Success] Saved to: ${value.file_path}\n📦 Size: ${value.file_size_human} (${value.file_size_bytes} bytes)\n⚡ Speed: ${value.speed_human} (took ${value.duration_seconds}s)\n🚀 Channel: ${value.method}`
            }];
          }
          return [{
            type: 'text',
            text: `❌ [Download Failed] ${value?.error || 'Unknown error'}`
          }];
        }
      },
      async execute(args) {
        const url = args.url?.trim();
        if (!url) {
          return { success: false, error: 'URL is required.' };
        }

        let rawPath = args.output_path?.trim();
        if (!rawPath) {
          return { success: false, error: 'output_path is required.' };
        }

        // 解析保存路径：如果给的是已存在的目录，或以 / \ 结尾，则自动拼上文件名
        let resolvedPath = path.resolve(rawPath);
        if (
          rawPath.endsWith('/') ||
          rawPath.endsWith('\\') ||
          (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory())
        ) {
          const guessedName = guessFilenameFromUrl(url);
          resolvedPath = path.join(resolvedPath, guessedName);
        }

        const connections = args.connections || defaultConnections;
        const timeout = args.timeout_seconds || timeoutSeconds;
        const customHeaders = args.headers || {};

        let downloadResult = null;
        let usedChannel = '';
        let aria2Error = null;

        // 通道 1: 尝试使用 16 通道并发 (aria2c RPC 懒启动)
        try {
          const ariaExe = findAria2Executable(config.aria2Path);
          if (ariaExe) {
            const rpcReady = await ensureAria2Rpc(ariaExe, aria2Port);
            if (rpcReady) {
              const res = await downloadWithAria2(url, resolvedPath, {
                port: aria2Port,
                connections,
                timeout,
                headers: customHeaders
              });
              downloadResult = res;
              usedChannel = `aria2c (${connections} 并发通道)`;
            }
          }
        } catch (err) {
          aria2Error = err.message;
          ctx.logger?.warn?.(`[dsh-mt-download] aria2 download failed, switching to fallback channel: ${err.message}`);
        }

        // 通道 2: 备用通道流式下载（若通道 1 未成功）
        if (!downloadResult) {
          try {
            const res = await downloadWithFallback(url, resolvedPath, {
              timeout,
              headers: customHeaders
            });
            downloadResult = res;
            usedChannel = aria2Error
              ? `fallback-stream (单通道兜底，原因: ${aria2Error})`
              : 'fallback-stream (单通道兜底)';
          } catch (err) {
            return {
              success: false,
              file_path: resolvedPath,
              error: `All download channels failed. aria2: ${aria2Error || 'not ready'}, fallback: ${err.message}`
            };
          }
        }

        // 成功结算
        const bytes = downloadResult.size;
        const seconds = downloadResult.seconds || 0.1;
        const bytesPerSec = Math.round(bytes / seconds);

        return {
          success: true,
          file_path: downloadResult.filePath,
          file_size_bytes: bytes,
          file_size_human: formatBytes(bytes),
          duration_seconds: seconds,
          speed_human: formatSpeed(bytesPerSec),
          method: usedChannel
        };
      }
    });

    ctx.logger?.info?.('[dsh-mt-download] download_file tool registered successfully.');
  });
}
