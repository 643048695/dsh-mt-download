import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatBytes, formatSpeed, guessFilenameFromUrl, detectPlatformHeaders } from '../lib/utils.js';

test('formatBytes renders human readable sizes', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(512), '512.00 B');
  assert.equal(formatBytes(1024), '1.00 KB');
  assert.equal(formatBytes(1024 * 1024 * 3), '3.00 MB');
  assert.equal(formatBytes(-1), '0 B');
});

test('formatSpeed appends a per-second suffix', () => {
  assert.equal(formatSpeed(2048), '2.00 KB/s');
});

test('guessFilenameFromUrl keeps the last path segment', () => {
  assert.equal(guessFilenameFromUrl('https://example.com/a/b/model.bin'), 'model.bin');
  assert.equal(guessFilenameFromUrl('https://example.com/a/pkg-1.0.0.tgz?x=1'), 'pkg-1.0.0.tgz');
  assert.match(guessFilenameFromUrl('https://example.com/'), /^download_\d+$/);
  assert.match(guessFilenameFromUrl('not a url'), /^download_\d+$/);
});

test('detectPlatformHeaders always sends a user agent', () => {
  const headers = detectPlatformHeaders('https://example.com/x.zip');
  assert.ok(headers['User-Agent'].includes('Mozilla/5.0'));
  assert.equal(headers.Referer, undefined);
});

test('detectPlatformHeaders adds a referer for known hosts', () => {
  assert.equal(detectPlatformHeaders('https://v3-web.douyinvod.com/x.mp4').Referer, 'https://www.douyin.com/');
  assert.equal(detectPlatformHeaders('https://upos-sz-mirrorcos.bilivideo.com/x.m4s').Referer, 'https://www.bilibili.com/');
  assert.equal(detectPlatformHeaders('https://sns-video-bd.xhscdn.com/x.mp4').Referer, 'https://www.xiaohongshu.com/');
});
