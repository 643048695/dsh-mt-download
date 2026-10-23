import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { detectPlatformHeaders } from './utils.js';

/**
 * 备用通道：Node.js 原生流式单通道下载（保障 100% 可用性）
 * @param {string} url
 * @param {string} destPath
 * @param {object} opts
 * @param {number} [opts.timeout=600]
 * @param {Record<string, string>} [opts.headers]
 * @returns {Promise<{ filePath: string, size: number, seconds: number }>}
 */
export async function downloadWithFallback(url, destPath, opts = {}) {
  const timeout = opts.timeout ?? 600;
  const resolvedDest = path.resolve(destPath);
  const targetDir = path.dirname(resolvedDest);

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const autoHeaders = detectPlatformHeaders(url);
  const mergedHeaders = { ...autoHeaders, ...(opts.headers || {}) };

  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout * 1000);

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: mergedHeaders,
      redirect: 'follow',
      signal: controller.signal
    });

    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
    }

    if (!res.body) {
      throw new Error('Response body is empty');
    }

    const fileStream = fs.createWriteStream(resolvedDest, { flags: 'w' });
    const nodeReadable = Readable.fromWeb(res.body);

    await finished(nodeReadable.pipe(fileStream));

    const stats = fs.statSync(resolvedDest);
    const seconds = Math.round((Date.now() - startTime) / 100) / 10;

    return {
      filePath: resolvedDest,
      size: stats.size,
      seconds: Math.max(seconds, 0.1)
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
