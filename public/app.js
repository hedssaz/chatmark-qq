const ITEM_GAP = 14;
const OVERSCAN_PX = 1200;

const state = {
  currentFileId: '',
  currentFilePath: '',
  chat: null,
  annotations: [],
  selectedMessageIndices: [],
  selectionAnchorIndex: null,
  editingAnnotationId: null,
  editingVariantIndex: null,
  reviewRows: [],
  annotationSortMode: 'updated-desc',
  exportFormat: 'messages-only',
  exportSystemPrompt: '',
  sidebarWidth: 360,
  contextTraining: null,
  pendingMappingPreview: [],
  sidebarWidth: 360,
  sidebarDragActive: false,
  messageRowRefs: new Map(),
  messageOrderChipRefs: new Map(),
  messageCountChipRefs: new Map(),
  activeLoadToken: null,
  sidebarOpen: false,
  roleSwap: false,
  virtual: {
    heights: [],
    offsets: [0],
    totalHeight: 0,
    rangeStart: 0,
    rangeEnd: -1,
    rafPending: false,
    forcePending: false,
    measurePending: false,
  },
};

const els = {
  appShell: document.querySelector('#app-shell'),
  sidebar: document.querySelector('#sidebar'),
  sidebarResizer: document.querySelector('#sidebar-resizer'),
  sidebarToggle: document.querySelector('#sidebar-toggle'),
  sidebarClose: document.querySelector('#sidebar-close'),
  sidebarBackdrop: document.querySelector('#sidebar-backdrop'),
  pickFile: document.querySelector('#pick-file'),
  openSettings: document.querySelector('#open-settings'),
  downloadStickers: document.querySelector('#download-stickers'),
  saveStickerHost: document.querySelector('#save-sticker-host'),
  extractStickerRkey: document.querySelector('#extract-sticker-rkey'),
  calculateStickerDownloads: document.querySelector('#calculate-sticker-downloads'),
  stickerMinOccurrences: document.querySelector('#sticker-min-occurrences'),
  selectedFileCard: document.querySelector('#selected-file-card'),
  chatMeta: document.querySelector('#chat-meta'),
  stickerSummary: document.querySelector('#sticker-summary'),
  stickerHostInput: document.querySelector('#sticker-host-input'),
  stickerSampleUrl: document.querySelector('#sticker-sample-url'),
  stickerRkeyInput: document.querySelector('#sticker-rkey-input'),
  stickerCandidateSummary: document.querySelector('#sticker-candidate-summary'),
  stickerDownloadProgress: document.querySelector('#sticker-download-progress'),
  stickerDownloadTitle: document.querySelector('#sticker-download-title'),
  stickerDownloadCount: document.querySelector('#sticker-download-count'),
  stickerDownloadFill: document.querySelector('#sticker-download-fill'),
  stickerDownloadText: document.querySelector('#sticker-download-text'),
  toggleRoleSwap: document.querySelector('#toggle-role-swap'),
  applyRoleMapping: document.querySelector('#apply-role-mapping'),
  roleSwapState: document.querySelector('#role-swap-state'),
  clearSelection: document.querySelector('#clear-selection'),
  reviewSelection: document.querySelector('#review-selection'),
  jumpEarliest: document.querySelector('#jump-earliest'),
  selectionEmpty: document.querySelector('#selection-empty'),
  selectionList: document.querySelector('#selection-list'),
  annotationSummary: document.querySelector('#annotation-summary'),
  openAnnotations: document.querySelector('#open-annotations'),
  annotationEmpty: document.querySelector('#annotation-empty'),
  annotationList: document.querySelector('#annotation-list'),
  exportAnnotations: document.querySelector('#export-annotations'),
  annotationSort: document.querySelector('#annotation-sort'),
  exportFormat: document.querySelector('#export-format'),
  exportSystemPrompt: document.querySelector('#export-system-prompt'),
  settingsDialog: document.querySelector('#settings-dialog'),
  closeSettingsDialog: document.querySelector('#close-settings-dialog'),
  mappingPreviewDialog: document.querySelector('#mapping-preview-dialog'),
  closeMappingPreviewDialog: document.querySelector('#close-mapping-preview-dialog'),
  mappingPreviewSummary: document.querySelector('#mapping-preview-summary'),
  mappingPreviewList: document.querySelector('#mapping-preview-list'),
  confirmApplyRoleMapping: document.querySelector('#confirm-apply-role-mapping'),
  chatTitle: document.querySelector('#chat-title'),
  schemaNote: document.querySelector('#schema-note'),
  chatList: document.querySelector('#chat-list'),
  chatScroll: document.querySelector('#chat-scroll'),
  loadingOverlay: document.querySelector('#loading-overlay'),
  loadingTitle: document.querySelector('#loading-title'),
  loadingPercent: document.querySelector('#loading-percent'),
  loadingBarFill: document.querySelector('#loading-bar-fill'),
  loadingText: document.querySelector('#loading-text'),
  reviewDialog: document.querySelector('#review-dialog'),
  dialogTitle: document.querySelector('#dialog-title'),
  closeDialog: document.querySelector('#close-dialog'),
  annotationsDialog: document.querySelector('#annotations-dialog'),
  closeAnnotationsDialog: document.querySelector('#close-annotations-dialog'),
  reviewRows: document.querySelector('#review-rows'),
  jsonPreview: document.querySelector('#json-preview'),
  confirmSave: document.querySelector('#confirm-save'),
  openContextTraining: document.querySelector('#open-context-training'),
  annotationLabel: document.querySelector('#annotation-label'),
  contextTrainingDialog: document.querySelector('#context-training-dialog'),
  closeContextTrainingDialog: document.querySelector('#close-context-training-dialog'),
  contextDialogTitle: document.querySelector('#context-dialog-title'),
  contextSelectionSummary: document.querySelector('#context-selection-summary'),
  contextSourceRows: document.querySelector('#context-source-rows'),
  contextAnnotationLabel: document.querySelector('#context-annotation-label'),
  contextSelectAll: document.querySelector('#context-select-all'),
  contextClearAll: document.querySelector('#context-clear-all'),
  contextAddVariant: document.querySelector('#context-add-variant'),
  contextReplaceVariant: document.querySelector('#context-replace-variant'),
  contextVariantsEmpty: document.querySelector('#context-variants-empty'),
  contextVariantsList: document.querySelector('#context-variants-list'),
  contextSaveGroup: document.querySelector('#context-save-group'),
};

function escapeHtml(value) {
  return `${value ?? ''}`
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function nl2br(value) {
  return escapeHtml(value).replaceAll('\n', '<br>');
}

function normalizeText(value) {
  return `${value ?? ''}`.trim();
}

function normalizeStickerFilename(value) {
  return `${value ?? ''}`.trim().split(/[\\/]/).pop() || '';
}

function stickerPack() {
  return state.chat?.stickerPack || {
    host: 'https://gchat.qpic.cn',
    totalImages: 0,
    uniqueStickers: 0,
    downloadedCount: 0,
    failedCount: 0,
    items: [],
  };
}

function stickerMap() {
  return new Map((stickerPack().items || []).map((item) => [normalizeStickerFilename(item.filename), item]));
}

function parsePositiveInteger(value, fallback = 1) {
  const parsed = Number.parseInt(`${value ?? ''}`, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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

function parseSampleUrl(value) {
  const raw = `${value ?? ''}`.trim();
  if (!raw) return { host: '', rkey: '' };
  try {
    const url = new URL(raw);
    return {
      host: `${url.protocol}//${url.host}`,
      rkey: url.searchParams.get('rkey') || '',
    };
  } catch {
    return { host: '', rkey: extractRkey(raw) };
  }
}

function currentStickerRkey() {
  const direct = extractRkey(els.stickerRkeyInput?.value || '');
  if (direct) return direct;
  return parseSampleUrl(els.stickerSampleUrl?.value || '').rkey || '';
}

function inferRowStickers(row) {
  if (Array.isArray(row?.stickers) && row.stickers.length) {
    return row.stickers
      .map((item) => ({
        id: Number(item?.id || item?.stickerId) || 0,
        filename: normalizeStickerFilename(item?.filename),
      }))
      .filter((item) => item.id > 0 && item.filename);
  }

  const map = stickerMap();
  return [...`${row?.text ?? ''}`.matchAll(/\[图片:\s*([^\]]+)\]/g)]
    .map((match) => normalizeStickerFilename(match[1]))
    .map((filename) => {
      const item = map.get(filename);
      return item ? { id: Number(item.id) || 0, filename } : null;
    })
    .filter(Boolean);
}

function isPureStickerText(text, stickers) {
  if (!stickers.length) return false;
  const normalized = `${text ?? ''}`.trim();
  if (!normalized) return false;
  const withoutPlaceholders = normalized.replace(/\[图片:\s*[^\]]+\]/g, '').replace(/\s+/g, '');
  return withoutPlaceholders.length === 0;
}

function pauseForFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function isCompactLayout() {
  return window.innerWidth <= 1100;
}

function applySidebarState() {
  const open = !isCompactLayout() || state.sidebarOpen;
  els.appShell.classList.toggle('sidebar-open', open);
  els.sidebarBackdrop.hidden = !(isCompactLayout() && state.sidebarOpen);
  els.sidebarToggle.setAttribute('aria-expanded', String(open));
}

function openSidebar() {
  state.sidebarOpen = true;
  applySidebarState();
}

function closeSidebar() {
  if (!isCompactLayout()) return;
  state.sidebarOpen = false;
  applySidebarState();
}

function syncResponsiveLayout() {
  if (!isCompactLayout()) {
    state.sidebarOpen = true;
  }
  applySidebarState();
  scheduleVirtualRender(true);
}

function setLoadingState({ visible, percent = 0, title = '正在加载聊天记录', text = '正在准备数据...' }) {
  els.loadingOverlay.hidden = !visible;
  els.loadingTitle.textContent = title;
  els.loadingPercent.textContent = `${Math.max(0, Math.min(100, Math.round(percent)))}%`;
  els.loadingBarFill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  els.loadingText.textContent = text;
}

function hideLoading() {
  setLoadingState({ visible: false });
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const raw = await response.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    throw new Error(data?.error || raw || `请求失败（HTTP ${response.status}）`);
  }
  if (data === null) {
    throw new Error(`接口返回了非 JSON 内容（HTTP ${response.status}）`);
  }
  return data;
}

function selectionOrderMap() {
  return new Map(state.selectedMessageIndices.map((messageIndex, index) => [messageIndex, index + 1]));
}

function annotationVariants(annotation) {
  if (Array.isArray(annotation?.variants) && annotation.variants.length) {
    return annotation.variants;
  }
  return [{
    id: annotation?.id || crypto.randomUUID(),
    label: annotation?.label || '',
    selectedMessages: Array.isArray(annotation?.selectedMessages) ? annotation.selectedMessages : [],
    dataset: annotation?.dataset || { messages: [] },
    locate: annotation?.locate || null,
  }];
}

function messageIndicesForAnnotation(annotation, { countMode = false } = {}) {
  const indices = new Set();
  const sources = annotation?.kind === 'context-expansion'
    ? annotationVariants(annotation).flatMap((variant) => variant.selectedMessages || [])
    : (annotation?.selectedMessages || []);

  for (const message of sources) {
    const index = Number(message?.messageIndex ?? -1);
    if (index >= 0) {
      indices.add(index);
    }
  }

  if (!countMode && annotation?.locate?.messageIndices?.length) {
    for (const index of annotation.locate.messageIndices) {
      if (Number.isFinite(index) && index >= 0) {
        indices.add(index);
      }
    }
  }

  return [...indices].sort((a, b) => a - b);
}

function annotationCountMap() {
  const counts = new Map();
  for (const annotation of state.annotations) {
    const seen = new Set(messageIndicesForAnnotation(annotation, { countMode: true }));
    for (const messageIndex of seen) {
      counts.set(messageIndex, (counts.get(messageIndex) || 0) + 1);
    }
  }
  return counts;
}

