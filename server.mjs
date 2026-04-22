import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HOST = '127.0.0.1';
const PORT = 41739;
const PUBLIC_DIR = path.join(__dirname, 'public');
const CHAT_DIR = path.resolve(__dirname, '..', 'chathistory');
const execFileAsync = promisify(execFile);
const DEFAULT_STICKER_HOST = 'https://gchat.qpic.cn';
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp']);

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

function getDerivedPaths(chatFilePath) {
  const parsed = path.parse(chatFilePath);
  return {
    annotationsPath: path.join(parsed.dir, `${parsed.name}.annotations.json`),
    progressPath: path.join(parsed.dir, `${parsed.name}.annotation-progress.json`),
    stickerConfigPath: path.join(parsed.dir, `${parsed.name}.sticker-map.json`),
    stickerDir: path.join(parsed.dir, `${parsed.name}.stickers`),
  };
}

function normalizeStickerFilename(value) {
  return path.basename(normalizeText(value));
}

function hasRkey(url) {
  return /[?&]rkey=/i.test(`${url ?? ''}`);
}

function extractRkey(value) {
  const raw = `${value ?? ''}`.trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) {
    try {
      return new URL(raw).searchParams.get('rkey') || '';
    } catch {
      return '';
    }
  }
  const match = raw.match(/(?:^|[?&])rkey=([^&#]+)/i);
  if (match) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }
  return raw;
}

function parseStickerSampleUrl(value) {
  const raw = `${value ?? ''}`.trim();
  if (!raw) return { stickerHost: '', stickerRkey: '' };
  try {
    const url = new URL(raw);
    return {
      stickerHost: `${url.protocol}//${url.host}`,
      stickerRkey: url.searchParams.get('rkey') || '',
    };
  } catch {
    return {
      stickerHost: '',
      stickerRkey: extractRkey(raw),
    };
  }
}

function normalizeStickerHost(value) {
  const raw = `${value ?? ''}`.trim();
  if (!raw) return DEFAULT_STICKER_HOST;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withProtocol.replace(/\/+$/, '');
}

function resolveStickerRemoteUrl(value, stickerHost = DEFAULT_STICKER_HOST, stickerRkey = '') {
  const raw = `${value ?? ''}`.trim();
  if (!raw) return '';
  const normalizedRkey = extractRkey(stickerRkey);
  if (/^https?:\/\//i.test(raw)) {
    if (!normalizedRkey || hasRkey(raw)) return raw;
    const url = new URL(raw);
    url.searchParams.set('rkey', normalizedRkey);
    return url.toString();
  }
  const host = normalizeStickerHost(stickerHost);
  const fullUrl = raw.startsWith('/') ? `${host}${raw}` : `${host}/${raw.replace(/^\/+/, '')}`;
  if (!normalizedRkey || hasRkey(fullUrl)) return fullUrl;
  const url = new URL(fullUrl);
  url.searchParams.set('rkey', normalizedRkey);
  return url.toString();
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function extractStickerEntriesFromMessage(message) {
  const entries = [];
  const seen = new Set();
  const pushEntry = (resource) => {
    const filename = normalizeStickerFilename(resource?.filename || resource?.data?.filename);
    const remoteUrl = resolveStickerRemoteUrl(resource?.url || resource?.data?.url);
    if (!filename || seen.has(filename)) return;
    seen.add(filename);
    entries.push({
      filename,
      relativeUrl: `${resource?.url || resource?.data?.url || ''}`,
      remoteUrl,
      size: Number(resource?.size || resource?.data?.size || 0),
      width: Number(resource?.width || resource?.data?.width || 0),
      height: Number(resource?.height || resource?.data?.height || 0),
    });
  };

  for (const resource of message?.content?.resources || []) {
    if (`${resource?.type ?? ''}` === 'image') {
      pushEntry(resource);
    }
  }

  for (const element of message?.content?.elements || []) {
    if (`${element?.type ?? ''}` === 'image') {
      pushEntry(element?.data || {});
    }
  }

  return entries;
}

function buildStickerCatalog(messages) {
  const byFilename = new Map();
  let totalOccurrences = 0;

  for (let index = 0; index < messages.length; index += 1) {
    const entries = extractStickerEntriesFromMessage(messages[index]);
    for (const entry of entries) {
      totalOccurrences += 1;
      const existing = byFilename.get(entry.filename);
      if (existing) {
        existing.occurrences += 1;
        if (!existing.remoteUrl && entry.remoteUrl) existing.remoteUrl = entry.remoteUrl;
        if (!existing.relativeUrl && entry.relativeUrl) existing.relativeUrl = entry.relativeUrl;
        continue;
      }

      byFilename.set(entry.filename, {
        ...entry,
        occurrences: 1,
        firstSeenIndex: index,
      });
    }
  }

  const items = [...byFilename.values()].sort((a, b) => a.firstSeenIndex - b.firstSeenIndex);
  return {
    totalOccurrences,
    items,
  };
}

async function readStickerConfig(chatFilePath) {
  const { stickerConfigPath } = getDerivedPaths(chatFilePath);
  try {
    const raw = await fs.readFile(stickerConfigPath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.stickers) ? parsed : null;
  } catch {
    return null;
  }
}

async function ensureStickerConfig(chatFilePath, messages) {
  const derived = getDerivedPaths(chatFilePath);
  const catalog = buildStickerCatalog(messages);
  const existing = (await readStickerConfig(chatFilePath)) || {};
  const stickerHost = normalizeStickerHost(existing?.stickerHost || DEFAULT_STICKER_HOST);
  const existingMap = new Map(
    (Array.isArray(existing?.stickers) ? existing.stickers : [])
      .map((item) => [normalizeStickerFilename(item?.filename), item])
      .filter(([filename]) => filename),
  );

  let nextId = Math.max(0, ...(Array.isArray(existing?.stickers) ? existing.stickers.map((item) => Number(item?.id) || 0) : [0])) + 1;
  const stickers = [];

  for (const entry of catalog.items) {
    const current = existingMap.get(entry.filename);
    const id = Number(current?.id) > 0 ? Number(current.id) : nextId++;
    const localFile = path.join(derived.stickerDir, entry.filename);
    const downloaded = await pathExists(localFile);
    stickers.push({
      id,
      filename: entry.filename,
      occurrences: entry.occurrences,
      firstSeenIndex: entry.firstSeenIndex,
      relativeUrl: entry.relativeUrl || `${current?.relativeUrl ?? ''}`,
      remoteUrl: resolveStickerRemoteUrl(entry.relativeUrl || current?.relativeUrl || entry.remoteUrl || current?.remoteUrl || '', stickerHost),
      localFile,
      downloaded,
      downloadError: downloaded ? '' : `${current?.downloadError ?? ''}`,
      updatedAt: new Date().toISOString(),
    });
  }

  const config = {
    version: 1,
    sourceFile: chatFilePath,
    stickerHost,
    exportTokenFormat: '<stickerX,Ytimes>',
    exportRule: 'X is the stable sticker id from this file, Y is the uninterrupted repeat count for the same sticker by the same speaker.',
    downloadFolder: path.basename(derived.stickerDir),
    totalOccurrences: catalog.totalOccurrences,
    uniqueCount: stickers.length,
    updatedAt: new Date().toISOString(),
    stickers,
  };

  await fs.writeFile(derived.stickerConfigPath, JSON.stringify(config, null, 2), 'utf8');
  return config;
}

function summarizeStickerPack(stickerConfig) {
  const stickers = Array.isArray(stickerConfig?.stickers) ? stickerConfig.stickers : [];
  const downloadedCount = stickers.filter((item) => item.downloaded).length;
  const failedCount = stickers.filter((item) => !item.downloaded && normalizeText(item.downloadError)).length;
  return {
    host: normalizeStickerHost(stickerConfig?.stickerHost || DEFAULT_STICKER_HOST),
    configPath: stickerConfig?.sourceFile ? getDerivedPaths(stickerConfig.sourceFile).stickerConfigPath : '',
    downloadFolder: stickerConfig?.downloadFolder || '',
    totalImages: Number(stickerConfig?.totalOccurrences ?? 0),
    uniqueStickers: stickers.length,
    downloadedCount,
    failedCount,
    items: stickers.map((item) => ({
      id: Number(item?.id) || 0,
      filename: normalizeStickerFilename(item?.filename),
      occurrences: Number(item?.occurrences ?? 0),
      remoteUrl: `${item?.remoteUrl ?? ''}`,
      relativeUrl: `${item?.relativeUrl ?? ''}`,
      downloaded: Boolean(item?.downloaded),
      downloadError: `${item?.downloadError ?? ''}`,
      localFile: `${item?.localFile ?? ''}`,
      previewUrl: item?.downloaded ? `/api/sticker-file?path=${encodeURIComponent(item.localFile)}` : '',
    })),
  };
}

async function downloadStickerFile(sticker) {
  const remoteUrl = `${sticker?.remoteUrl ?? ''}`;
  if (!remoteUrl) {
    return { downloaded: false, error: 'Missing remote URL' };
  }

  const response = await fetch(remoteUrl);
  if (!response.ok) {
    return { downloaded: false, error: `HTTP ${response.status}` };
  }

  const arrayBuffer = await response.arrayBuffer();
  await fs.writeFile(sticker.localFile, Buffer.from(arrayBuffer));
  return { downloaded: true, error: '' };
}

async function updateStickerSettings(chatFilePath, messages, { nextHost = '' } = {}) {
  const derived = getDerivedPaths(chatFilePath);
  const config = await ensureStickerConfig(chatFilePath, messages);
  const stickerHost = normalizeStickerHost(nextHost || config.stickerHost || DEFAULT_STICKER_HOST);
  config.stickerHost = stickerHost;
  config.updatedAt = new Date().toISOString();
  config.stickers = (config.stickers || []).map((item) => ({
    ...item,
    remoteUrl: resolveStickerRemoteUrl(item?.relativeUrl || item?.remoteUrl || '', stickerHost),
    updatedAt: new Date().toISOString(),
  }));
  await fs.writeFile(derived.stickerConfigPath, JSON.stringify(config, null, 2), 'utf8');
  return config;
}

async function readOrCreateStickerConfig(chatFilePath) {
  const raw = await fs.readFile(chatFilePath, 'utf8');
  const chatData = JSON.parse(raw);
  const config = await ensureStickerConfig(chatFilePath, Array.isArray(chatData?.messages) ? chatData.messages : []);
  return { chatData, config };
}

async function ensureAnnotationStore(chatFilePath) {
  const { annotationsPath } = getDerivedPaths(chatFilePath);
  try {
    await fs.access(annotationsPath);
  } catch {
    await fs.writeFile(annotationsPath, JSON.stringify({ annotations: [] }, null, 2), 'utf8');
  }
}

async function readAnnotations(chatFilePath) {
  await ensureAnnotationStore(chatFilePath);
  const { annotationsPath } = getDerivedPaths(chatFilePath);
  const raw = await fs.readFile(annotationsPath, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.annotations)
      ? { annotations: parsed.annotations.map(normalizeStoredAnnotationRecord) }
      : { annotations: [] };
  } catch {
    return { annotations: [] };
  }
}

async function writeAnnotations(chatFilePath, data) {
  await ensureAnnotationStore(chatFilePath);
  const { annotationsPath } = getDerivedPaths(chatFilePath);
  await fs.writeFile(annotationsPath, JSON.stringify(data, null, 2), 'utf8');
}

async function listChatFiles() {
  const results = [];

  async function walk(dir, prefix = '') {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const relativePath = path.posix.join(prefix, entry.name);
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath, relativePath);
        continue;
      }
      if (!entry.name.toLowerCase().endsWith('.json')) continue;
      const stat = await fs.stat(fullPath);
      results.push({
        id: relativePath,
        name: entry.name,
        relativePath,
        size: stat.size,
        updatedAt: stat.mtime.toISOString(),
      });
    }
  }

  try {
    await walk(CHAT_DIR);
  } catch {
    return [];
  }

  return results.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

