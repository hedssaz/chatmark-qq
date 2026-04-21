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

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

function getDerivedPaths(chatFilePath) {
  const parsed = path.parse(chatFilePath);
  return {
    annotationsPath: path.join(parsed.dir, `${parsed.name}.annotations.json`),
    progressPath: path.join(parsed.dir, `${parsed.name}.annotation-progress.json`),
  };
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
    return Array.isArray(parsed.annotations) ? parsed : { annotations: [] };
  } catch {
    return { annotations: [] };
  }
}

function buildProgressPayload(chatFilePath, annotations) {
  const messageCounts = {};
  let farthestAnnotatedIndex = null;

  for (const annotation of annotations) {
    const seen = new Set();
    for (const selectedMessage of annotation.selectedMessages || []) {
      const messageIndex = Number(selectedMessage?.messageIndex ?? -1);
      if (messageIndex < 0 || seen.has(messageIndex)) continue;
      seen.add(messageIndex);
      messageCounts[messageIndex] = (messageCounts[messageIndex] || 0) + 1;
      if (farthestAnnotatedIndex === null || messageIndex > farthestAnnotatedIndex) {
        farthestAnnotatedIndex = messageIndex;
      }
    }
  }

  return {
    sourceFile: chatFilePath,
    updatedAt: new Date().toISOString(),
    totalAnnotations: annotations.length,
    farthestAnnotatedIndex,
    messageCounts,
  };
}

async function writeAnnotations(chatFilePath, data) {
  await ensureAnnotationStore(chatFilePath);
  const { annotationsPath, progressPath } = getDerivedPaths(chatFilePath);
  await fs.writeFile(annotationsPath, JSON.stringify(data, null, 2), 'utf8');
  await fs.writeFile(progressPath, JSON.stringify(buildProgressPayload(chatFilePath, data.annotations), null, 2), 'utf8');
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
    if (!isSafeJsonPath(normalized)) return null;
    try {
      const stat = await fs.stat(normalized);
      return stat.isFile() ? normalized : null;
    } catch {
      return null;
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

function normalizeChatExport(chatData, fileId, fullPath) {
  const chatInfo = chatData?.chatInfo || {};
  const messages = Array.isArray(chatData?.messages) ? chatData.messages : [];
  const derivedPaths = getDerivedPaths(fullPath);
  const identity = resolveIdentity(chatData);

  const normalizedMessages = messages.map((message, index) => {
    const senderUid = normalizeText(message?.sender?.uid);
    const senderUin = normalizeText(message?.sender?.uin);
    const senderKey = senderKeyForMessage(message, identity);

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
    };
  });

  return {
    fileId,
    filePath: fullPath,
    annotationPath: derivedPaths.annotationsPath,
    progressPath: derivedPaths.progressPath,
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

function transformDatasetText(text, identity, roleSwap) {
  return `${text ?? ''}`.replace(/\[回复\s+([^:\]：]+)\s*([:：])/g, (_match, target, punctuation) => {
    return `[回复 ${roleTokenForReference(target, identity, roleSwap)}${punctuation}`;
  });
}

function buildDatasetMessagesFromSelectedMessages(selectedMessages, identity, roleSwap) {
  const groups = [];

  for (const rawMessage of selectedMessages || []) {
    const speakerKey = normalizeStoredSpeakerKey(rawMessage, identity);
    const role = roleForSpeakerKey(speakerKey, roleSwap);
    const text = transformDatasetText(`${rawMessage?.text ?? ''}`.trim(), identity, roleSwap);
    if (!role || !text) continue;

    const previous = groups.at(-1);
    if (previous && previous.role === role) {
      previous.lines.push(text);
      continue;
    }

    groups.push({
      role,
      lines: [text],
    });
  }

  return groups.map((group) => ({
    role: group.role,
    content: group.lines.join(' <MSG_SEP> '),
  }));
}

function remapAnnotation(annotation, identity, roleSwap) {
  const selectedMessages = (annotation?.selectedMessages || []).map((message) => {
    const speakerKey = normalizeStoredSpeakerKey(message, identity);
    return {
      ...message,
      speakerKey,
      role: roleForSpeakerKey(speakerKey, roleSwap) || 'other',
    };
  });

  return {
    ...annotation,
    selectedMessages,
    dataset: {
      messages: buildDatasetMessagesFromSelectedMessages(selectedMessages, identity, roleSwap),
    },
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
  const selectedMessages = Array.isArray(body?.selectedMessages) ? body.selectedMessages : [];
  const datasetMessages = Array.isArray(body?.dataset?.messages) ? body.dataset.messages : [];

  return {
    fileId,
    filePath,
    label: typeof body?.label === 'string' ? body.label : '',
    selectedMessages: selectedMessages.map((message) => ({
      messageIndex: Number(message?.messageIndex ?? -1),
      messageId: `${message?.messageId ?? ''}`,
      senderName: `${message?.senderName ?? ''}`,
      senderUid: `${message?.senderUid ?? ''}`,
      senderUin: `${message?.senderUin ?? ''}`,
      speakerKey: ['self', 'peer', 'system', 'other'].includes(message?.speakerKey) ? message.speakerKey : 'other',
      role: normalizeSavedRole(message?.role),
      text: `${message?.text ?? ''}`,
      time: `${message?.time ?? ''}`,
      isSelf: Boolean(message?.isSelf),
    })),
    dataset: {
      messages: datasetMessages.map((message) => ({
        role: message?.role === 'assistant' ? 'assistant' : 'user',
        content: `${message?.content ?? ''}`,
      })),
    },
  };
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
        sendJson(res, 200, normalizeChatExport(chatData, fileId || path.basename(fullPath), fullPath));
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
        const store = await readAnnotations(fullPath);
        store.annotations = store.annotations.map((annotation) => remapAnnotation(annotation, identity, roleSwap));
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