function primaryVariantForAnnotation(annotation) {
  return annotationVariants(annotation)[0] || {
    selectedMessages: [],
    dataset: { messages: [] },
    locate: annotation?.locate || null,
  };
}

function annotationLocateIndex(annotation) {
  const locate = annotation?.locate || primaryVariantForAnnotation(annotation)?.locate || {};
  const fromLocate = Number(locate?.firstMessageIndex ?? -1);
  if (fromLocate >= 0) return fromLocate;
  return messageIndicesForAnnotation(annotation)[0] ?? -1;
}

function firstSourceTimestamp(annotation) {
  const first = primaryVariantForAnnotation(annotation)?.selectedMessages?.[0];
  return Date.parse(first?.time || '') || 0;
}

function sortedAnnotations() {
  const annotations = [...state.annotations];
  const mode = state.annotationSortMode || 'updated-desc';
  annotations.sort((a, b) => {
    if (mode === 'updated-asc') {
      return Date.parse(a.updatedAt || a.createdAt || 0) - Date.parse(b.updatedAt || b.createdAt || 0);
    }
    if (mode === 'source-asc') {
      return firstSourceTimestamp(a) - firstSourceTimestamp(b);
    }
    if (mode === 'source-desc') {
      return firstSourceTimestamp(b) - firstSourceTimestamp(a);
    }
    return Date.parse(b.updatedAt || b.createdAt || 0) - Date.parse(a.updatedAt || a.createdAt || 0);
  });
  return annotations;
}

function chatIdentity() {
  return state.chat?.identity || {
    self: { uid: '', uin: '', name: '', displayName: '我' },
    peer: { uid: '', uin: '', nickname: '', remark: '', displayName: '对方' },
  };
}

function roleForSpeakerKey(speakerKey) {
  if (speakerKey === 'self') {
    return state.roleSwap ? 'assistant' : 'user';
  }
  if (speakerKey === 'peer') {
    return state.roleSwap ? 'user' : 'assistant';
  }
  return null;
}

function roleBadgeText(speakerKey) {
  const role = roleForSpeakerKey(speakerKey);
  if (role === 'user') return 'user';
  if (role === 'assistant') return 'assistant';
  return 'other';
}

function inferSpeakerName(message) {
  if (!state.chat) return normalizeText(message?.senderName) || '未知';
  if (message?.senderKey === 'self') return chatIdentity().self.displayName;
  if (message?.senderKey === 'peer') return chatIdentity().peer.displayName;
  return normalizeText(message?.senderName) || normalizeText(message?.rawSenderName) || 'system';
}

function bubbleClassForMessage(message) {
  if (message?.senderKey === 'self') {
    return 'outgoing';
  }
  if (message?.senderKey === 'peer') {
    return 'incoming';
  }
  return 'system';
}

function renderStickerGalleryHtml(stickers) {
  if (!stickers.length) return '';
  return `
    <div class="msg-sticker-gallery">
      ${stickers
        .map((sticker) => {
          const filename = escapeHtml(sticker.filename || '未命名图片');
          if (sticker.previewUrl) {
            return `
              <figure class="msg-sticker-item">
                <img class="msg-sticker-img" src="${escapeHtml(sticker.previewUrl)}" alt="${filename}" loading="lazy" />
                <figcaption class="msg-sticker-caption">图片/表情包#${escapeHtml(sticker.id || '?')} · ${filename}</figcaption>
              </figure>
            `;
          }

          const failed = sticker.downloadError ? ' failed' : '';
          return `
            <div class="msg-sticker-fallback${failed}">
              <strong>图片/表情包#${escapeHtml(sticker.id || '?')}</strong>
              <span>${filename}</span>
            </div>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderMessageBodyHtml(message) {
  const stickers = Array.isArray(message?.stickers) ? message.stickers : [];
  const pureSticker = isPureStickerText(message?.text, stickers);
  const textHtml = !pureSticker && `${message?.text ?? ''}`.trim()
    ? `<div class="msg-content">${nl2br(message.text)}</div>`
    : '';
  const stickerHtml = renderStickerGalleryHtml(stickers);

  if (textHtml || stickerHtml) {
    return `${textHtml}${stickerHtml}`;
  }

  return '<div class="msg-content">[空消息]</div>';
}

function estimateMessageHeight(message) {
  const text = `${message.text || ''}`;
  const explicitLines = Math.max(1, text.split('\n').length);
  const wrappedLines = Math.max(explicitLines, Math.ceil(text.length / 26) || 1);
  const stickerCount = Array.isArray(message?.stickers) ? message.stickers.length : 0;
  const base = message.senderKey === 'other' || message.senderKey === 'system' ? 82 : 106;
  const extra = Math.min(320, Math.max(0, wrappedLines - 1) * 20);
  const stickerExtra = stickerCount > 0 ? Math.min(360, stickerCount * 156) : 0;
  return base + extra + stickerExtra + ITEM_GAP;
}

function initializeVirtualState() {
  const messages = state.chat?.messages || [];
  state.virtual.heights = messages.map(estimateMessageHeight);
  state.virtual.offsets = new Array(messages.length + 1);
  state.virtual.offsets[0] = 0;
  for (let index = 0; index < messages.length; index += 1) {
    state.virtual.offsets[index + 1] = state.virtual.offsets[index] + state.virtual.heights[index];
  }
  state.virtual.totalHeight = state.virtual.offsets[messages.length] || 0;
  state.virtual.rangeStart = 0;
  state.virtual.rangeEnd = -1;
  state.virtual.rafPending = false;
  state.virtual.forcePending = false;
  state.virtual.measurePending = false;
}

function recomputeOffsetsFrom(startIndex = 0) {
  const { heights, offsets } = state.virtual;
  if (!heights.length) {
    state.virtual.offsets = [0];
    state.virtual.totalHeight = 0;
    return;
  }

  const begin = Math.max(0, Math.min(startIndex, heights.length - 1));
  if (begin === 0) {
    offsets[0] = 0;
  }
  for (let index = begin; index < heights.length; index += 1) {
    offsets[index + 1] = offsets[index] + heights[index];
  }
  state.virtual.totalHeight = offsets[heights.length];
}

function findIndexForOffset(offset) {
  const { offsets, heights } = state.virtual;
  if (!heights.length) return 0;

  const boundedOffset = Math.max(0, Math.min(offset, state.virtual.totalHeight));
  let low = 0;
  let high = offsets.length - 1;

  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    if (offsets[mid] <= boundedOffset) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return Math.min(heights.length - 1, low);
}

function createSpacer(height) {
  const spacer = document.createElement('li');
  spacer.className = 'virtual-spacer';
  spacer.style.height = `${Math.max(0, height)}px`;
  return spacer;
}

function createMessageRow(message, count = 0, order = 0) {
  const row = document.createElement('li');
  row.className = `msg-row ${bubbleClassForMessage(message)}`;
  row.dataset.index = `${message.index}`;

  for (let level = 1; level <= 4; level += 1) {
    row.classList.toggle(`count-level-${level}`, Math.min(count, 4) === level);
  }
  row.classList.toggle('selected', order > 0);

  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'msg-card';
  card.dataset.index = `${message.index}`;
  card.innerHTML = `
    <div class="msg-topline">
      <span class="msg-sender">${escapeHtml(inferSpeakerName(message))}</span>
      <span class="msg-time">${escapeHtml(message.time || '')}</span>
    </div>
    ${renderMessageBodyHtml(message)}
  `;

  const side = document.createElement('div');
  side.className = 'msg-side';

  const countChip = document.createElement('span');
  countChip.className = `count-chip${count > 0 ? ' has-count' : ''}`;
  countChip.dataset.countChip = `${message.index}`;
  countChip.textContent = `${count} 次`;

  const orderChip = document.createElement('span');
  orderChip.className = 'order-chip';
  orderChip.dataset.orderChip = `${message.index}`;
  orderChip.textContent = order > 0 ? `#${order}` : '';

  side.append(countChip, orderChip);
  row.append(card, side);

  state.messageRowRefs.set(message.index, row);
  state.messageCountChipRefs.set(message.index, countChip);
  state.messageOrderChipRefs.set(message.index, orderChip);

  return row;
}

function scheduleMeasureRenderedRows() {
  if (state.virtual.measurePending) return;
  state.virtual.measurePending = true;

  requestAnimationFrame(() => {
    state.virtual.measurePending = false;

    let minChangedIndex = Number.POSITIVE_INFINITY;
    for (const [index, row] of state.messageRowRefs.entries()) {
      const measuredHeight = Math.ceil(row.getBoundingClientRect().height + ITEM_GAP);
      if (Math.abs(measuredHeight - state.virtual.heights[index]) > 2) {
        state.virtual.heights[index] = measuredHeight;
        minChangedIndex = Math.min(minChangedIndex, index);
      }
    }

    if (Number.isFinite(minChangedIndex)) {
      recomputeOffsetsFrom(minChangedIndex);
      renderVirtualWindow(true);
    }
  });
}

function renderVirtualWindow(force = false) {
  const messages = state.chat?.messages || [];
  if (!messages.length) {
    els.chatList.innerHTML = '<li class="placeholder-card">没有可显示的聊天记录。</li>';
    state.messageRowRefs = new Map();
    state.messageOrderChipRefs = new Map();
    state.messageCountChipRefs = new Map();
    return;
  }

  const viewportTop = els.chatScroll.scrollTop;
  const viewportBottom = viewportTop + els.chatScroll.clientHeight;
  const start = Math.max(0, findIndexForOffset(viewportTop - OVERSCAN_PX));
  const end = Math.min(messages.length - 1, findIndexForOffset(viewportBottom + OVERSCAN_PX));

  if (!force && start === state.virtual.rangeStart && end === state.virtual.rangeEnd) {
    return;
  }

  state.virtual.rangeStart = start;
  state.virtual.rangeEnd = end;
  state.messageRowRefs = new Map();
  state.messageOrderChipRefs = new Map();
  state.messageCountChipRefs = new Map();

  const counts = annotationCountMap();
  const orders = selectionOrderMap();
  const topHeight = state.virtual.offsets[start] || 0;
  const bottomHeight = state.virtual.totalHeight - (state.virtual.offsets[end + 1] || 0);
  const fragment = document.createDocumentFragment();

  if (topHeight > 0) {
    fragment.appendChild(createSpacer(topHeight));
  }

  for (let index = start; index <= end; index += 1) {
    fragment.appendChild(createMessageRow(messages[index], counts.get(index) || 0, orders.get(index) || 0));
  }

  if (bottomHeight > 0) {
    fragment.appendChild(createSpacer(bottomHeight));
  }

  els.chatList.replaceChildren(fragment);
  scheduleMeasureRenderedRows();
}

function scheduleVirtualRender(force = false) {
  state.virtual.forcePending = state.virtual.forcePending || force;
  if (state.virtual.rafPending) return;

  state.virtual.rafPending = true;
  requestAnimationFrame(() => {
    const shouldForce = state.virtual.forcePending;
    state.virtual.rafPending = false;
    state.virtual.forcePending = false;
    renderVirtualWindow(shouldForce);
  });
}

function renderSelectedFileCard() {
  if (!state.currentFilePath) {
    els.selectedFileCard.textContent = '还没有选中文件。';
    return;
  }

  const normalizedPath = state.currentFilePath.replaceAll('\\', '/');
  const fileName = normalizedPath.split('/').pop() || state.currentFilePath;
  els.selectedFileCard.innerHTML = `
    <strong>当前文件：${escapeHtml(fileName)}</strong>
    <p class="selected-file-path">${escapeHtml(state.currentFilePath)}</p>
  `;
}

function renderSwapStates() {
  els.roleSwapState.textContent = state.roleSwap ? '反向' : '正向';
}

function inferStoredSpeakerKey(message) {
  if (['self', 'peer', 'system', 'other'].includes(message?.speakerKey)) {
    return message.speakerKey;
  }

  const identity = chatIdentity();
  const senderUid = normalizeText(message?.senderUid);
  const senderName = normalizeText(message?.senderName);

  if (senderUid && senderUid === identity.self.uid) return 'self';
  if (senderUid && senderUid === identity.peer.uid) return 'peer';
  if (message?.isSelf) return 'self';

  const peerTokens = new Set([
    normalizeText(identity.peer.uid),
    normalizeText(identity.peer.uin),
    normalizeText(identity.peer.nickname),
    normalizeText(identity.peer.remark),
    normalizeText(identity.peer.displayName),
  ]);
  if (senderName && peerTokens.has(senderName)) return 'peer';

  const selfTokens = new Set([
    normalizeText(identity.self.uid),
    normalizeText(identity.self.uin),
    normalizeText(identity.self.name),
    normalizeText(identity.self.displayName),
  ]);
  if (senderName && selfTokens.has(senderName)) return 'self';

  return 'other';
}

function buildReviewRowsFromSelection() {
  const chatMessages = state.chat?.messages || [];
  return state.selectedMessageIndices
    .map((messageIndex) => chatMessages[messageIndex])
    .filter(Boolean)
    .map((message) => ({
      messageIndex: message.index,
      messageId: message.id,
      senderName: inferSpeakerName(message),
      senderUid: message.senderUid,
      senderUin: message.senderUin,
      stickers: Array.isArray(message.stickers)
        ? message.stickers.map((sticker) => ({
            id: Number(sticker?.id) || 0,
            filename: normalizeStickerFilename(sticker?.filename),
          }))
        : [],
      speakerKey: message.senderKey,
      role: roleForSpeakerKey(message.senderKey) || 'other',
      text: message.text,
      time: message.time,
      isSelf: message.senderKey === 'self',
    }));
}

function roleTokenForReference(token) {
  const identity = chatIdentity();
  const normalized = normalizeText(token);
  if (!normalized) return token;

  const selfTokens = new Set([
    normalizeText(identity.self.uid),
    normalizeText(identity.self.uin),
    normalizeText(identity.self.name),
    normalizeText(identity.self.displayName),
  ]);

  const peerTokens = new Set([
    normalizeText(identity.peer.uid),
    normalizeText(identity.peer.uin),
    normalizeText(identity.peer.nickname),
    normalizeText(identity.peer.remark),
    normalizeText(identity.peer.displayName),
  ]);

  if (selfTokens.has(normalized)) {
    return roleForSpeakerKey('self') || normalized;
  }
  if (peerTokens.has(normalized)) {
    return roleForSpeakerKey('peer') || normalized;
  }
  return normalized;
}

function transformTextForDataset(text, stickers = []) {
  const localStickerMap = new Map(stickers.map((item) => [normalizeStickerFilename(item?.filename), Number(item?.id || item?.stickerId) || 0]));
  return `${text ?? ''}`
    .replace(/\[回复\s+([^:\]：]+)\s*([:：])/g, (_match, target, punctuation) => {
      return `[回复 ${roleTokenForReference(target)}${punctuation}`;
    })
    .replace(/\[图片:\s*([^\]]+)\]/g, (_match, filename) => {
      const stickerId = localStickerMap.get(normalizeStickerFilename(filename));
      return stickerId ? `<sticker${stickerId},1times>` : `[图片: ${normalizeStickerFilename(filename)}]`;
    });
}