async function openChatFileDialog() {
  if (process.platform !== 'win32') {
    throw new Error('当前系统暂不支持原生文件选择框。');
  }

  const script = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.InitialDirectory = '${CHAT_DIR.replace(/'/g, "''")}'
$dialog.Filter = 'JSON files (*.json)|*.json|All files (*.*)|*.*'
$dialog.Multiselect = $false
$dialog.Title = 'Select chat JSON'
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  Write-Output $dialog.FileName
}
`;

  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-STA', '-EncodedCommand', encoded],
    { windowsHide: true, maxBuffer: 1024 * 1024 },
  );

  return stdout.trim();
}

function isSafeJsonPath(filePath) {
  return typeof filePath === 'string' && filePath.toLowerCase().endsWith('.json');
}

async function resolveChatFile(fileId, explicitPath = '') {
  if (explicitPath) {
    const normalized = path.resolve(explicitPath);
    if (isSafeJsonPath(normalized)) {
      try {
        const stat = await fs.stat(normalized);
        if (stat.isFile()) return normalized;
      } catch {
        // Fall back to file id lookup below.
      }
    }
  }

  const files = await listChatFiles();
  const match = files.find((item) => item.id === fileId);
  if (!match) return null;
  return path.join(CHAT_DIR, ...match.id.split('/'));
}

function normalizeText(value) {
  return `${value ?? ''}`.trim();
}

function mostFrequent(values) {
  const counts = new Map();
  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized) continue;
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  }

  let winner = '';
  let bestCount = -1;
  for (const [value, count] of counts.entries()) {
    if (count > bestCount) {
      winner = value;
      bestCount = count;
    }
  }
  return winner;
}

function derivePeerUid(messages, selfUid, statisticsSenders) {
  const senderFromStats = statisticsSenders.find((item) => normalizeText(item?.uid) && normalizeText(item?.uid) !== selfUid);
  if (senderFromStats) {
    return normalizeText(senderFromStats.uid);
  }

  const peerUidCounts = new Map();
  for (const message of messages) {
    const senderUid = normalizeText(message?.sender?.uid);
    if (!senderUid || senderUid === selfUid) continue;
    peerUidCounts.set(senderUid, (peerUidCounts.get(senderUid) || 0) + 1);
  }

  let bestUid = '';
  let bestCount = -1;
  for (const [uid, count] of peerUidCounts.entries()) {
    if (count > bestCount) {
      bestUid = uid;
      bestCount = count;
    }
  }
  return bestUid;
}

function resolveIdentity(chatData) {
  const chatInfo = chatData?.chatInfo || {};
  const statistics = chatData?.statistics || {};
  const messages = Array.isArray(chatData?.messages) ? chatData.messages : [];
  const statisticsSenders = Array.isArray(statistics?.senders) ? statistics.senders : [];

  const selfUid = normalizeText(chatInfo?.selfUid);
  const selfUin = normalizeText(chatInfo?.selfUin);
  const selfName = normalizeText(chatInfo?.selfName);
  const peerRemark = normalizeText(chatInfo?.name);
  const peerUid = derivePeerUid(messages, selfUid, statisticsSenders);

  const peerMessages = messages.filter((message) => normalizeText(message?.sender?.uid) === peerUid);
  const peerUin = mostFrequent(peerMessages.map((message) => message?.sender?.uin));
  const peerNickname = mostFrequent(peerMessages.map((message) => message?.sender?.name));

  return {
    self: {
      uid: selfUid,
      uin: selfUin,
      name: selfName,
      displayName: selfName || selfUid || 'self',
    },
    peer: {
      uid: peerUid,
      uin: peerUin,
      remark: peerRemark,
      nickname: peerNickname,
      displayName: peerRemark || peerNickname || peerUid || 'peer',
    },
  };
}

function senderKeyForMessage(message, identity) {
  const senderUid = normalizeText(message?.sender?.uid);
  if (senderUid && senderUid === identity.self.uid) return 'self';
  if (senderUid && senderUid === identity.peer.uid) return 'peer';
  if (message?.system) return 'system';
  return 'other';
}

function displayNameForSender(senderKey, message, identity) {
  if (senderKey === 'self') return identity.self.displayName;
  if (senderKey === 'peer') return identity.peer.displayName;
  return normalizeText(message?.sender?.name) || 'system';
}

async function normalizeChatExport(chatData, fileId, fullPath) {
  const chatInfo = chatData?.chatInfo || {};
  const messages = Array.isArray(chatData?.messages) ? chatData.messages : [];
  const derivedPaths = getDerivedPaths(fullPath);
  const identity = resolveIdentity(chatData);
  const stickerConfig = await ensureStickerConfig(fullPath, messages);
  const stickerMap = new Map(summarizeStickerPack(stickerConfig).items.map((item) => [item.filename, item]));

  const normalizedMessages = messages.map((message, index) => {
    const senderUid = normalizeText(message?.sender?.uid);
    const senderUin = normalizeText(message?.sender?.uin);
    const senderKey = senderKeyForMessage(message, identity);
    const stickers = extractStickerEntriesFromMessage(message)
      .map((item) => {
        const mapped = stickerMap.get(item.filename);
        return mapped
          ? {
              id: mapped.id,
              filename: mapped.filename,
              downloaded: mapped.downloaded,
              downloadError: mapped.downloadError,
              previewUrl: mapped.previewUrl,
              remoteUrl: mapped.remoteUrl,
              relativeUrl: mapped.relativeUrl,
            }
          : null;
      })
      .filter(Boolean);

    return {
      index,
      id: `${message?.id ?? index}`,
      seq: `${message?.seq ?? index}`,
      timestamp: Number(message?.timestamp ?? 0),
      time: normalizeText(message?.time),
      type: normalizeText(message?.type),
      recalled: Boolean(message?.recalled),
      system: Boolean(message?.system) || senderKey === 'system',
      senderKey,
      senderName: displayNameForSender(senderKey, message, identity),
      rawSenderName: normalizeText(message?.sender?.name),
      senderUid,
      senderUin,
      isSelf: senderKey === 'self',
      isPeer: senderKey === 'peer',
      text: `${message?.content?.text ?? ''}`,
      stickers,
    };
  });

  return {
    fileId,
    filePath: fullPath,
    annotationPath: derivedPaths.annotationsPath,
    stickerConfigPath: derivedPaths.stickerConfigPath,
    stickerDir: derivedPaths.stickerDir,
    schema: {
      sourceRepo: 'shuakami/qq-chat-exporter',
      sourceFiles: [
        'plugins/qq-chat-exporter/lib/core/exporter/JsonExporter.ts',
        'plugins/qq-chat-exporter/lib/core/parser/SimpleMessageParser.ts',
      ],
      topLevelFields: ['metadata', 'chatInfo', 'statistics', 'messages'],
      messageFields: ['id', 'seq', 'timestamp', 'time', 'sender', 'type', 'content', 'recalled', 'system'],
    },
    chatInfo: {
      name: normalizeText(chatInfo?.name),
      type: normalizeText(chatInfo?.type),
      selfUid: identity.self.uid,
      selfUin: identity.self.uin,
      selfName: identity.self.name,
    },
    identity,
    statistics: chatData?.statistics ?? {},
    stickerPack: summarizeStickerPack(stickerConfig),
    messages: normalizedMessages,
  };
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

async function serveStatic(req, res) {
  const requestUrl = new URL(req.url, `http://${HOST}:${PORT}`);
  const pathname = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, 'Forbidden');
    return;
  }

  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      sendText(res, 403, 'Forbidden');
      return;
    }
    const content = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(content);
  } catch {
    sendText(res, 404, 'Not found');
  }
}

