import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { detectPlatformHeaders } from './utils.js';

let launchedProcess = null;

/**
 * 寻找可用的 aria2c.exe 路径
 * @param {string} [customPath]
 * @returns {string | null}
 */
export function findAria2Executable(customPath) {
  if (customPath && fs.existsSync(customPath)) {
    return customPath;
  }

  const envs = ['MT_ARIA2C_PATH', 'ARIA2C_PATH', 'DOUYIN_ARIA2C_PATH'];
  for (const env of envs) {
    const val = process.env[env];
    if (val && fs.existsSync(val)) {
      return val;
    }
  }

  // 常见安装位置探测（PATH 里没有时兜底）
  const homeDir = os.homedir();
  const candidates = [];

  if (process.platform === 'win32') {
    const programFiles = [process.env['ProgramFiles'], process.env['ProgramFiles(x86)']]
      .filter(Boolean);
    for (const base of programFiles) {
      candidates.push(path.join(base, 'aria2', 'aria2c.exe'));
      candidates.push(path.join(base, 'Motrix', 'resources', 'extraResources', 'aria2c.exe'));
    }
    const localAppData = process.env['LOCALAPPDATA'];
    if (localAppData) {
      candidates.push(path.join(localAppData, 'Programs', 'Motrix', 'resources', 'extraResources', 'aria2c.exe'));
      candidates.push(path.join(localAppData, 'aria2', 'aria2c.exe'));
    }
  } else {
    candidates.push('/usr/bin/aria2c', '/usr/local/bin/aria2c', '/opt/homebrew/bin/aria2c');
  }

  candidates.push(path.join(homeDir, 'Downloads', 'Motrix', 'resources', 'extraResources', 'aria2c.exe'));
  candidates.push(path.join(homeDir, '.local', 'bin', 'aria2c'));

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return null;
}

/**
 * 检查指定端口上的 aria2 RPC 服务是否存活
 * @param {number} port
 * @returns {Promise<boolean>}
 */
export async function isRpcAlive(port = 16801) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/jsonrpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'probe',
        method: 'aria2.getVersion',
        params: []
      }),
      signal: AbortSignal.timeout(2000)
    });
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data?.result?.version);
  } catch {
    return false;
  }
}

/**
 * 后台静默拉起 aria2c 进程
 * @param {string} exePath
 * @param {number} port
 * @returns {Promise<boolean>}
 */
export async function ensureAria2Rpc(exePath, port = 16801) {
  if (await isRpcAlive(port)) {
    return true;
  }

  if (!exePath || !fs.existsSync(exePath)) {
    return false;
  }

  try {
    const tempDir = os.tmpdir();
    const args = [
      '--enable-rpc',
      `--rpc-listen-port=${port}`,
      '--rpc-listen-all=false',
      '--max-connection-per-server=16',
      '--split=16',
      '--min-split-size=1M',
      '--continue=true',
      '--disable-ipv6=true',
      '--check-certificate=false',
      `--dir=${tempDir}`
    ];

    const child = spawn(exePath, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });
    child.unref();
    launchedProcess = child;

    // 等待拉起成功
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 500));
      if (await isRpcAlive(port)) {
        return true;
      }
    }
  } catch (err) {
    return false;
  }

  return false;
}

/**
 * 发送 JSON-RPC 调用
 * @param {number} port
 * @param {string} method
 * @param {any[]} params
 * @returns {Promise<any>}
 */
async function callRpc(port, method, params) {
  const res = await fetch(`http://127.0.0.1:${port}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `dsh-${Date.now()}`,
      method,
      params
    })
  });
  if (!res.ok) {
    throw new Error(`aria2 RPC HTTP error ${res.status}`);
  }
  const data = await res.json();
  if (data.error) {
    throw new Error(`aria2 RPC error ${data.error.code}: ${data.error.message}`);
  }
  return data.result;
}

/**
 * 通过 aria2 进行多通道下载
 * @param {string} url
 * @param {string} destPath
 * @param {object} opts
 * @param {number} [opts.port=16801]
 * @param {number} [opts.connections=16]
 * @param {number} [opts.timeout=600]
 * @param {Record<string, string>} [opts.headers]
 * @returns {Promise<{ filePath: string, size: number, seconds: number }>}
 */
export async function downloadWithAria2(url, destPath, opts = {}) {
  const port = opts.port ?? 16801;
  const connections = Math.min(Math.max(opts.connections ?? 16, 1), 32);
  const timeout = opts.timeout ?? 600;

  const resolvedDest = path.resolve(destPath);
  const targetDir = path.dirname(resolvedDest);
  const targetName = path.basename(resolvedDest);

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // 组装 headers
  const autoHeaders = detectPlatformHeaders(url);
  const mergedHeaders = { ...autoHeaders, ...(opts.headers || {}) };
  const headerList = Object.entries(mergedHeaders).map(([k, v]) => `${k}: ${v}`);

  const ariaOptions = {
    dir: targetDir,
    out: targetName,
    split: String(connections),
    'max-connection-per-server': String(connections),
    'allow-overwrite': 'true',
    'auto-file-renaming': 'false',
    header: headerList
  };

  const startTime = Date.now();
  const gid = await callRpc(port, 'aria2.addUri', [[url], ariaOptions]);

  const maxWaitMs = timeout * 1000;
  while (Date.now() - startTime < maxWaitMs) {
    await new Promise(r => setTimeout(r, 1000));
    const status = await callRpc(port, 'aria2.tellStatus', [gid]);
    const state = status?.status;

    if (state === 'complete') {
      const stats = fs.statSync(resolvedDest);
      const seconds = Math.round((Date.now() - startTime) / 100) / 10;
      return {
        filePath: resolvedDest,
        size: stats.size,
        seconds: Math.max(seconds, 0.1)
      };
    }

    if (state === 'error' || state === 'removed') {
      const msg = status?.errorMessage || `Task in state ${state}`;
      throw new Error(`aria2 download failed: ${msg}`);
    }
  }

  // 超时，尝试移除任务
  try {
    await callRpc(port, 'aria2.remove', [gid]);
  } catch {}
  throw new Error(`aria2 download timed out after ${timeout} seconds`);
}