function datasetSegmentsForRow(row) {
  const stickers = inferRowStickers(row);
  const text = `${row?.text ?? ''}`.trim();
  if (isPureStickerText(text, stickers)) {
    return stickers.map((item) => ({ kind: 'sticker', stickerId: item.id }));
  }

  const transformedText = transformTextForDataset(text, stickers);
  if (!transformedText) return [];
  return [{ kind: 'text', content: transformedText }];
}

function buildDatasetMessages(rows) {
  const groups = [];

  for (const row of rows) {
    const role = roleForSpeakerKey(row.speakerKey);
    const segments = datasetSegmentsForRow(row);
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

function datasetForAnnotation(annotation) {
  const primary = primaryVariantForAnnotation(annotation);
  if (Array.isArray(primary?.selectedMessages) && primary.selectedMessages.length > 0) {
    return { messages: buildDatasetMessages(primary.selectedMessages) };
  }
  return annotation?.dataset || { messages: [] };
}

function savedDatasetForAnnotation(annotation) {
  return primaryVariantForAnnotation(annotation)?.dataset || annotation?.dataset || { messages: [] };
}

function exportableDatasetMessages(annotation) {
  const dataset = datasetForAnnotation(annotation);
  const messages = Array.isArray(dataset?.messages) ? dataset.messages.map((item) => ({ ...item })) : [];
  const prompt = normalizeText(state.exportSystemPrompt);
  if (state.exportFormat === 'messages-only' && prompt) {
    return [{ role: 'system', content: prompt }, ...messages];
  }
  return messages;
}

function exportableAnnotation(annotation) {
  if (state.exportFormat === 'messages-only') {
    return { messages: exportableDatasetMessages(annotation) };
  }

  return {
    ...annotation,
    dataset: { messages: exportableDatasetMessages(annotation) },
  };
}

function refreshJsonPreview() {
  const dataset = { messages: buildDatasetMessages(state.reviewRows) };
  els.jsonPreview.textContent = JSON.stringify(dataset, null, 2);
}

function renderReviewRows() {
  if (!state.reviewRows.length) {
    els.reviewRows.innerHTML = '<div class="placeholder-card">没有可提交的消息。</div>';
    refreshJsonPreview();
    return;
  }

  els.reviewRows.innerHTML = state.reviewRows
    .map((row, index) => {
      const role = roleBadgeText(row.speakerKey);
      return `
        <article class="review-row" data-review-index="${index}">
          <div class="review-row-header">
            <span class="review-badge ${role}">${role}</span>
            <span class="muted">${escapeHtml(row.senderName)} · ${escapeHtml(row.time || '')}</span>
          </div>
          <textarea class="review-textarea" data-action="edit-text" data-review-index="${index}">${escapeHtml(row.text)}</textarea>
          <div class="review-actions">
            <button type="button" class="ghost-btn" data-action="move-up" data-review-index="${index}">上移</button>
            <button type="button" class="ghost-btn" data-action="move-down" data-review-index="${index}">下移</button>
            <button type="button" class="ghost-btn danger" data-action="remove" data-review-index="${index}">移除</button>
          </div>
        </article>
      `;
    })
    .join('');

  refreshJsonPreview();
}

function openReviewDialog({ editingAnnotation = null } = {}) {
  state.editingAnnotationId = editingAnnotation?.id || null;
  state.reviewRows = editingAnnotation
    ? editingAnnotation.selectedMessages.map((message) => ({
        messageIndex: Number(message?.messageIndex ?? -1),
        messageId: `${message?.messageId ?? ''}`,
        senderName: `${message?.senderName ?? ''}` || inferSpeakerName(message),
        senderUid: `${message?.senderUid ?? ''}`,
        senderUin: `${message?.senderUin ?? ''}`,
        stickers: Array.isArray(message?.stickers)
          ? message.stickers.map((sticker) => ({
              id: Number(sticker?.id || sticker?.stickerId) || 0,
              filename: normalizeStickerFilename(sticker?.filename),
            }))
          : inferRowStickers(message),
        speakerKey: inferStoredSpeakerKey(message),
        role: roleForSpeakerKey(inferStoredSpeakerKey(message)) || 'other',
        text: `${message?.text ?? ''}`,
        time: `${message?.time ?? ''}`,
        isSelf: Boolean(message?.isSelf),
      }))
    : buildReviewRowsFromSelection();

  els.dialogTitle.textContent = state.editingAnnotationId ? '编辑标注' : '标注预览';
  els.annotationLabel.value = editingAnnotation?.label || '';
  renderReviewRows();
  els.reviewDialog.showModal();
}

function closeReviewDialog() {
  state.reviewRows = [];
  state.editingAnnotationId = null;
  els.reviewDialog.close();
}

function openSettingsDialog() {
  renderStickerSummary();
  renderSwapStates();
  closeSidebar();
  els.settingsDialog.showModal();
}

function closeSettingsDialog() {
  els.settingsDialog.close();
}

function overrideRenderChatMeta() {
  const chat = state.chat;
  if (!chat) {
    els.chatMeta.innerHTML = '';
    return;
  }

  const identity = chatIdentity();
  const totalMessages = chat.statistics?.totalMessages ?? chat.messages.length;
  const pathBlock = `
    <details class="path-details">
      <summary>文件路径</summary>
      <div class="path-detail-list">
        <div><strong>源文件：</strong>${escapeHtml(chat.filePath || '')}</div>
        <div><strong>标注文件：</strong>${escapeHtml(chat.annotationPath || '')}</div>
        <div><strong>进度文件：</strong>${escapeHtml(chat.progressPath || '')}</div>
      </div>
    </details>
  `;

  els.chatMeta.innerHTML = `
    <div class="meta-pill">聊天对象备注：${escapeHtml(identity.peer.remark || '未命名')}</div>
    <div class="meta-pill">聊天类型：${escapeHtml(chat.chatInfo?.type || 'unknown')}</div>
    <div class="meta-pill">我：uid=${escapeHtml(identity.self.uid || '未识别')}</div>
    <div class="meta-pill">我：qq=${escapeHtml(identity.self.uin || '未识别')}</div>
    <div class="meta-pill">我：昵称=${escapeHtml(identity.self.name || '未识别')}</div>
    <div class="meta-pill">对方：uid=${escapeHtml(identity.peer.uid || '未识别')}</div>
    <div class="meta-pill">对方：qq=${escapeHtml(identity.peer.uin || '未识别')}</div>
    <div class="meta-pill">对方：昵称=${escapeHtml(identity.peer.nickname || identity.peer.displayName || '未识别')}</div>
    <div class="meta-pill">消息总数：${escapeHtml(totalMessages)}</div>
    ${pathBlock}
  `;
}

function renderStickerSummary() {
  if (!state.chat) {
    els.stickerSummary.innerHTML = '载入聊天后会统计图片数量，并把下载和映射状态显示在这里。';
    els.downloadStickers.disabled = true;
    if (els.saveStickerHost) els.saveStickerHost.disabled = true;
    if (els.stickerHostInput) els.stickerHostInput.value = '';
    if (els.stickerMinOccurrences) els.stickerMinOccurrences.value = '1';
    if (els.stickerCandidateSummary) els.stickerCandidateSummary.textContent = '当前还没计算待下载数量。';
    setStickerDownloadProgress({ visible: false });
    return;
  }

  const pack = stickerPack();
  els.downloadStickers.disabled = false;
  if (els.saveStickerHost) els.saveStickerHost.disabled = false;
  if (els.stickerHostInput) els.stickerHostInput.value = pack.host || 'https://gchat.qpic.cn';
  els.stickerSummary.innerHTML = `
    <strong>共 ${pack.totalImages || 0} 条图片消息 / ${pack.uniqueStickers || 0} 个唯一表情包</strong>
    <p class="annotation-preview">当前前缀：${escapeHtml(pack.host || 'https://gchat.qpic.cn')}</p>
    <p class="annotation-preview">已下载 ${pack.downloadedCount || 0} 个，失败 ${pack.failedCount || 0} 个。</p>
    <p class="annotation-preview">提示：需要先在 QQ 里自己发一个表情包，提取图链里的 rkey 再批量下载。</p>
    <p class="annotation-preview">配置文件：${escapeHtml(state.chat.stickerConfigPath || '')}</p>
    <p class="annotation-preview">下载目录：${escapeHtml(state.chat.stickerDir || '')}</p>
  `;
}

function setStickerDownloadProgress({ visible, current = 0, total = 0, success = 0, failed = 0, skipped = 0, text = '还没有开始下载。', title = '下载进度' }) {
  els.stickerDownloadProgress.hidden = !visible;
  els.stickerDownloadTitle.textContent = title;
  els.stickerDownloadCount.textContent = `${current} / ${total}`;
  const percent = total > 0 ? (current / total) * 100 : 0;
  els.stickerDownloadFill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  els.stickerDownloadText.textContent = `${text} 成功 ${success}，失败 ${failed}，跳过 ${skipped}。`;
}

function calculateStickerCandidates() {
  const minOccurrences = parsePositiveInteger(els.stickerMinOccurrences?.value, 1);
  const candidates = (stickerPack().items || []).filter((item) => Number(item.occurrences || 0) >= minOccurrences);
  if (!els.stickerCandidateSummary) return candidates;

  els.stickerCandidateSummary.textContent = `当前阈值会处理 ${candidates.length} 个表情包，阈值为至少出现 ${minOccurrences} 次。`;
  return candidates;
}

function renderSchemaNote() {
  if (!state.chat) {
    els.schemaNote.innerHTML = '';
    return;
  }

  const fields = state.chat.schema.topLevelFields.join(' / ');
  els.schemaNote.innerHTML = `
    <span class="meta-pill">顶层字段：${escapeHtml(fields)}</span>
    <span class="meta-pill">默认角色：我=user，对方=assistant</span>
  `;
}

function renderSelectionList() {
  const chatMessages = state.chat?.messages || [];
  const selectedMessages = state.selectedMessageIndices.map((index) => chatMessages[index]).filter(Boolean);

  els.selectionEmpty.hidden = selectedMessages.length > 0;
  els.selectionList.innerHTML = selectedMessages
    .map((message, index) => {
      const role = roleBadgeText(message.senderKey);
      return `
        <li class="selection-item">
          <span class="selection-index">${index + 1}</span>
          <div>
            <strong>${escapeHtml(inferSpeakerName(message))}</strong>
            <p>${escapeHtml(message.text || '[空消息]')}</p>
            <span class="muted">role=${escapeHtml(role)}</span>
          </div>
        </li>
      `;
    })
    .join('');
}

function annotationSummary(annotation) {
  const preview = datasetForAnnotation(annotation)?.messages?.map((item) => item.content).join(' | ') || '';
  return preview.length > 90 ? `${preview.slice(0, 90)}...` : preview;
}

function overrideRenderAnnotationSummary() {
  if (!state.annotations.length) {
    els.annotationSummary.innerHTML = '当前文件还没有任何标注。';
    return;
  }

  const latest = state.annotations[state.annotations.length - 1];
  els.annotationSummary.innerHTML = `
    <strong>共 ${state.annotations.length} 条标注</strong>
    <p class="annotation-preview">最近一条：${escapeHtml(annotationSummary(latest))}</p>
  `;
}

function overrideRenderAnnotationList() {
  els.annotationEmpty.hidden = state.annotations.length > 0;
  els.annotationList.innerHTML = state.annotations
    .map((annotation) => {
      const dataset = datasetForAnnotation(annotation);
      return `
        <article class="annotation-card" data-annotation-id="${annotation.id}">
          <div class="annotation-card-header">
            <div>
              <strong>${escapeHtml(annotation.label || '未命名标注')}</strong>
              <p class="muted">${new Date(annotation.updatedAt).toLocaleString('zh-CN')}</p>
            </div>
            <div class="annotation-chip">${annotation.selectedMessages.length} 条原消息</div>
          </div>
          <p class="annotation-preview">${escapeHtml(annotationSummary(annotation))}</p>
          <div class="annotation-actions">
            <button type="button" class="ghost-btn" data-action="locate-annotation" data-annotation-id="${annotation.id}">定位</button>
            <button type="button" class="ghost-btn" data-action="edit-annotation" data-annotation-id="${annotation.id}">编辑</button>
            <button type="button" class="ghost-btn danger" data-action="delete-annotation" data-annotation-id="${annotation.id}">删除</button>
          </div>
        </article>
      `;
    })
    .join('');
}

function updateSelectionDecorationForIndex(index, order) {
  const row = state.messageRowRefs.get(index);
  if (!row) return;

  row.classList.toggle('selected', order > 0);
  const orderChip = state.messageOrderChipRefs.get(index);
  if (orderChip) {
    orderChip.textContent = order > 0 ? `#${order}` : '';
  }
}

function refreshSelectionDecorations(previousOrders = new Map()) {
  const nextOrders = selectionOrderMap();
  const affected = new Set([...previousOrders.keys(), ...nextOrders.keys()]);
  for (const index of affected) {
    updateSelectionDecorationForIndex(index, nextOrders.get(index) || 0);
  }
}

function overrideRefreshMessageDecorations() {
  const counts = annotationCountMap();
  const orders = selectionOrderMap();

  for (const [index, row] of state.messageRowRefs.entries()) {
    const count = counts.get(index) || 0;
    const order = orders.get(index) || 0;

    row.classList.toggle('selected', order > 0);
    for (let level = 1; level <= 4; level += 1) {
      row.classList.toggle(`count-level-${level}`, Math.min(count, 4) === level);
    }

    const countChip = state.messageCountChipRefs.get(index);
    if (countChip) {
      countChip.textContent = `${count} 次`;
      countChip.classList.toggle('has-count', count > 0);
    }

    const orderChip = state.messageOrderChipRefs.get(index);
    if (orderChip) {
      orderChip.textContent = order > 0 ? `#${order}` : '';
    }
  }
}

async function renderChat(loadToken) {
  const chat = state.chat;
  if (!chat) {
    els.chatList.innerHTML = '<li class="placeholder-card">没有可显示的聊天记录。</li>';
    return;
  }

  state.messageRowRefs = new Map();
  state.messageOrderChipRefs = new Map();
  state.messageCountChipRefs = new Map();
  els.chatTitle.textContent = chatIdentity().peer.displayName || state.currentFileId || '未命名聊天';
  els.chatScroll.scrollTop = 0;

  setLoadingState({
    visible: true,
    percent: 52,
    text: `正在计算首屏布局，共 ${chat.messages.length} 条消息`,
  });
  initializeVirtualState();
  await pauseForFrame();

  if (state.activeLoadToken !== loadToken) return;

  setLoadingState({
    visible: true,
    percent: 82,
    text: '正在渲染首屏消息...',
  });
  renderVirtualWindow(true);
  await pauseForFrame();
}

async function loadChat(fileId = '') {
  const query = state.currentFilePath
    ? `path=${encodeURIComponent(state.currentFilePath)}`
    : `file=${encodeURIComponent(fileId)}`;

  if (!query) return;

  const loadToken = Symbol('chat-load');
  state.activeLoadToken = loadToken;

  if (fileId) state.currentFileId = fileId;
  state.selectedMessageIndices = [];
  state.roleSwap = false;
  renderSwapStates();

  setLoadingState({
    visible: true,
    percent: 8,
    text: '正在读取聊天和标注文件...',
  });

  try {
    const [chat, annotationsPayload] = await Promise.all([
      fetchJson(`/api/chat?${query}`),
      fetchJson(`/api/annotations?${query}`),
    ]);

    if (state.activeLoadToken !== loadToken) return;

    setLoadingState({
      visible: true,
      percent: 28,
      text: '正在分析身份与元数据...',
    });

    state.chat = chat;
    state.currentFileId = chat.fileId || state.currentFileId;
    state.currentFilePath = chat.filePath || state.currentFilePath;
    state.annotations = annotationsPayload.annotations;
    localStorage.setItem('qq-annotator:last-file-path', state.currentFilePath);

    renderSelectedFileCard();
    renderChatMeta();
    renderStickerSummary();
    renderSchemaNote();
    renderSelectionList();
    renderAnnotationSummary();
    renderAnnotationList();

    await renderChat(loadToken);
    if (state.activeLoadToken !== loadToken) return;

    setLoadingState({
      visible: true,
      percent: 100,
      text: `加载完成，共 ${state.chat?.messages?.length || 0} 条消息`,
    });
    await pauseForFrame();
    hideLoading();
  } catch (error) {
    if (state.activeLoadToken === loadToken) {
      hideLoading();
    }
    throw error;
  }
}

async function refreshChatAfterStickerDownload() {
  if (!state.currentFilePath && !state.currentFileId) return;
  const query = state.currentFilePath
    ? `path=${encodeURIComponent(state.currentFilePath)}`
    : `file=${encodeURIComponent(state.currentFileId)}`;
  const currentScrollTop = els.chatScroll.scrollTop;
  const chat = await fetchJson(`/api/chat?${query}`);
  state.chat = chat;
  state.currentFileId = chat.fileId || state.currentFileId;
  state.currentFilePath = chat.filePath || state.currentFilePath;
  renderSelectedFileCard();
  renderChatMeta();
  renderStickerSummary();
  renderSchemaNote();
  initializeVirtualState();
  renderVirtualWindow(true);
  els.chatScroll.scrollTop = currentScrollTop;
  scheduleVirtualRender(true);
}

async function saveStickerHostSetting() {
  if (!state.currentFilePath && !state.currentFileId) {
    alert('请先选择一个聊天文件。');
    return;
  }

  const nextHost = els.stickerHostInput.value.trim();
  const originalText = els.saveStickerHost.textContent;
  els.saveStickerHost.disabled = true;
  els.saveStickerHost.textContent = '保存中...';

  try {
    const result = await fetchJson('/api/stickers/settings', {
      method: 'POST',
      body: JSON.stringify({
        fileId: state.currentFileId,
        filePath: state.currentFilePath,
        stickerHost: nextHost,
      }),
    });

    if (state.chat) {
      state.chat.stickerPack = result.stickerPack || state.chat.stickerPack;
      state.chat.stickerConfigPath = result.stickerConfigPath || state.chat.stickerConfigPath;
      const stickerItemMap = new Map((state.chat.stickerPack?.items || []).map((item) => [normalizeStickerFilename(item.filename), item]));
      state.chat.messages = (state.chat.messages || []).map((message) => ({
        ...message,
        stickers: (message.stickers || []).map((sticker) => {
          const updated = stickerItemMap.get(normalizeStickerFilename(sticker.filename));
          return updated
            ? { ...sticker, ...updated }
            : sticker;
        }),
      }));
    }

    renderStickerSummary();
    initializeVirtualState();
    renderVirtualWindow(true);
  } catch (error) {
    alert(error instanceof Error ? error.message : String(error));
  } finally {
    els.saveStickerHost.disabled = false;
    els.saveStickerHost.textContent = originalText;
  }
}

function fillRkeyFromSampleUrl() {
  const sample = els.stickerSampleUrl.value.trim();
  if (!sample) {
    alert('先贴一个可用图链再提取。');
    return;
  }

  const { host, rkey } = parseSampleUrl(sample);
  if (!rkey) {
    alert('这条链接里没有解析到 rkey。');
    return;
  }

  if (host && els.stickerHostInput) {
    els.stickerHostInput.value = host;
  }
  els.stickerRkeyInput.value = rkey;
}

function toggleSelection(index) {
  const previousOrders = selectionOrderMap();
  const existingIndex = state.selectedMessageIndices.indexOf(index);
  if (existingIndex >= 0) {
    state.selectedMessageIndices.splice(existingIndex, 1);
  } else {
    state.selectedMessageIndices.push(index);
    state.selectedMessageIndices.sort((a, b) => a - b);
  }

  refreshSelectionDecorations(previousOrders);
  renderSelectionList();
}

async function saveCurrentReview() {
  const dataset = { messages: buildDatasetMessages(state.reviewRows) };
  if (!dataset.messages.length) {
    alert('当前标注没有有效内容，请至少保留一条属于我或对方的非空消息。');
    return;
  }

  const payload = {
    fileId: state.currentFileId,
    filePath: state.currentFilePath,
    label: els.annotationLabel.value.trim(),
    selectedMessages: state.reviewRows.map((row) => ({
      ...row,
      stickers: inferRowStickers(row),
      role: roleForSpeakerKey(row.speakerKey) || 'other',
    })),
    dataset,
  };

  if (state.editingAnnotationId) {
    await fetchJson(`/api/annotations/${state.editingAnnotationId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  } else {
    await fetchJson('/api/annotations', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    state.selectedMessageIndices = [];
  }

  const query = state.currentFilePath
    ? `path=${encodeURIComponent(state.currentFilePath)}`
    : `file=${encodeURIComponent(state.currentFileId)}`;

  const { annotations } = await fetchJson(`/api/annotations?${query}`);
  state.annotations = annotations;
  renderSelectionList();
  renderAnnotationSummary();
  renderAnnotationList();
  refreshMessageDecorations();
  closeReviewDialog();
}

function flashMessageRow(index, attempt = 0) {
  const target = state.messageRowRefs.get(index);
  if (target) {
    target.classList.add('flash');
    setTimeout(() => target.classList.remove('flash'), 900);
    return;
  }

  if (attempt < 60) {
    requestAnimationFrame(() => flashMessageRow(index, attempt + 1));
  }
}

function scrollToMessage(index) {
  if (!state.chat?.messages?.[index]) return;

  const itemTop = state.virtual.offsets[index] || 0;
  const itemHeight = state.virtual.heights[index] || estimateMessageHeight(state.chat.messages[index]);
  const viewportHeight = els.chatScroll.clientHeight || 0;
  const targetTop = Math.max(0, itemTop - Math.max(0, (viewportHeight - itemHeight) / 2));

  els.chatScroll.scrollTo({ top: targetTop, behavior: 'smooth' });
  scheduleVirtualRender(true);
  flashMessageRow(index);
}

function jumpToFarthestAnnotated() {
  const counts = annotationCountMap();
  const candidates = [...counts.keys()].sort((a, b) => b - a);
  if (!candidates.length) {
    alert('还没有已标注消息。');
    return;
  }
  scrollToMessage(candidates[0]);
}

function exportAnnotations() {
  const exportPayload = state.annotations.map((annotation) => ({
    ...annotation,
    dataset: datasetForAnnotation(annotation),
  }));
  const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${(state.currentFileId || 'annotations').replace(/[\\/]/g, '_')}.annotations.export.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function buildMappingPreview() {
  const previews = state.annotations.map((annotation) => {
    const before = savedDatasetForAnnotation(annotation);
    const after = datasetForAnnotation(annotation);
    return {
      id: annotation.id,
      label: annotation.label || '未命名标注',
      selectedCount: annotation.selectedMessages.length,
      before,
      after,
      changed: JSON.stringify(before) !== JSON.stringify(after),
    };
  });

  return previews;
}

function renderMappingPreviewDialog() {
  const previews = state.pendingMappingPreview;
  const changedCount = previews.filter((item) => item.changed).length;
  const mappingLabel = state.roleSwap ? '我=assistant，对方=user' : '我=user，对方=assistant';

  els.mappingPreviewSummary.innerHTML = `
    <strong>当前映射：${escapeHtml(mappingLabel)}</strong>
    <p class="annotation-preview">将检查并重写当前文件的全部 ${previews.length} 条标注，其中预计变更 ${changedCount} 条。</p>
  `;

  els.mappingPreviewList.innerHTML = previews
    .filter((item) => item.changed)
    .slice(0, 3)
    .map(
      (item) => `
        <article class="mapping-preview-card">
          <div class="annotation-card-header">
            <div>
              <strong>${escapeHtml(item.label)}</strong>
              <p class="muted">${item.selectedCount} 条原消息</p>
            </div>
            <div class="annotation-chip">将被重写</div>
          </div>
          <div class="mapping-preview-grid">
            <div>
              <h4>当前保存的 dataset</h4>
              <pre class="annotation-json">${escapeHtml(JSON.stringify(item.before, null, 2))}</pre>
            </div>
            <div>
              <h4>应用后的 dataset</h4>
              <pre class="annotation-json">${escapeHtml(JSON.stringify(item.after, null, 2))}</pre>
            </div>
          </div>
        </article>
      `,
    )
    .join('');

  if (!els.mappingPreviewList.innerHTML) {
    els.mappingPreviewList.innerHTML = '<div class="placeholder-card">当前映射与已保存标注一致，没有需要重写的内容。</div>';
  }
}

function openMappingPreviewDialog() {
  renderMappingPreviewDialog();
  els.mappingPreviewDialog.showModal();
}

function closeMappingPreviewDialog() {
  state.pendingMappingPreview = [];
  els.mappingPreviewDialog.close();
}

function applyRoleMappingToAllAnnotations() {
  if (!state.currentFilePath || !state.annotations.length) {
    alert('当前文件还没有可重算映射的标注。');
    return;
  }

  state.pendingMappingPreview = buildMappingPreview();
  openMappingPreviewDialog();
}

async function confirmApplyRoleMapping() {
  try {
    const changedCount = state.pendingMappingPreview.filter((item) => item.changed).length;
    if (changedCount === 0) {
      alert('当前映射与已保存标注一致，无需应用。');
      closeMappingPreviewDialog();
      return;
    }

    els.confirmApplyRoleMapping.disabled = true;
    els.confirmApplyRoleMapping.textContent = '正在应用...';

    const result = await fetchJson('/api/annotations/remap', {
      method: 'POST',
      body: JSON.stringify({
        fileId: state.currentFileId,
        filePath: state.currentFilePath,
        roleSwap: state.roleSwap,
      }),
    });

    state.annotations = result.annotations || [];
    renderSelectionList();
    renderAnnotationSummary();
    renderAnnotationList();
    refreshMessageDecorations();
    closeMappingPreviewDialog();
  } catch (error) {
    alert(error instanceof Error ? error.message : String(error));
  } finally {
    els.confirmApplyRoleMapping.disabled = false;
    els.confirmApplyRoleMapping.textContent = '确认应用到全部标注';
  }
}

function handleRoleSwapToggle() {
  state.roleSwap = !state.roleSwap;
  renderSwapStates();
  if (els.reviewDialog.open) {
    renderReviewRows();
  }
  renderSelectionList();
  renderAnnotationSummary();
  renderAnnotationList();
}

function bindEvents() {
  els.sidebarToggle.addEventListener('click', () => {
    if (isCompactLayout() && state.sidebarOpen) {
      closeSidebar();
      return;
    }
    openSidebar();
  });

  els.sidebarClose.addEventListener('click', closeSidebar);
  els.sidebarBackdrop.addEventListener('click', closeSidebar);
  els.openSettings.addEventListener('click', openSettingsDialog);
  els.closeSettingsDialog.addEventListener('click', closeSettingsDialog);
  els.toggleRoleSwap.addEventListener('click', handleRoleSwapToggle);
  els.applyRoleMapping.addEventListener('click', applyRoleMappingToAllAnnotations);
  els.extractStickerRkey.addEventListener('click', fillRkeyFromSampleUrl);
  els.calculateStickerDownloads.addEventListener('click', calculateStickerCandidates);
  els.saveStickerHost.addEventListener('click', saveStickerHostSetting);
  els.stickerMinOccurrences.addEventListener('input', () => {
    if (els.stickerCandidateSummary) {
      els.stickerCandidateSummary.textContent = '阈值已变更，点“计算待下载数量”查看本次会处理多少表情包。';
    }
  });

  els.pickFile.addEventListener('click', async () => {
    const result = await fetchJson('/api/select-file', { method: 'POST' });
    if (result.cancelled) return;

    state.currentFileId = result.fileId || '';
    state.currentFilePath = result.filePath || '';
    await loadChat('');
    closeSidebar();
  });

  els.downloadStickers.addEventListener('click', async () => {
    if (!state.currentFilePath && !state.currentFileId) {
      alert('请先选择一个聊天文件。');
      return;
    }

    const minOccurrences = parsePositiveInteger(els.stickerMinOccurrences?.value, 1);
    const candidates = calculateStickerCandidates();
    if (!candidates.length) {
      alert(`当前没有出现至少 ${minOccurrences} 次的表情包。`);
      return;
    }

    const transientRkey = currentStickerRkey();

    const originalText = els.downloadStickers.textContent;
    els.downloadStickers.disabled = true;
    els.downloadStickers.textContent = '下载中...';
    els.saveStickerHost.disabled = true;
    if (els.stickerMinOccurrences) els.stickerMinOccurrences.disabled = true;
    setStickerDownloadProgress({
      visible: true,
      current: 0,
      total: candidates.length,
      success: 0,
      failed: 0,
      skipped: 0,
      text: `准备下载出现至少 ${minOccurrences} 次的表情包`,
    });

    try {
      let success = 0;
      let failed = 0;
      let skipped = 0;
      let processed = 0;
      let latestPack = state.chat?.stickerPack || stickerPack();

      for (const sticker of candidates) {
        const result = await fetchJson('/api/stickers/download-one', {
          method: 'POST',
          body: JSON.stringify({
            fileId: state.currentFileId,
            filePath: state.currentFilePath,
            stickerId: sticker.id,
            stickerRkey: transientRkey,
          }),
        });

        processed += 1;
        latestPack = result.stickerPack || latestPack;
        if (result.result?.status === 'downloaded') success += 1;
        else if (result.result?.status === 'skipped') skipped += 1;
        else failed += 1;

        const label = sticker.filename || `#${sticker.id}`;
        setStickerDownloadProgress({
          visible: true,
          current: processed,
          total: candidates.length,
          success,
          failed,
          skipped,
          text: `正在处理 ${label}`,
        });
      }

      if (state.chat) {
        state.chat.stickerPack = latestPack;
      }
      await refreshChatAfterStickerDownload();
      setStickerDownloadProgress({
        visible: true,
        current: candidates.length,
        total: candidates.length,
        success,
        failed,
        skipped,
        text: '图片状态已经刷新到聊天界面。',
      });
      await pauseForFrame();
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    } finally {
      els.downloadStickers.disabled = false;
      els.downloadStickers.textContent = originalText;
      els.saveStickerHost.disabled = false;
      if (els.stickerMinOccurrences) els.stickerMinOccurrences.disabled = false;
    }
  });

  els.clearSelection.addEventListener('click', () => {
    const previousOrders = selectionOrderMap();
    state.selectedMessageIndices = [];
    refreshSelectionDecorations(previousOrders);
    renderSelectionList();
  });

  els.reviewSelection.addEventListener('click', () => {
    if (!state.chat || !state.selectedMessageIndices.length) {
      alert('请先选中要提交的聊天记录。');
      return;
    }
    openReviewDialog();
  });

  els.jumpEarliest.addEventListener('click', jumpToFarthestAnnotated);
  els.exportAnnotations.addEventListener('click', exportAnnotations);
  els.openAnnotations.addEventListener('click', () => {
    els.annotationsDialog.showModal();
  });
  els.closeAnnotationsDialog.addEventListener('click', () => {
    els.annotationsDialog.close();
  });
  els.closeMappingPreviewDialog.addEventListener('click', closeMappingPreviewDialog);
  els.confirmApplyRoleMapping.addEventListener('click', confirmApplyRoleMapping);

  els.chatScroll.addEventListener('scroll', () => {
    scheduleVirtualRender();
  });

  window.addEventListener('resize', () => {
    syncResponsiveLayout();
  });

  els.chatList.addEventListener('click', (event) => {
    const target = event.target.closest('.msg-card');
    if (!target) return;
    toggleSelection(Number(target.dataset.index));
  });

  els.annotationList.addEventListener('click', async (event) => {
    const target = event.target.closest('button[data-action]');
    if (!target) return;

    const annotation = state.annotations.find((item) => item.id === target.dataset.annotationId);
    if (!annotation) return;

    if (target.dataset.action === 'locate-annotation') {
      const firstMessageIndex = annotation.selectedMessages
        .map((item) => item.messageIndex)
        .sort((a, b) => a - b)[0];
      scrollToMessage(firstMessageIndex);
      return;
    }

    if (target.dataset.action === 'edit-annotation') {
      openReviewDialog({ editingAnnotation: annotation });
      return;
    }

    if (target.dataset.action === 'delete-annotation') {
      if (!confirm('确定要删除这条标注吗？')) return;

      const query = state.currentFilePath
        ? `path=${encodeURIComponent(state.currentFilePath)}`
        : `file=${encodeURIComponent(state.currentFileId)}`;

      await fetchJson(`/api/annotations/${annotation.id}?${query}`, { method: 'DELETE' });
      state.annotations = state.annotations.filter((item) => item.id !== annotation.id);
      renderAnnotationSummary();
      renderAnnotationList();
      refreshMessageDecorations();
    }
  });

  els.closeDialog.addEventListener('click', closeReviewDialog);

  els.reviewRows.addEventListener('click', (event) => {
    const target = event.target.closest('button[data-action]');
    if (!target) return;

    const index = Number(target.dataset.reviewIndex);
    if (target.dataset.action === 'move-up' && index > 0) {
      [state.reviewRows[index - 1], state.reviewRows[index]] = [state.reviewRows[index], state.reviewRows[index - 1]];
    }
    if (target.dataset.action === 'move-down' && index < state.reviewRows.length - 1) {
      [state.reviewRows[index + 1], state.reviewRows[index]] = [state.reviewRows[index], state.reviewRows[index + 1]];
    }
    if (target.dataset.action === 'remove') {
      state.reviewRows.splice(index, 1);
    }

    renderReviewRows();
  });

  els.reviewRows.addEventListener('input', (event) => {
    const target = event.target.closest('textarea[data-action="edit-text"]');
    if (!target) return;

    const index = Number(target.dataset.reviewIndex);
    state.reviewRows[index].text = target.value;
    refreshJsonPreview();
  });

  els.confirmSave.addEventListener('click', saveCurrentReview);
  els.annotationLabel.addEventListener('input', refreshJsonPreview);
}