function normalizeStoredSpeakerKey(message, identity) {
  if (['self', 'peer', 'system', 'other'].includes(message?.speakerKey)) {
    return message.speakerKey;
  }

  const senderUid = normalizeText(message?.senderUid);
  const senderName = normalizeText(message?.senderName);
  if (senderUid && senderUid === identity.self.uid) return 'self';
  if (senderUid && senderUid === identity.peer.uid) return 'peer';
  if (message?.isSelf) return 'self';

  const selfTokens = new Set([
    normalizeText(identity.self.uid),
    normalizeText(identity.self.uin),
    normalizeText(identity.self.name),
    normalizeText(identity.self.displayName),
  ]);
  if (senderName && selfTokens.has(senderName)) return 'self';

  const peerTokens = new Set([
    normalizeText(identity.peer.uid),
    normalizeText(identity.peer.uin),
    normalizeText(identity.peer.nickname),
    normalizeText(identity.peer.remark),
    normalizeText(identity.peer.displayName),
  ]);
  if (senderName && peerTokens.has(senderName)) return 'peer';

  return 'other';
}

function roleForSpeakerKey(speakerKey, roleSwap) {
  if (speakerKey === 'self') return roleSwap ? 'assistant' : 'user';
  if (speakerKey === 'peer') return roleSwap ? 'user' : 'assistant';
  return null;
}

