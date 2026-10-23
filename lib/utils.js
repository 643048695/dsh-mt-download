import path from 'node:path';

/**
 * 格式化字节大小为易读字符串 (B, KB, MB, GB)
 * @param {number} bytes 
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (typeof bytes !== 'number' || isNaN(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const size = bytes / Math.pow(1024, i);
  return `${size.toFixed(2)} ${units[i]}`;
}

/**
 * 格式化速度
 * @param {number} bytesPerSec 
 * @returns {string}
 */
export function formatSpeed(bytesPerSec) {
  return `${formatBytes(bytesPerSec)}/s`;
}

/**
 * 根据 URL 自动推断或提取默认文件名
 * @param {string} urlStr 
 * @returns {string}
 */
export function guessFilenameFromUrl(urlStr) {
  try {
    const parsed = new URL(urlStr);
    const basename = path.basename(parsed.pathname);
    if (basename && basename.includes('.')) {
      return decodeURIComponent(basename);
    }
  } catch {}
  return `download_${Date.now()}`;
}

/**
 * 根据目标 URL 自动检测特定站点的防盗链与伪装 Header
 * @param {string} urlStr 
 * @returns {Record<string, string>}
 */
export function detectPlatformHeaders(urlStr) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
  };

  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase();

    if (host.includes('douyin') || host.includes('iesdouyin') || host.includes('douyinvod')) {
      headers['Referer'] = 'https://www.douyin.com/';
    } else if (host.includes('bilibili') || host.includes('bilivideo') || host.includes('hdslb')) {
      headers['Referer'] = 'https://www.bilibili.com/';
    } else if (host.includes('xiaohongshu') || host.includes('xhscdn')) {
      headers['Referer'] = 'https://www.xiaohongshu.com/';
    } else if (host.includes('weibo') || host.includes('sinaimg')) {
      headers['Referer'] = 'https://weibo.com/';
    } else if (host.includes('github') || host.includes('githubusercontent')) {
      headers['Referer'] = 'https://github.com/';
    }
  } catch {}

  return headers;
}