function cloneReviewRow(row) {
  return {
    ...row,
    stickers: Array.isArray(row?.stickers)
      ? row.stickers.map((sticker) => ({
          id: Number(sticker?.id || sticker?.stickerId) || 0,
          filename: normalizeStickerFilename(sticker?.filename),
        }))
      : inferRowStickers(row),
  };
}

function renderChatMeta() {
  const chat = state.chat;
  if (!chat) {
    els.chatMeta.innerHTML = '';
    return;
  }

  const identity = chatIdentity();
  const totalMessages = chat.statistics?.totalMessages ?? chat.messages.length;
  els.chatMeta.innerHTML = `
    <div class="meta-pill">聊天对象备注：${escapeHtml(identity.peer.remark || '未命名')}</div>
    <div class="meta-pill">聊天类型：${escapeHtml(chat.chatInfo?.type || 'unknown')}</div>
    <div class="meta-pill">我：uid=${escapeHtml(identity.self.uid || '未识别')}</div>
    <div class="meta-pill">我：qq=${escapeHtml(identity.self.uin || '未识别')}</div>
    <div class="meta-pill">我：昵称=${escapeHtml(identity.self.name || '未识别')}</div>
    <div class="meta-pill">对方：uid=${escapeHtml(identity.peer.uid || '未识别')}</div>
    <div class="meta-pill">对方：qq=${escapeHtml(identity.peer.uin || '未识别')}</div>
    <div class="meta-pill">对方：昵称=${escapeHtml(identity.peer.nickname || identity.peer.displayName || '未识别')}</div>
    <div class="meta-pill">消息总数：${escapeHtml(totalMessages)}</div>
    <details class="path-details">
      <summary>文件路径</summary>
      <div class="path-detail-list">
        <div><strong>源文件：</strong>${escapeHtml(chat.filePath || '')}</div>
        <div><strong>标注文件：</strong>${escapeHtml(chat.annotationPath || '')}</div>
      </div>
    </details>
  `;
}