function roleTokenForReference(token, identity, roleSwap) {
  const normalized = normalizeText(token);
  if (!normalized) return normalized;

  const selfTokens = new Set([
    normalizeText(identity.self.uid),
    normalizeText(identity.self.uin),
    normalizeText(identity.self.name),
    normalizeText(identity.self.displayName),
  ]);
  if (selfTokens.has(normalized)) {
    return roleForSpeakerKey('self', roleSwap) || normalized;
  }

  const peerTokens = new Set([
    normalizeText(identity.peer.uid),
    normalizeText(identity.peer.uin),
    normalizeText(identity.peer.nickname),
    normalizeText(identity.peer.remark),
    normalizeText(identity.peer.displayName),
  ]);
  if (peerTokens.has(normalized)) {
    return roleForSpeakerKey('peer', roleSwap) || normalized;
  }

  return normalized;
}

function stickerMapFromConfig(stickerConfig) {
  return new Map((Array.isArray(stickerConfig?.stickers) ? stickerConfig.stickers : []).map((item) => [normalizeStickerFilename(item?.filename), item]));
}

function inferStickersFromStoredMessage(message, stickerConfig) {
  const directStickers = Array.isArray(message?.stickers) ? message.stickers : [];
  if (directStickers.length) {
    return directStickers
      .map((item) => ({
        id: Number(item?.id || item?.stickerId) || 0,
        filename: normalizeStickerFilename(item?.filename),
      }))
      .filter((item) => item.id > 0 && item.filename);
  }

  const stickerMap = stickerMapFromConfig(stickerConfig);
  const filenames = [...`${message?.text ?? ''}`.matchAll(/\[图片:\s*([^\]]+)\]/g)].map((match) => normalizeStickerFilename(match[1]));
  return filenames
    .map((filename) => {
      const item = stickerMap.get(filename);
      return item ? { id: Number(item.id) || 0, filename } : null;
    })
    .filter(Boolean);
}

function isPureStickerMessage(text, stickers) {
  if (!stickers.length) return false;
  const normalized = `${text ?? ''}`.trim();
  if (!normalized) return false;
  const withoutPlaceholders = normalized.replace(/\[图片:\s*[^\]]+\]/g, '').replace(/\s+/g, '');
  return withoutPlaceholders.length === 0;
}

function transformDatasetText(text, identity, roleSwap, stickers = []) {
  const stickerMap = new Map(stickers.map((item) => [normalizeStickerFilename(item?.filename), Number(item?.id || item?.stickerId) || 0]));
  return `${text ?? ''}`
    .replace(/\[回复\s+([^:\]：]+)\s*([:：])/g, (_match, target, punctuation) => {
      return `[回复 ${roleTokenForReference(target, identity, roleSwap)}${punctuation}`;
    })
    .replace(/\[图片:\s*([^\]]+)\]/g, (_match, filename) => {
      const stickerId = stickerMap.get(normalizeStickerFilename(filename));
      return stickerId ? `<sticker${stickerId},1times>` : `[图片: ${normalizeStickerFilename(filename)}]`;
    });
}

function buildSegmentsFromSelectedMessage(rawMessage, identity, roleSwap, stickerConfig) {
  const stickers = inferStickersFromStoredMessage(rawMessage, stickerConfig);
  const text = `${rawMessage?.text ?? ''}`.trim();
  if (isPureStickerMessage(text, stickers)) {
    return stickers.map((item) => ({ kind: 'sticker', stickerId: item.id }));
  }

  const transformedText = transformDatasetText(text, identity, roleSwap, stickers);
  if (!transformedText) return [];
  return [{ kind: 'text', content: transformedText }];
}

function buildDatasetMessagesFromSelectedMessages(selectedMessages, identity, roleSwap, stickerConfig) {
  const groups = [];

  for (const rawMessage of selectedMessages || []) {
    const speakerKey = normalizeStoredSpeakerKey(rawMessage, identity);
    const role = roleForSpeakerKey(speakerKey, roleSwap);
    const segments = buildSegmentsFromSelectedMessage(rawMessage, identity, roleSwap, stickerConfig);
    if (!role || !segments.length) continue;

    const previous = groups.at(-1);
    const group = previous && previous.role === role
      ? previous
      : (() => {
          const nextGroup = { role, lines: [] };
          groups.push(nextGroup);
          return nextGroup;
        })();

    for (const segment of segments) {
      if (segment.kind === 'sticker') {
        const lastLine = group.lines.at(-1);
        if (lastLine?.kind === 'sticker' && lastLine.stickerId === segment.stickerId) {
          lastLine.count += 1;
        } else {
          group.lines.push({ kind: 'sticker', stickerId: segment.stickerId, count: 1 });
        }
        continue;
      }

      if (segment.content) {
        group.lines.push({ kind: 'text', content: segment.content });
      }
    }
  }

  return groups.map((group) => ({
    role: group.role,
    content: group.lines
      .map((line) => (line.kind === 'sticker' ? `<sticker${line.stickerId},${line.count}times>` : line.content))
      .join(' <MSG_SEP> '),
  }));
}

function sanitizeSelectedMessage(message) {
  return {
    messageIndex: Number(message?.messageIndex ?? -1),
    messageId: `${message?.messageId ?? ''}`,
    senderName: `${message?.senderName ?? ''}`,
    senderUid: `${message?.senderUid ?? ''}`,
    senderUin: `${message?.senderUin ?? ''}`,
    stickers: (Array.isArray(message?.stickers) ? message.stickers : []).map((sticker) => ({
      id: Number(sticker?.id || sticker?.stickerId) || 0,
      filename: normalizeStickerFilename(sticker?.filename),
    })),
    speakerKey: ['self', 'peer', 'system', 'other'].includes(message?.speakerKey) ? message.speakerKey : 'other',
    role: normalizeSavedRole(message?.role),
    text: `${message?.text ?? ''}`,
    time: `${message?.time ?? ''}`,
    isSelf: Boolean(message?.isSelf),
  };
}

function sanitizeDatasetMessages(datasetMessages) {
  return (Array.isArray(datasetMessages) ? datasetMessages : []).map((message) => ({
    role: message?.role === 'assistant' ? 'assistant' : message?.role === 'system' ? 'system' : 'user',
    content: `${message?.content ?? ''}`,
  }));
}

function buildLocatePayload(selectedMessages) {
  const indices = [...new Set(
    (Array.isArray(selectedMessages) ? selectedMessages : [])
      .map((message) => Number(message?.messageIndex ?? -1))
      .filter((index) => index >= 0),
  )].sort((a, b) => a - b);
  const first = Array.isArray(selectedMessages) ? selectedMessages[0] || null : null;
  const last = Array.isArray(selectedMessages) ? selectedMessages[selectedMessages.length - 1] || null : null;
  return {
    firstMessageIndex: indices[0] ?? null,
    lastMessageIndex: indices.length ? indices[indices.length - 1] : null,
    messageIndices: indices,
    firstMessageId: `${first?.messageId ?? ''}`,
    anchorTime: `${first?.time ?? ''}`,
    tailTime: `${last?.time ?? ''}`,
  };
}