function renderAnnotationSummary() {
  if (!state.annotations.length) {
    els.annotationSummary.innerHTML = '当前文件还没有任何标注。';
    return;
  }

  const latest = sortedAnnotations()[0];
  els.annotationSummary.innerHTML = `
    <strong>共 ${state.annotations.length} 条标注</strong>
    <p class="annotation-preview">最近一条：${escapeHtml(annotationSummary(latest))}</p>
  `;
}

function renderAnnotationList() {
  els.annotationEmpty.hidden = state.annotations.length > 0;
  els.annotationList.innerHTML = sortedAnnotations()
    .map((annotation) => {
      const primary = primaryVariantForAnnotation(annotation);
      const locateIndex = annotationLocateIndex(annotation);
      const variantCount = annotationVariants(annotation).length;
      const tag = annotation.kind === 'context-expansion'
        ? `拓展上下文训练 · ${variantCount} 个变体`
        : `${primary.selectedMessages.length} 条原消息`;
      return `
        <article class="annotation-card" data-annotation-id="${annotation.id}">
          <div class="annotation-card-header">
            <div>
              <strong>${escapeHtml(annotation.label || '未命名标注')}</strong>
              <p class="muted">${new Date(annotation.updatedAt).toLocaleString('zh-CN')}</p>
            </div>
            <div class="annotation-chip">${escapeHtml(tag)}</div>
          </div>
          <p class="annotation-preview">${escapeHtml(annotationSummary(annotation))}</p>
          <p class="muted">定位锚点：第 ${locateIndex >= 0 ? locateIndex + 1 : '?'} 条消息</p>
          <div class="annotation-actions">
            <button type="button" class="ghost-btn" data-action="locate-annotation" data-annotation-id="${annotation.id}">定位</button>
            <button type="button" class="ghost-btn" data-action="edit-annotation" data-annotation-id="${annotation.id}">编辑</button>
            <button type="button" class="ghost-btn danger" data-action="delete-annotation" data-annotation-id="${annotation.id}">删除</button>
          </div>
        </article>
      `;
    })
    .join('');
}