function sanitizeAnnotationVariant(variant) {
  const selectedMessages = (Array.isArray(variant?.selectedMessages) ? variant.selectedMessages : []).map(sanitizeSelectedMessage);
  const datasetMessages = sanitizeDatasetMessages(variant?.dataset?.messages);
  return {
    id: typeof variant?.id === 'string' && variant.id ? variant.id : randomUUID(),
    label: typeof variant?.label === 'string' ? variant.label : '',
    selectedMessages,
    dataset: { messages: datasetMessages },
    locate: buildLocatePayload(selectedMessages),
    createdAt: typeof variant?.createdAt === 'string' && variant.createdAt ? variant.createdAt : new Date().toISOString(),
    updatedAt: typeof variant?.updatedAt === 'string' && variant.updatedAt ? variant.updatedAt : new Date().toISOString(),
  };
}

function normalizeStoredAnnotationRecord(annotation) {
  const selectedMessages = (Array.isArray(annotation?.selectedMessages) ? annotation.selectedMessages : []).map(sanitizeSelectedMessage);
  const dataset = { messages: sanitizeDatasetMessages(annotation?.dataset?.messages) };
  const variants = Array.isArray(annotation?.variants) && annotation.variants.length
    ? annotation.variants.map(sanitizeAnnotationVariant)
    : [sanitizeAnnotationVariant({ selectedMessages, dataset })];
  const sourceMessages = (Array.isArray(annotation?.sourceMessages) ? annotation.sourceMessages : []).map(sanitizeSelectedMessage);
  const primary = variants[0] || sanitizeAnnotationVariant({ selectedMessages, dataset });

  return {
    ...annotation,
    id: typeof annotation?.id === 'string' && annotation.id ? annotation.id : randomUUID(),
    kind: annotation?.kind === 'context-expansion' ? 'context-expansion' : 'single',
    label: typeof annotation?.label === 'string' ? annotation.label : '',
    selectedMessages: primary.selectedMessages,
    dataset: primary.dataset,
    sourceMessages: sourceMessages.length ? sourceMessages : primary.selectedMessages,
    variants,
    locate: annotation?.locate && typeof annotation.locate === 'object'
      ? {
          ...buildLocatePayload(primary.selectedMessages),
          ...annotation.locate,
        }
      : buildLocatePayload(primary.selectedMessages),
    createdAt: typeof annotation?.createdAt === 'string' && annotation.createdAt ? annotation.createdAt : new Date().toISOString(),
    updatedAt: typeof annotation?.updatedAt === 'string' && annotation.updatedAt ? annotation.updatedAt : new Date().toISOString(),
  };
}

function remapAnnotation(annotation, identity, roleSwap, stickerConfig) {
  const remapMessages = (messages) => (messages || []).map((message) => {
    const speakerKey = normalizeStoredSpeakerKey(message, identity);
    return {
      ...message,
      speakerKey,
      role: roleForSpeakerKey(speakerKey, roleSwap) || 'other',
    };
  });

  const variants = (annotation?.variants || []).map((variant) => {
    const selectedMessages = remapMessages(variant?.selectedMessages || []);
    return {
      ...variant,
      selectedMessages,
      dataset: {
        messages: buildDatasetMessagesFromSelectedMessages(selectedMessages, identity, roleSwap, stickerConfig),
      },
      locate: buildLocatePayload(selectedMessages),
      updatedAt: new Date().toISOString(),
    };
  });
  const primary = variants[0] || sanitizeAnnotationVariant({ selectedMessages: [], dataset: { messages: [] } });

  return {
    ...annotation,
    selectedMessages: primary.selectedMessages,
    dataset: primary.dataset,
    sourceMessages: remapMessages(annotation?.sourceMessages || primary.selectedMessages),
    variants,
    locate: buildLocatePayload(primary.selectedMessages),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeSavedRole(role) {
  if (role === 'assistant' || role === 'user') return role;
  return 'other';
}

function sanitizeAnnotationPayload(body) {
  const fileId = typeof body?.fileId === 'string' ? body.fileId : '';
  const filePath = typeof body?.filePath === 'string' ? body.filePath : '';
  const kind = body?.kind === 'context-expansion' ? 'context-expansion' : 'single';
  const selectedMessages = (Array.isArray(body?.selectedMessages) ? body.selectedMessages : []).map(sanitizeSelectedMessage);
  const dataset = { messages: sanitizeDatasetMessages(body?.dataset?.messages) };
  const variants = Array.isArray(body?.variants) && body.variants.length
    ? body.variants.map(sanitizeAnnotationVariant)
    : [sanitizeAnnotationVariant({ selectedMessages, dataset })];
  const primary = variants[0];
  const sourceMessages = (Array.isArray(body?.sourceMessages) ? body.sourceMessages : []).map(sanitizeSelectedMessage);

  return normalizeStoredAnnotationRecord({
    fileId,
    filePath,
    kind,
    label: typeof body?.label === 'string' ? body.label : '',
    selectedMessages: primary?.selectedMessages || [],
    dataset: primary?.dataset || { messages: [] },
    sourceMessages: sourceMessages.length ? sourceMessages : primary?.selectedMessages || [],
    variants,
  });
}

function createAppServer() {
  return createServer(async (req, res) => {
    const requestUrl = new URL(req.url, `http://${HOST}:${PORT}`);

    try {
      if (req.method === 'POST' && requestUrl.pathname === '/api/select-file') {
        const selectedPath = await openChatFileDialog();
        if (!selectedPath) {
          sendJson(res, 200, { cancelled: true });
          return;
        }

        const fullPath = await resolveChatFile('', selectedPath);
        if (!fullPath) {
          sendJson(res, 400, { error: '所选文件无效。' });
          return;
        }

        sendJson(res, 200, {
          cancelled: false,
          filePath: fullPath,
          fileId: path.basename(fullPath),
        });
        return;
      }

      if (req.method === 'GET' && requestUrl.pathname === '/api/chat') {
        const fileId = requestUrl.searchParams.get('file') || '';
        const explicitPath = requestUrl.searchParams.get('path') || '';
        const fullPath = await resolveChatFile(fileId, explicitPath);
        if (!fullPath) {
          sendJson(res, 404, { error: '找不到对应的聊天记录文件。' });
          return;
        }

        const raw = await fs.readFile(fullPath, 'utf8');
        const chatData = JSON.parse(raw);
        sendJson(res, 200, await normalizeChatExport(chatData, fileId || path.basename(fullPath), fullPath));
        return;
      }

      if (req.method === 'GET' && requestUrl.pathname === '/api/sticker-file') {
        const targetPath = path.resolve(requestUrl.searchParams.get('path') || '');
        if (!targetPath || !IMAGE_EXTENSIONS.has(path.extname(targetPath).toLowerCase())) {
          sendText(res, 400, 'Invalid image path');
          return;
        }

        try {
          const stat = await fs.stat(targetPath);
          if (!stat.isFile()) {
            sendText(res, 404, 'Not found');
            return;
          }

          const ext = path.extname(targetPath).toLowerCase();
          res.writeHead(200, {
            'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
            'Cache-Control': 'no-store',
          });
          res.end(await fs.readFile(targetPath));
        } catch {
          sendText(res, 404, 'Not found');
        }
        return;
      }

      if (req.method === 'POST' && requestUrl.pathname === '/api/stickers/download') {
        const body = await readRequestBody(req);
        const fileId = typeof body?.fileId === 'string' ? body.fileId : '';
        const filePath = typeof body?.filePath === 'string' ? body.filePath : '';
        const fullPath = await resolveChatFile(fileId, filePath);
        if (!fullPath) {
          sendJson(res, 400, { error: '聊天记录文件无效。' });
          return;
        }

        const raw = await fs.readFile(fullPath, 'utf8');
        const chatData = JSON.parse(raw);
        const stickerConfig = await ensureStickerConfig(fullPath, Array.isArray(chatData?.messages) ? chatData.messages : []);
        await fs.mkdir(getDerivedPaths(fullPath).stickerDir, { recursive: true });
        let downloadedNow = 0;
        let skipped = 0;
        let failed = 0;

        for (const sticker of stickerConfig.stickers) {
          if (await pathExists(sticker.localFile)) {
            sticker.downloaded = true;
            sticker.downloadError = '';
            skipped += 1;
            continue;
          }

          const result = await downloadStickerFile(sticker);
          sticker.downloaded = result.downloaded;
          sticker.downloadError = result.error;
          if (result.downloaded) downloadedNow += 1;
          else failed += 1;
        }

        stickerConfig.updatedAt = new Date().toISOString();
        await fs.writeFile(getDerivedPaths(fullPath).stickerConfigPath, JSON.stringify(stickerConfig, null, 2), 'utf8');

        sendJson(res, 200, {
          downloadedNow,
          skipped,
          failed,
          stickerPack: summarizeStickerPack(stickerConfig),
        });
        return;
      }

      if (req.method === 'POST' && requestUrl.pathname === '/api/stickers/download-one') {
        const body = await readRequestBody(req);
        const fileId = typeof body?.fileId === 'string' ? body.fileId : '';
        const filePath = typeof body?.filePath === 'string' ? body.filePath : '';
        const stickerId = Number(body?.stickerId || 0);
        const stickerRkey = typeof body?.stickerRkey === 'string' ? body.stickerRkey : '';
        const fullPath = await resolveChatFile(fileId, filePath);
        if (!fullPath) {
          sendJson(res, 400, { error: '聊天记录文件无效。' });
          return;
        }
        if (!stickerId) {
          sendJson(res, 400, { error: '缺少 stickerId。' });
          return;
        }

        const { config } = await readOrCreateStickerConfig(fullPath);
        await fs.mkdir(getDerivedPaths(fullPath).stickerDir, { recursive: true });
        const sticker = (config.stickers || []).find((item) => Number(item?.id) === stickerId);
        if (!sticker) {
          sendJson(res, 404, { error: '找不到对应的表情包。' });
          return;
        }

        sticker.remoteUrl = resolveStickerRemoteUrl(sticker?.relativeUrl || sticker?.remoteUrl || '', config.stickerHost, stickerRkey);

        if (await pathExists(sticker.localFile)) {
          sticker.downloaded = true;
          sticker.downloadError = '';
          sticker.updatedAt = new Date().toISOString();
          await fs.writeFile(getDerivedPaths(fullPath).stickerConfigPath, JSON.stringify(config, null, 2), 'utf8');
          sendJson(res, 200, {
            result: { status: 'skipped', stickerId },
            stickerPack: summarizeStickerPack(config),
          });
          return;
        }

        const result = await downloadStickerFile(sticker);
        sticker.downloaded = result.downloaded;
        sticker.downloadError = result.error;
        sticker.updatedAt = new Date().toISOString();
        await fs.writeFile(getDerivedPaths(fullPath).stickerConfigPath, JSON.stringify(config, null, 2), 'utf8');
        sendJson(res, 200, {
          result: { status: result.downloaded ? 'downloaded' : 'failed', stickerId, error: result.error || '' },
          stickerPack: summarizeStickerPack(config),
        });
        return;
      }

      if (req.method === 'POST' && requestUrl.pathname === '/api/stickers/settings') {
        const body = await readRequestBody(req);
        const fileId = typeof body?.fileId === 'string' ? body.fileId : '';
        const filePath = typeof body?.filePath === 'string' ? body.filePath : '';
        const stickerHost = typeof body?.stickerHost === 'string' ? body.stickerHost : '';
        const fullPath = await resolveChatFile(fileId, filePath);
        if (!fullPath) {
          sendJson(res, 400, { error: '聊天记录文件无效。' });
          return;
        }

        const raw = await fs.readFile(fullPath, 'utf8');
        const chatData = JSON.parse(raw);
        const config = await updateStickerSettings(fullPath, Array.isArray(chatData?.messages) ? chatData.messages : [], {
          nextHost: stickerHost,
        });
        sendJson(res, 200, {
          stickerPack: summarizeStickerPack(config),
          stickerConfigPath: getDerivedPaths(fullPath).stickerConfigPath,
        });
        return;
      }

      if (req.method === 'GET' && requestUrl.pathname === '/api/annotations') {
        const fileId = requestUrl.searchParams.get('file') || '';
        const explicitPath = requestUrl.searchParams.get('path') || '';
        const fullPath = await resolveChatFile(fileId, explicitPath);
        if (!fullPath) {
          sendJson(res, 404, { error: '找不到对应的聊天记录文件。' });
          return;
        }

        const store = await readAnnotations(fullPath);
        sendJson(res, 200, {
          annotations: store.annotations.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)),
          ...getDerivedPaths(fullPath),
        });
        return;
      }

      if (req.method === 'POST' && requestUrl.pathname === '/api/annotations') {
        const body = sanitizeAnnotationPayload(await readRequestBody(req));
        if (!body.selectedMessages.length || !body.dataset.messages.length) {
          sendJson(res, 400, { error: '标注数据不完整，无法保存。' });
          return;
        }

        const fullPath = await resolveChatFile(body.fileId, body.filePath);
        if (!fullPath) {
          sendJson(res, 400, { error: '聊天记录文件无效。' });
          return;
        }

        const store = await readAnnotations(fullPath);
        const now = new Date().toISOString();
        const annotation = {
          id: randomUUID(),
          createdAt: now,
          updatedAt: now,
          ...body,
          fileId: body.fileId || path.basename(fullPath),
          filePath: fullPath,
        };
        store.annotations.push(annotation);
        await writeAnnotations(fullPath, store);
        sendJson(res, 201, { annotation });
        return;
      }

      if (req.method === 'POST' && requestUrl.pathname === '/api/annotations/remap') {
        const body = await readRequestBody(req);
        const fileId = typeof body?.fileId === 'string' ? body.fileId : '';
        const filePath = typeof body?.filePath === 'string' ? body.filePath : '';
        const roleSwap = Boolean(body?.roleSwap);
        const fullPath = await resolveChatFile(fileId, filePath);
        if (!fullPath) {
          sendJson(res, 400, { error: '聊天记录文件无效。' });
          return;
        }

        const raw = await fs.readFile(fullPath, 'utf8');
        const chatData = JSON.parse(raw);
        const identity = resolveIdentity(chatData);
        const stickerConfig = await ensureStickerConfig(fullPath, Array.isArray(chatData?.messages) ? chatData.messages : []);
        const store = await readAnnotations(fullPath);
        store.annotations = store.annotations.map((annotation) => remapAnnotation(annotation, identity, roleSwap, stickerConfig));
        await writeAnnotations(fullPath, store);

        sendJson(res, 200, {
          annotations: store.annotations.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)),
        });
        return;
      }

      if (req.method === 'PUT' && requestUrl.pathname.startsWith('/api/annotations/')) {
        const annotationId = requestUrl.pathname.split('/').pop();
        const body = sanitizeAnnotationPayload(await readRequestBody(req));
        const fullPath = await resolveChatFile(body.fileId, body.filePath);
        if (!fullPath) {
          sendJson(res, 400, { error: '聊天记录文件无效。' });
          return;
        }

        const store = await readAnnotations(fullPath);
        const index = store.annotations.findIndex((item) => item.id === annotationId);
        if (index === -1) {
          sendJson(res, 404, { error: '找不到要更新的标注。' });
          return;
        }

        const existing = store.annotations[index];
        store.annotations[index] = {
          ...existing,
          ...body,
          id: existing.id,
          fileId: body.fileId || path.basename(fullPath),
          filePath: fullPath,
          createdAt: existing.createdAt,
          updatedAt: new Date().toISOString(),
        };
        await writeAnnotations(fullPath, store);
        sendJson(res, 200, { annotation: store.annotations[index] });
        return;
      }

      if (req.method === 'DELETE' && requestUrl.pathname.startsWith('/api/annotations/')) {
        const annotationId = requestUrl.pathname.split('/').pop();
        const fileId = requestUrl.searchParams.get('file') || '';
        const explicitPath = requestUrl.searchParams.get('path') || '';
        const fullPath = await resolveChatFile(fileId, explicitPath);
        if (!fullPath) {
          sendJson(res, 400, { error: '聊天记录文件无效。' });
          return;
        }

        const store = await readAnnotations(fullPath);
        const nextAnnotations = store.annotations.filter((item) => item.id !== annotationId);
        if (nextAnnotations.length === store.annotations.length) {
          sendJson(res, 404, { error: '找不到要删除的标注。' });
          return;
        }

        await writeAnnotations(fullPath, { annotations: nextAnnotations });
        sendJson(res, 200, { ok: true });
        return;
      }

      await serveStatic(req, res);
    } catch (error) {
      sendJson(res, 500, {
        error: '服务内部错误。',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

export function startServer({ host = HOST, port = PORT, logger = console.log } = {}) {
  return new Promise((resolve, reject) => {
    const server = createAppServer();
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      logger(`QQ Chat Annotation Tool listening on http://${host}:${port}`);
      resolve(server);
    });
  });
}

export async function stopServer(server) {
  if (!server) return;
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';

if (import.meta.url === invokedPath) {
  startServer().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