function refreshMessageDecorations() {
  const counts = annotationCountMap();
  const orders = selectionOrderMap();

  for (const [index, row] of state.messageRowRefs.entries()) {
    const count = counts.get(index) || 0;
    const order = orders.get(index) || 0;

    row.classList.toggle('selected', order > 0);
    for (let level = 1; level <= 4; level += 1) {
      row.classList.toggle(`count-level-${level}`, Math.min(count, 4) === level);
    }

    const countChip = state.messageCountChipRefs.get(index);
    if (countChip) {
      countChip.textContent = `${count} 次`;
      countChip.classList.toggle('has-count', count > 0);
    }

    const orderChip = state.messageOrderChipRefs.get(index);
    if (orderChip) {
      orderChip.textContent = order > 0 ? `#${order}` : '';
    }
  }
}

function overrideToggleSelection(index, options = {}) {
  const previousOrders = selectionOrderMap();
  const isShift = Boolean(options.shiftKey);

  if (isShift && Number.isInteger(state.selectionAnchorIndex)) {
    const start = Math.min(state.selectionAnchorIndex, index);
    const end = Math.max(state.selectionAnchorIndex, index);
    const next = new Set(state.selectedMessageIndices);
    for (let cursor = start; cursor <= end; cursor += 1) {
      next.add(cursor);
    }
    state.selectedMessageIndices = [...next].sort((a, b) => a - b);
  } else {
    const existingIndex = state.selectedMessageIndices.indexOf(index);
    if (existingIndex >= 0) {
      state.selectedMessageIndices.splice(existingIndex, 1);
    } else {
      state.selectedMessageIndices.push(index);
      state.selectedMessageIndices.sort((a, b) => a - b);
    }
    state.selectionAnchorIndex = index;
  }

  refreshSelectionDecorations(previousOrders);
  renderSelectionList();
}

function applySidebarWidth() {
  const width = Math.max(280, Math.min(680, Number(state.sidebarWidth) || 360));
  state.sidebarWidth = width;
  document.documentElement.style.setProperty('--sidebar-width', `${width}px`);
}

function beginSidebarResize(event) {
  if (isCompactLayout()) return;
  event.preventDefault();
  state.sidebarDragActive = true;
  els.sidebarResizer?.classList.add('dragging');
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
}

function handleSidebarResize(event) {
  if (!state.sidebarDragActive || isCompactLayout()) return;
  const shellRect = els.appShell.getBoundingClientRect();
  const nextWidth = event.clientX - shellRect.left;
  state.sidebarWidth = Math.max(280, Math.min(680, nextWidth));
  localStorage.setItem('qq-annotator:sidebar-width', `${state.sidebarWidth}`);
  applySidebarWidth();
}

function endSidebarResize() {
  if (!state.sidebarDragActive) return;
  state.sidebarDragActive = false;
  els.sidebarResizer?.classList.remove('dragging');
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
}

function currentReviewPayload() {
  const selectedMessages = state.reviewRows.map((row) => ({
    ...cloneReviewRow(row),
    role: roleForSpeakerKey(row.speakerKey) || 'other',
  }));
  return {
    fileId: state.currentFileId,
    filePath: state.currentFilePath,
    label: els.annotationLabel.value.trim(),
    kind: 'single',
    selectedMessages,
    dataset: { messages: buildDatasetMessages(selectedMessages) },
  };
}

async function reloadAnnotationsFromServer() {
  const query = state.currentFilePath
    ? `path=${encodeURIComponent(state.currentFilePath)}`
    : `file=${encodeURIComponent(state.currentFileId)}`;
  const { annotations } = await fetchJson(`/api/annotations?${query}`);
  state.annotations = annotations || [];
  renderAnnotationSummary();
  renderAnnotationList();
  refreshMessageDecorations();
}

async function overrideSaveCurrentReview() {
  const payload = currentReviewPayload();
  if (!payload.dataset.messages.length) {
    alert('当前标注没有有效内容，请至少保留一条非空消息。');
    return;
  }

  const originalText = els.confirmSave.textContent;
  els.confirmSave.disabled = true;
  els.confirmSave.textContent = state.editingAnnotationId ? '正在保存...' : '正在提交...';

  try {
    if (state.editingAnnotationId) {
      await fetchJson(`/api/annotations/${state.editingAnnotationId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    } else {
      await fetchJson('/api/annotations', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      state.selectedMessageIndices = [];
      state.selectionAnchorIndex = null;
      renderSelectionList();
    }

    await reloadAnnotationsFromServer();
    closeReviewDialog();
  } catch (error) {
    alert(error instanceof Error ? error.message : String(error));
  } finally {
    els.confirmSave.disabled = false;
    els.confirmSave.textContent = originalText;
  }
}

function scrollToAnnotation(annotation) {
  const targetIndex = annotationLocateIndex(annotation);
  if (targetIndex >= 0) {
    scrollToMessage(targetIndex);
  }
}

function overrideJumpToFarthestAnnotated() {
  const candidates = [...annotationCountMap().keys()].sort((a, b) => b - a);
  if (!candidates.length) {
    alert('还没有已标注消息。');
    return;
  }
  scrollToMessage(candidates[0]);
}

function overrideExportAnnotations() {
  const payload = sortedAnnotations().map(exportableAnnotation);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  const suffix = state.exportFormat === 'messages-only' ? 'messages' : 'full';
  anchor.download = `${(state.currentFileId || 'annotations').replace(/[\\/]/g, '_')}.${suffix}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function contextSourceRows() {
  return state.contextTraining?.sourceRows || [];
}

function contextSelectedRowIndexes() {
  return [...(state.contextTraining?.selectedRowIndexes || new Set())].sort((a, b) => a - b);
}

function contextSelectedRows() {
  const sourceRows = contextSourceRows();
  return contextSelectedRowIndexes().map((index) => sourceRows[index]).filter(Boolean).map(cloneReviewRow);
}

function renderContextSelectionSummary() {
  if (!state.contextTraining) return;
  const count = contextSelectedRowIndexes().length;
  els.contextSelectionSummary.innerHTML = `
    <strong>当前选中 ${count} 条消息</strong>
    <p class="annotation-preview">这些消息会被整理成一个训练变体；同一组里的多个变体只在计数里算 1 次。</p>
  `;
}

function renderContextSourceRows() {
  const rows = contextSourceRows();
  if (!rows.length) {
    els.contextSourceRows.innerHTML = '<div class="placeholder-card">还没有可拓展的内容。</div>';
    renderContextSelectionSummary();
    return;
  }

  const checked = state.contextTraining.selectedRowIndexes;
  els.contextSourceRows.innerHTML = rows.map((row, index) => {
    const role = roleBadgeText(row.speakerKey);
    const enabled = checked.has(index);
    return `
      <article class="review-row context-row ${enabled ? 'context-row-selected' : ''}" data-context-index="${index}">
        <label class="context-checkbox-line">
          <input type="checkbox" data-action="toggle-context-row" data-context-index="${index}" ${enabled ? 'checked' : ''} />
          <span class="review-badge ${role}">${role}</span>
          <span class="muted">${escapeHtml(row.senderName)} · ${escapeHtml(row.time || '')}</span>
        </label>
        <div class="msg-content">${nl2br(row.text || '[空消息]')}</div>
      </article>
    `;
  }).join('');
  renderContextSelectionSummary();
}

function contextVariantPreview(variant) {
  return (variant?.dataset?.messages || []).map((item) => item.content).join(' | ');
}

function moveExportButtonIntoAnnotationsDialog() {
  if (!els.exportAnnotations || !els.annotationsDialog) return;
  const dialogColumn = els.annotationsDialog.querySelector('.dialog-column');
  const emptyState = els.annotationEmpty;
  if (!dialogColumn || !emptyState) return;

  let toolbar = els.annotationsDialog.querySelector('[data-role="annotation-export-toolbar"]');
  if (!toolbar) {
    toolbar = document.createElement('div');
    toolbar.className = 'dialog-toolbar';
    toolbar.dataset.role = 'annotation-export-toolbar';
  }

  if (els.exportAnnotations.parentElement !== toolbar) {
    toolbar.appendChild(els.exportAnnotations);
  }

  if (toolbar.parentElement !== dialogColumn) {
    dialogColumn.insertBefore(toolbar, emptyState);
  }
}

function finalRenderAnnotationList() {
  els.annotationEmpty.hidden = state.annotations.length > 0;
  els.annotationList.innerHTML = sortedAnnotations()
    .map((annotation) => {
      const primary = primaryVariantForAnnotation(annotation);
      const variantCount = annotationVariants(annotation).length;
      const locateIndex = annotationLocateIndex(annotation);
      const metaText = annotation.kind === 'context-expansion'
        ? `拓展上下文训练 · ${variantCount} 个变体`
        : `${primary.selectedMessages.length} 条原消息`;
      return `
        <article class="annotation-card" data-annotation-id="${annotation.id}">
          <div class="annotation-card-header">
            <div>
              <strong>${escapeHtml(annotation.label || '未命名标注')}</strong>
              <p class="muted">${new Date(annotation.updatedAt).toLocaleString('zh-CN')}</p>
            </div>
            <div class="annotation-chip">${escapeHtml(metaText)}</div>
          </div>
          <p class="annotation-preview">${escapeHtml(annotationSummary(annotation))}</p>
          <p class="muted">定位锚点：第 ${locateIndex >= 0 ? locateIndex + 1 : '?'} 条消息</p>
          <div class="annotation-actions">
            <button type="button" class="ghost-btn" data-action="locate-annotation" data-annotation-id="${annotation.id}">定位</button>
            <button type="button" class="ghost-btn" data-action="edit-annotation" data-annotation-id="${annotation.id}">编辑</button>
            <button type="button" class="ghost-btn danger" data-action="delete-annotation" data-annotation-id="${annotation.id}">删除</button>
          </div>
        </article>
      `;
    })
    .join('');
}

function renderContextVariantsList() {
  const variants = state.contextTraining?.variants || [];
  els.contextVariantsEmpty.hidden = variants.length > 0;
  els.contextVariantsList.innerHTML = variants.map((variant, index) => {
    const preview = contextVariantPreview(variant);
    const active = state.contextTraining.activeVariantIndex === index;
    return `
      <article class="annotation-card ${active ? 'annotation-card-active' : ''}" data-context-variant-index="${index}">
        <div class="annotation-card-header">
          <div>
            <strong>变体 ${index + 1}</strong>
            <p class="muted">${variant.selectedMessages.length} 条原消息</p>
          </div>
          <div class="annotation-chip">${active ? '当前载入' : '已保存到组内'}</div>
        </div>
        <p class="annotation-preview">${escapeHtml(preview.length > 120 ? `${preview.slice(0, 120)}...` : preview || '[空变体]')}</p>
        <div class="annotation-actions">
          <button type="button" class="ghost-btn" data-action="load-context-variant" data-context-variant-index="${index}">载入</button>
          <button type="button" class="ghost-btn" data-action="locate-context-variant" data-context-variant-index="${index}">定位</button>
          <button type="button" class="ghost-btn danger" data-action="delete-context-variant" data-context-variant-index="${index}">删除</button>
        </div>
      </article>
    `;
  }).join('');
}

function buildContextVariantFromRows(rows) {
  const selectedMessages = rows.map((row) => ({
    ...cloneReviewRow(row),
    role: roleForSpeakerKey(row.speakerKey) || 'other',
  }));
  return {
    id: crypto.randomUUID(),
    selectedMessages,
    dataset: { messages: buildDatasetMessages(selectedMessages) },
    locate: {
      firstMessageIndex: selectedMessages[0]?.messageIndex ?? null,
      messageIndices: selectedMessages.map((row) => row.messageIndex),
    },
  };
}

function loadContextVariantIntoSelection(index) {
  const variant = state.contextTraining?.variants?.[index];
  if (!variant) return;
  const sourceRows = contextSourceRows();
  const selectedIndexes = new Set();
  const sourceIndexByMessageIndex = new Map(sourceRows.map((row, rowIndex) => [row.messageIndex, rowIndex]));
  for (const message of variant.selectedMessages || []) {
    const rowIndex = sourceIndexByMessageIndex.get(message.messageIndex);
    if (Number.isInteger(rowIndex)) {
      selectedIndexes.add(rowIndex);
    }
  }
  state.contextTraining.selectedRowIndexes = selectedIndexes;
  state.contextTraining.activeVariantIndex = index;
  renderContextSourceRows();
  renderContextVariantsList();
}

function openContextTrainingDialog({ annotation = null } = {}) {
  const sourceRows = annotation
    ? (Array.isArray(annotation.sourceMessages) && annotation.sourceMessages.length
        ? annotation.sourceMessages
        : primaryVariantForAnnotation(annotation).selectedMessages)
      .map(cloneReviewRow)
    : state.reviewRows.map(cloneReviewRow);

  if (!sourceRows.length) {
    alert('当前没有可用于拓展上下文训练的消息。');
    return;
  }

  state.contextTraining = {
    annotationId: annotation?.id || null,
    sourceRows,
    selectedRowIndexes: new Set(sourceRows.map((_, index) => index)),
    activeVariantIndex: null,
    variants: annotation
      ? annotationVariants(annotation).map((variant) => ({
          ...variant,
          selectedMessages: (variant.selectedMessages || []).map(cloneReviewRow),
        }))
      : [],
  };

  els.contextDialogTitle.textContent = annotation ? '编辑拓展上下文训练' : '拓展上下文训练';
  els.contextAnnotationLabel.value = annotation?.label || els.annotationLabel.value.trim() || '';
  renderContextSourceRows();
  renderContextVariantsList();
  els.contextTrainingDialog.showModal();
}

function closeContextTrainingDialog() {
  state.contextTraining = null;
  els.contextTrainingDialog.close();
}

function addOrReplaceContextVariant({ replace = false } = {}) {
  if (!state.contextTraining) return;
  const rows = contextSelectedRows();
  if (!rows.length) {
    alert('请至少选中一条消息再生成变体。');
    return;
  }

  const variant = buildContextVariantFromRows(rows);
  const key = variant.selectedMessages.map((row) => row.messageIndex).join(',');
  const existingIndex = state.contextTraining.variants.findIndex(
    (item) => item.selectedMessages.map((row) => row.messageIndex).join(',') === key,
  );

  if (replace && Number.isInteger(state.contextTraining.activeVariantIndex) && state.contextTraining.activeVariantIndex >= 0) {
    state.contextTraining.variants[state.contextTraining.activeVariantIndex] = {
      ...state.contextTraining.variants[state.contextTraining.activeVariantIndex],
      ...variant,
    };
  } else if (existingIndex >= 0) {
    state.contextTraining.activeVariantIndex = existingIndex;
    loadContextVariantIntoSelection(existingIndex);
    alert('这个变体已经存在，我已经帮你定位到它。');
    return;
  } else {
    state.contextTraining.variants.push(variant);
    state.contextTraining.activeVariantIndex = state.contextTraining.variants.length - 1;
  }

  renderContextVariantsList();
}

async function saveContextTrainingGroup() {
  if (!state.contextTraining) return;
  const variants = state.contextTraining.variants || [];
  if (!variants.length) {
    alert('请先至少添加一个变体。');
    return;
  }

  const payload = {
    fileId: state.currentFileId,
    filePath: state.currentFilePath,
    label: els.contextAnnotationLabel.value.trim(),
    kind: 'context-expansion',
    sourceMessages: contextSourceRows().map(cloneReviewRow),
    variants,
  };

  const originalText = els.contextSaveGroup.textContent;
  els.contextSaveGroup.disabled = true;
  els.contextSaveGroup.textContent = state.contextTraining.annotationId ? '正在保存...' : '正在创建...';

  try {
    if (state.contextTraining.annotationId) {
      await fetchJson(`/api/annotations/${state.contextTraining.annotationId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    } else {
      await fetchJson('/api/annotations', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      state.selectedMessageIndices = [];
      state.selectionAnchorIndex = null;
      renderSelectionList();
    }

    await reloadAnnotationsFromServer();
    closeContextTrainingDialog();
    if (els.reviewDialog.open && !state.contextTraining?.annotationId) {
      closeReviewDialog();
    }
  } catch (error) {
    alert(error instanceof Error ? error.message : String(error));
  } finally {
    els.contextSaveGroup.disabled = false;
    els.contextSaveGroup.textContent = originalText;
  }
}

function overrideBindEvents() {
  els.sidebarToggle.addEventListener('click', () => {
    if (isCompactLayout() && state.sidebarOpen) {
      closeSidebar();
      return;
    }
    openSidebar();
  });

  els.sidebarClose.addEventListener('click', closeSidebar);
  els.sidebarBackdrop.addEventListener('click', closeSidebar);
  els.openSettings.addEventListener('click', openSettingsDialog);
  els.closeSettingsDialog.addEventListener('click', closeSettingsDialog);
  els.toggleRoleSwap.addEventListener('click', handleRoleSwapToggle);
  els.applyRoleMapping.addEventListener('click', applyRoleMappingToAllAnnotations);
  els.extractStickerRkey.addEventListener('click', fillRkeyFromSampleUrl);
  els.calculateStickerDownloads.addEventListener('click', calculateStickerCandidates);
  els.saveStickerHost.addEventListener('click', saveStickerHostSetting);
  els.stickerMinOccurrences.addEventListener('input', () => {
    if (els.stickerCandidateSummary) {
      els.stickerCandidateSummary.textContent = '阈值已变更，点“计算待下载数量”查看这次会处理多少表情包。';
    }
  });

  els.sidebarResizer?.addEventListener('pointerdown', beginSidebarResize);
  window.addEventListener('pointermove', handleSidebarResize);
  window.addEventListener('pointerup', endSidebarResize);
  window.addEventListener('pointercancel', endSidebarResize);

  els.annotationSort?.addEventListener('change', (event) => {
    state.annotationSortMode = event.target.value || 'updated-desc';
    localStorage.setItem('qq-annotator:annotation-sort', state.annotationSortMode);
    renderAnnotationList();
    renderAnnotationSummary();
  });

  els.exportFormat?.addEventListener('change', (event) => {
    state.exportFormat = event.target.value || 'messages-only';
    localStorage.setItem('qq-annotator:export-format', state.exportFormat);
  });

  els.exportSystemPrompt?.addEventListener('input', (event) => {
    state.exportSystemPrompt = event.target.value || '';
    localStorage.setItem('qq-annotator:export-system-prompt', state.exportSystemPrompt);
  });

  els.pickFile.addEventListener('click', async () => {
    const result = await fetchJson('/api/select-file', { method: 'POST' });
    if (result.cancelled) return;

    state.currentFileId = result.fileId || '';
    state.currentFilePath = result.filePath || '';
    await loadChat('');
    closeSidebar();
  });

  els.downloadStickers.addEventListener('click', async () => {
    if (!state.currentFilePath && !state.currentFileId) {
      alert('请先选择一个聊天文件。');
      return;
    }

    const minOccurrences = parsePositiveInteger(els.stickerMinOccurrences?.value, 1);
    const candidates = calculateStickerCandidates();
    if (!candidates.length) {
      alert(`当前没有出现至少 ${minOccurrences} 次的表情包。`);
      return;
    }

    const transientRkey = currentStickerRkey();
    const originalText = els.downloadStickers.textContent;
    els.downloadStickers.disabled = true;
    els.downloadStickers.textContent = '下载中...';
    els.saveStickerHost.disabled = true;
    if (els.stickerMinOccurrences) els.stickerMinOccurrences.disabled = true;
    setStickerDownloadProgress({
      visible: true,
      current: 0,
      total: candidates.length,
      success: 0,
      failed: 0,
      skipped: 0,
      text: `准备下载出现至少 ${minOccurrences} 次的表情包`,
    });

    try {
      let success = 0;
      let failed = 0;
      let skipped = 0;
      let processed = 0;
      let latestPack = state.chat?.stickerPack || stickerPack();

      for (const sticker of candidates) {
        const result = await fetchJson('/api/stickers/download-one', {
          method: 'POST',
          body: JSON.stringify({
            fileId: state.currentFileId,
            filePath: state.currentFilePath,
            stickerId: sticker.id,
            stickerRkey: transientRkey,
          }),
        });

        processed += 1;
        latestPack = result.stickerPack || latestPack;
        if (result.result?.status === 'downloaded') success += 1;
        else if (result.result?.status === 'skipped') skipped += 1;
        else failed += 1;

        setStickerDownloadProgress({
          visible: true,
          current: processed,
          total: candidates.length,
          success,
          failed,
          skipped,
          text: `正在处理 ${sticker.filename || `图片/表情包#${sticker.id}`}`,
        });
      }

      if (state.chat) {
        state.chat.stickerPack = latestPack;
      }
      await refreshChatAfterStickerDownload();
      setStickerDownloadProgress({
        visible: true,
        current: candidates.length,
        total: candidates.length,
        success,
        failed,
        skipped,
        text: '图片状态已经刷新到聊天界面。',
      });
      await pauseForFrame();
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    } finally {
      els.downloadStickers.disabled = false;
      els.downloadStickers.textContent = originalText;
      els.saveStickerHost.disabled = false;
      if (els.stickerMinOccurrences) els.stickerMinOccurrences.disabled = false;
    }
  });

  els.clearSelection.addEventListener('click', () => {
    const previousOrders = selectionOrderMap();
    state.selectedMessageIndices = [];
    state.selectionAnchorIndex = null;
    refreshSelectionDecorations(previousOrders);
    renderSelectionList();
  });

  els.reviewSelection.addEventListener('click', () => {
    if (!state.chat || !state.selectedMessageIndices.length) {
      alert('请先选中要提交的聊天记录。');
      return;
    }
    openReviewDialog();
  });

  els.openContextTraining?.addEventListener('click', () => {
    openContextTrainingDialog();
  });

  els.jumpEarliest.addEventListener('click', jumpToFarthestAnnotated);
  els.exportAnnotations.addEventListener('click', exportAnnotations);
  els.openAnnotations.addEventListener('click', () => {
    els.annotationsDialog.showModal();
  });
  els.closeAnnotationsDialog.addEventListener('click', () => {
    els.annotationsDialog.close();
  });
  els.closeMappingPreviewDialog.addEventListener('click', closeMappingPreviewDialog);
  els.confirmApplyRoleMapping.addEventListener('click', confirmApplyRoleMapping);

  els.chatScroll.addEventListener('scroll', () => {
    scheduleVirtualRender();
  });

  window.addEventListener('resize', () => {
    syncResponsiveLayout();
    applySidebarWidth();
  });

  els.chatList.addEventListener('click', (event) => {
    const target = event.target.closest('.msg-card');
    if (!target) return;
    toggleSelection(Number(target.dataset.index), { shiftKey: event.shiftKey });
  });

  els.annotationList.addEventListener('click', async (event) => {
    const target = event.target.closest('button[data-action]');
    if (!target) return;

    const annotation = state.annotations.find((item) => item.id === target.dataset.annotationId);
    if (!annotation) return;

    if (target.dataset.action === 'locate-annotation') {
      scrollToAnnotation(annotation);
      return;
    }

    if (target.dataset.action === 'edit-annotation') {
      if (annotation.kind === 'context-expansion') {
        openContextTrainingDialog({ annotation });
      } else {
        openReviewDialog({ editingAnnotation: annotation });
      }
      return;
    }

    if (target.dataset.action === 'delete-annotation') {
      if (!confirm('确定要删除这条标注吗？')) return;

      const query = state.currentFilePath
        ? `path=${encodeURIComponent(state.currentFilePath)}`
        : `file=${encodeURIComponent(state.currentFileId)}`;

      await fetchJson(`/api/annotations/${annotation.id}?${query}`, { method: 'DELETE' });
      state.annotations = state.annotations.filter((item) => item.id !== annotation.id);
      renderAnnotationSummary();
      renderAnnotationList();
      refreshMessageDecorations();
    }
  });

  els.closeDialog.addEventListener('click', closeReviewDialog);

  els.reviewRows.addEventListener('click', (event) => {
    const target = event.target.closest('button[data-action]');
    if (!target) return;

    const index = Number(target.dataset.reviewIndex);
    if (target.dataset.action === 'move-up' && index > 0) {
      [state.reviewRows[index - 1], state.reviewRows[index]] = [state.reviewRows[index], state.reviewRows[index - 1]];
    }
    if (target.dataset.action === 'move-down' && index < state.reviewRows.length - 1) {
      [state.reviewRows[index + 1], state.reviewRows[index]] = [state.reviewRows[index], state.reviewRows[index + 1]];
    }
    if (target.dataset.action === 'remove') {
      state.reviewRows.splice(index, 1);
    }

    renderReviewRows();
  });

  els.reviewRows.addEventListener('input', (event) => {
    const target = event.target.closest('textarea[data-action="edit-text"]');
    if (!target) return;

    const index = Number(target.dataset.reviewIndex);
    state.reviewRows[index].text = target.value;
    refreshJsonPreview();
  });

  els.confirmSave.addEventListener('click', saveCurrentReview);
  els.annotationLabel.addEventListener('input', refreshJsonPreview);

  els.closeContextTrainingDialog?.addEventListener('click', closeContextTrainingDialog);
  els.contextSelectAll?.addEventListener('click', () => {
    if (!state.contextTraining) return;
    state.contextTraining.selectedRowIndexes = new Set(contextSourceRows().map((_, index) => index));
    state.contextTraining.activeVariantIndex = null;
    renderContextSourceRows();
    renderContextVariantsList();
  });
  els.contextClearAll?.addEventListener('click', () => {
    if (!state.contextTraining) return;
    state.contextTraining.selectedRowIndexes = new Set();
    state.contextTraining.activeVariantIndex = null;
    renderContextSourceRows();
    renderContextVariantsList();
  });
  els.contextAddVariant?.addEventListener('click', () => addOrReplaceContextVariant({ replace: false }));
  els.contextReplaceVariant?.addEventListener('click', () => addOrReplaceContextVariant({ replace: true }));
  els.contextSaveGroup?.addEventListener('click', saveContextTrainingGroup);

  els.contextSourceRows?.addEventListener('change', (event) => {
    const target = event.target.closest('input[data-action="toggle-context-row"]');
    if (!target || !state.contextTraining) return;
    const index = Number(target.dataset.contextIndex);
    if (target.checked) state.contextTraining.selectedRowIndexes.add(index);
    else state.contextTraining.selectedRowIndexes.delete(index);
    state.contextTraining.activeVariantIndex = null;
    renderContextSourceRows();
    renderContextVariantsList();
  });

  els.contextVariantsList?.addEventListener('click', (event) => {
    const target = event.target.closest('button[data-action]');
    if (!target || !state.contextTraining) return;
    const index = Number(target.dataset.contextVariantIndex);
    if (target.dataset.action === 'load-context-variant') {
      loadContextVariantIntoSelection(index);
      return;
    }
    if (target.dataset.action === 'locate-context-variant') {
      const variant = state.contextTraining.variants[index];
      const firstIndex = variant?.locate?.firstMessageIndex ?? variant?.selectedMessages?.[0]?.messageIndex;
      if (Number.isInteger(firstIndex) && firstIndex >= 0) {
        closeContextTrainingDialog();
        scrollToMessage(firstIndex);
      }
      return;
    }
    if (target.dataset.action === 'delete-context-variant') {
      state.contextTraining.variants.splice(index, 1);
      if (state.contextTraining.activeVariantIndex === index) {
        state.contextTraining.activeVariantIndex = null;
      }
      renderContextVariantsList();
    }
  });
}

async function init() {
  renderChatMeta = overrideRenderChatMeta;
  renderAnnotationSummary = overrideRenderAnnotationSummary;
  renderAnnotationList = finalRenderAnnotationList;
  refreshMessageDecorations = overrideRefreshMessageDecorations;
  toggleSelection = overrideToggleSelection;
  saveCurrentReview = overrideSaveCurrentReview;
  jumpToFarthestAnnotated = overrideJumpToFarthestAnnotated;
  exportAnnotations = overrideExportAnnotations;
  bindEvents = overrideBindEvents;
  bindEvents();
  moveExportButtonIntoAnnotationsDialog();
  state.sidebarWidth = Number(localStorage.getItem('qq-annotator:sidebar-width') || 360);
  state.annotationSortMode = localStorage.getItem('qq-annotator:annotation-sort') || 'updated-desc';
  state.exportFormat = localStorage.getItem('qq-annotator:export-format') || 'messages-only';
  state.exportSystemPrompt = localStorage.getItem('qq-annotator:export-system-prompt') || '';
  syncResponsiveLayout();
  renderSwapStates();
  applySidebarWidth();
  if (els.annotationSort) els.annotationSort.value = state.annotationSortMode;
  if (els.exportFormat) els.exportFormat.value = state.exportFormat;
  if (els.exportSystemPrompt) els.exportSystemPrompt.value = state.exportSystemPrompt;
  state.currentFilePath = localStorage.getItem('qq-annotator:last-file-path') || '';
  renderSelectedFileCard();
  renderStickerSummary();
  setStickerDownloadProgress({ visible: false });

  if (state.currentFilePath) {
    await loadChat('');
  }
}

init().catch((error) => {
  console.error(error);
  hideLoading();
  alert(error.message || '初始化失败');
});
