'use strict';

const api = window.lingjian;
const settingsWindowMode = new URLSearchParams(window.location.search).get('mode') === 'settings';
const TASK_COLORS = ['#F7B955', '#F28B82', '#77C7A3', '#72A7E8', '#B69BE6', '#F3A6C8', '#92C9D4', '#AAB36A'];
const BACKGROUNDS = ['#FFF8E8', '#FFF1F0', '#ECF8F2', '#EDF5FF', '#F5F0FF', '#FFF0F6', '#EFF7F8', '#F3F2EC'];
const REPEAT_LABELS = { none: '仅一次', daily: '每天', weekdays: '工作日', weekly: '每周', monthly: '每月' };
const PRIORITY_LABELS = { high: '重要', normal: '普通', low: '稍后' };

const ICONS = {
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg viewBox="0 0 24 24"><path d="M6 12h12"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="m7 7 10 10M17 7 7 17"/></svg>',
  square: '<svg viewBox="0 0 24 24"><rect x="6.5" y="6.5" width="11" height="11" rx="1"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="m14 4 6 6-2.5 1.2-3.8 3.8.3 3-1 1-3.5-4L5 11.5l1-1 3 .3 3.8-3.8zM9.5 14.5 5 19"/></svg>',
  panel: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M15 5v14M17.5 10v4"/></svg>',
  settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></svg>',
  menu: '<svg viewBox="0 0 24 24"><path d="M5 7h14M5 12h14M5 17h14"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/></svg>',
  bell: '<svg viewBox="0 0 24 24"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 8h18c0-1-3-1-3-8ZM10 20h4"/></svg>',
  grip: '<svg viewBox="0 0 24 24"><circle cx="8" cy="7" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="7" r="1" fill="currentColor" stroke="none"/><circle cx="8" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="8" cy="17" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="17" r="1" fill="currentColor" stroke="none"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="m6 12 4 4 8-9"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="m14.5 5.5 4 4L9 19H5v-4zM12.5 7.5l4 4"/></svg>',
  palette: '<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 0 18h1.4a1.5 1.5 0 0 0 0-3H12a2 2 0 0 1 0-4h3.5A5.5 5.5 0 0 0 21 8.5C21 5.5 17 3 12 3Z"/><circle cx="7.5" cy="9" r=".8" fill="currentColor"/><circle cx="10" cy="6.5" r=".8" fill="currentColor"/><circle cx="15" cy="6.5" r=".8" fill="currentColor"/></svg>',
  'check-all': '<svg viewBox="0 0 24 24"><path d="m3 12 3 3 5-6M10 14l2 2 8-9"/></svg>',
  archive: '<svg viewBox="0 0 24 24"><path d="M4 8h16v11H4zM3 5h18v3H3zM9 12h6"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>',
  calendar: '<svg viewBox="0 0 24 24"><rect x="4" y="5.5" width="16" height="14" rx="2"/><path d="M8 3.5v4M16 3.5v4M4 10h16"/></svg>',
  flag: '<svg viewBox="0 0 24 24"><path d="M6 21V4M6 5h11l-2 3 2 3H6"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>',
  download: '<svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M4 20h16"/></svg>',
  upload: '<svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></svg>',
  folder: '<svg viewBox="0 0 24 24"><path d="M3 6.5h6l2 2h10v9.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 10h18"/></svg>',
  widget: '<svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="10" rx="5"/><path d="M8 12h8M12 9v6"/></svg>',
  'chevron-left': '<svg viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></svg>',
  'chevron-right': '<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>',
  'chevron-up': '<svg viewBox="0 0 24 24"><path d="m6 15 6-6 6 6"/></svg>',
  'chevron-down': '<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>',
  'maximize-2': '<svg viewBox="0 0 24 24"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/></svg>',
  'eye-off': '<svg viewBox="0 0 24 24"><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.5 5.3A10.8 10.8 0 0 1 12 5c5.5 0 9 7 9 7a15 15 0 0 1-2.1 3.1M6.6 6.6C4.3 8.1 3 12 3 12s3.5 7 9 7c1.1 0 2.1-.3 3-.7"/></svg>',
  image: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4 17 5-5 4 4 2-2 5 4"/></svg>'
};

let state;
let activeFilter = 'all';
let searchTerm = '';
let quickColor = TASK_COLORS[0];
let editingTaskId = null;
let selectedTaskColor = TASK_COLORS[0];
let noteDialogMode = 'create';
let selectedNoteColor = TASK_COLORS[0];
let draggedTaskId = null;
let saveTimeout = null;
let paletteCallback = null;
let deletedSnapshot = null;
let widgetIndex = 0;
let widgetUiState = { enabled: false, expanded: false, docked: true, expandDirection: 'down' };
let widgetHoverTimer = null;
let widgetHoverSequence = 0;
let widgetHoverSuppressedUntil = 0;
let widgetDragActive = false;
let widgetPreviewHideTimer = null;
let widgetPreviewFinishTimer = null;
let settingsPanelPosition = null;
let settingsPanelDrag = null;
let backgroundImageData = { main: '', widget: '' };
let mainWindowBounds = { width: 920, height: 680 };
let dataDirectoryPath = '';
let resizeGesture = null;
let resizeMoveScheduled = false;
let appearanceFrame = null;
let appearanceAdjustingTimer = null;
let pendingAppearancePatch = {};
let pendingWidgetPreview = false;
let backgroundLoadSequence = 0;
const dirtySettingKeys = new Set();
const activeSettingControls = new Set();

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const currentNote = () => state.notes.find(note => note.id === state.activeNoteId) || state.notes[0];
const uid = prefix => `${prefix}-${crypto.randomUUID()}`;

function setIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(element => {
    const icon = element.dataset.icon;
    if (ICONS[icon]) element.innerHTML = ICONS[icon];
  });
}

function hexToRgb(hex) {
  const cleaned = String(hex || '').replace('#', '');
  const value = cleaned.length === 3 ? cleaned.split('').map(char => char + char).join('') : cleaned;
  const number = Number.parseInt(value, 16);
  if (!Number.isFinite(number)) return [255, 248, 232];
  return [(number >> 16) & 255, (number >> 8) & 255, number & 255];
}

function shade(hex, amount) {
  const [r, g, b] = hexToRgb(hex).map(value => Math.max(0, Math.min(255, value + amount)));
  return `rgb(${r}, ${g}, ${b})`;
}

function applyAppearanceOnly() {
  const settings = state.settings;
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = settings.theme === 'dark' || (settings.theme === 'system' && prefersDark);
  const automaticText = dark ? '#F1F1F4' : '#292B32';
  const mainText = settings.mainTextColor || automaticText;
  const widgetText = settings.widgetTextColor || automaticText;
  document.body.classList.toggle('theme-dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  let rgb = hexToRgb(settings.background);
  let widgetRgb = hexToRgb(settings.widgetBackground || settings.background);
  if (dark) {
    rgb = rgb.map(value => Math.round(value * .24));
    widgetRgb = widgetRgb.map(value => Math.round(value * .24));
  }
  document.documentElement.style.setProperty('--bg-rgb', rgb.join(', '));
  document.documentElement.style.setProperty('--bg-opacity', String(settings.backgroundOpacity));
  document.documentElement.style.setProperty('--widget-bg-rgb', widgetRgb.join(', '));
  document.documentElement.style.setProperty('--widget-bg-opacity', String(settings.widgetBackgroundOpacity));
  document.documentElement.style.setProperty('--main-text', mainText);
  document.documentElement.style.setProperty('--widget-text', widgetText);
  applyBackgroundLayer($('#mainBackgroundLayer'), backgroundImageData.main, settings.backgroundFit, settings.backgroundImageOpacity);
  applyBackgroundLayer($('#widgetBackgroundLayer'), backgroundImageData.widget, settings.widgetBackgroundFit, settings.widgetBackgroundImageOpacity);
  const accent = currentNote()?.color || TASK_COLORS[0];
  document.documentElement.style.setProperty('--accent', accent);
  document.documentElement.style.setProperty('--accent-strong', shade(accent, -31));
}

function applySettings() {
  const settings = state.settings;
  applyAppearanceOnly();
  $('#pinBtn').classList.toggle('active', Boolean(settings.alwaysOnTop));
  $('#edgeBtn').classList.toggle('active', Boolean(settings.edgeHide));
  $('#widgetBtn').classList.toggle('active', Boolean(widgetUiState.enabled));
  syncSettingControls();
}

function applyBackgroundLayer(layer, dataUrl, fit, opacity) {
  if (!layer) return;
  if (layer.__lingjianBackgroundData !== dataUrl) {
    layer.__lingjianBackgroundData = dataUrl;
    layer.style.backgroundImage = dataUrl ? `url(${JSON.stringify(dataUrl)})` : 'none';
  }
  const nextOpacity = String(opacity ?? 0.55);
  const nextSize = fit === 'repeat' ? 'auto' : (fit || 'cover');
  const nextRepeat = fit === 'repeat' ? 'repeat' : 'no-repeat';
  if (layer.style.opacity !== nextOpacity) layer.style.opacity = nextOpacity;
  if (layer.style.backgroundSize !== nextSize) layer.style.backgroundSize = nextSize;
  if (layer.style.backgroundRepeat !== nextRepeat) layer.style.backgroundRepeat = nextRepeat;
}

function renderWidgetPreview() {
  const preview = $('#widgetLivePreview');
  if (!preview || !state) return;
  const settings = state.settings;
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = settings.theme === 'dark' || (settings.theme === 'system' && prefersDark);
  const automaticText = dark ? '#F1F1F4' : '#292B32';
  const previewText = settings.widgetTextColor || automaticText;
  let rgb = hexToRgb(settings.widgetBackground || settings.background);
  if (dark) rgb = rgb.map(value => Math.round(value * .24));
  preview.style.setProperty('--preview-bg-rgb', rgb.join(', '));
  preview.style.setProperty('--preview-bg-opacity', String(settings.widgetBackgroundOpacity));
  preview.style.setProperty('--preview-accent', currentNote()?.color || TASK_COLORS[0]);
  preview.style.setProperty('--preview-text', previewText);
  preview.style.setProperty('--preview-muted', `color-mix(in srgb, ${previewText} 66%, transparent)`);
  preview.style.setProperty('--preview-window-opacity', String(settings.widgetOpacity));
  preview.style.width = `${settings.widgetWidth}px`;
  applyBackgroundLayer($('#widgetPreviewBackground'), backgroundImageData.widget, settings.widgetBackgroundFit, settings.widgetBackgroundImageOpacity);
}

function hideWidgetPreview(delay = 420) {
  clearTimeout(widgetPreviewHideTimer);
  clearTimeout(widgetPreviewFinishTimer);
  widgetPreviewHideTimer = setTimeout(() => {
    const preview = $('#widgetLivePreview');
    if (!preview || preview.hidden) return;
    preview.classList.remove('visible');
    widgetPreviewFinishTimer = setTimeout(() => { preview.hidden = true; }, 180);
  }, delay);
}

function showWidgetPreview(duration = 720) {
  const preview = $('#widgetLivePreview');
  if (!preview || !$('#settingsDialog').open) return;
  clearTimeout(widgetPreviewHideTimer);
  clearTimeout(widgetPreviewFinishTimer);
  renderWidgetPreview();
  preview.hidden = false;
  requestAnimationFrame(() => preview.classList.add('visible'));
  if (duration > 0) hideWidgetPreview(duration);
}

function hideWidgetPreviewImmediately() {
  clearTimeout(widgetPreviewHideTimer);
  clearTimeout(widgetPreviewFinishTimer);
  const preview = $('#widgetLivePreview');
  if (!preview) return;
  preview.classList.remove('visible');
  preview.hidden = true;
}

function keepSettingsPanelInView() {
  if (settingsWindowMode) return;
  const dialog = $('#settingsDialog');
  if (!dialog?.open) return;
  const rect = dialog.getBoundingClientRect();
  const margin = 10;
  const fallbackLeft = Math.max(margin, window.innerWidth - rect.width - 18);
  const fallbackTop = Math.max(margin, Math.min(58, window.innerHeight - rect.height - margin));
  const left = Math.max(margin, Math.min(settingsPanelPosition?.left ?? fallbackLeft, window.innerWidth - rect.width - margin));
  const top = Math.max(margin, Math.min(settingsPanelPosition?.top ?? fallbackTop, window.innerHeight - rect.height - margin));
  settingsPanelPosition = { left, top };
  dialog.style.left = `${left}px`;
  dialog.style.top = `${top}px`;
}

function syncMainWindowSize(bounds = mainWindowBounds) {
  if (!bounds) return;
  mainWindowBounds = { ...mainWindowBounds, ...bounds };
  const width = Math.round(Number(mainWindowBounds.width) || 920);
  const height = Math.round(Number(mainWindowBounds.height) || 680);
  const widthControl = $('#mainWindowWidth');
  const heightControl = $('#mainWindowHeight');
  if (widthControl) widthControl.value = String(Math.max(Number(widthControl.min), Math.min(Number(widthControl.max), width)));
  if (heightControl) heightControl.value = String(Math.max(Number(heightControl.min), Math.min(Number(heightControl.max), height)));
  if ($('#mainWindowWidthValue')) $('#mainWindowWidthValue').value = `${width} px`;
  if ($('#mainWindowHeightValue')) $('#mainWindowHeightValue').value = `${height} px`;
  $$('#mainWindowSizePresets button').forEach(button => {
    button.classList.toggle('active', Number(button.dataset.width) === width && Number(button.dataset.height) === height);
  });
}

async function resizeMainFromControls() {
  const width = Number($('#mainWindowWidth').value);
  const height = Number($('#mainWindowHeight').value);
  $('#mainWindowWidthValue').value = `${width} px`;
  $('#mainWindowHeightValue').value = `${height} px`;
  const bounds = await api.setMainWindowSize({ width, height });
  if (bounds) syncMainWindowSize(bounds);
}

function bindWindowResizeHandles() {
  const finish = async event => {
    if (!resizeGesture) return;
    const gesture = resizeGesture;
    resizeGesture = null;
    resizeMoveScheduled = false;
    try {
      if (event && gesture.handle.hasPointerCapture(event.pointerId)) gesture.handle.releasePointerCapture(event.pointerId);
    } catch { /* 指针可能已经离开窗口 */ }
    await api.resizeMove();
    const bounds = await api.resizeEnd();
    if (bounds && !settingsWindowMode) syncMainWindowSize(bounds);
  };
  $$('.window-resize-handle').forEach(handle => {
    handle.addEventListener('pointerdown', async event => {
      if (event.button !== 0 || resizeGesture) return;
      event.preventDefault();
      const started = await api.resizeStart(handle.dataset.resizeEdge);
      if (!started) return;
      resizeGesture = { handle, pointerId: event.pointerId };
      try { handle.setPointerCapture(event.pointerId); } catch { /* 保持当前窗口内拖动 */ }
    });
    handle.addEventListener('pointermove', () => {
      if (!resizeGesture || resizeMoveScheduled) return;
      resizeMoveScheduled = true;
      requestAnimationFrame(async () => {
        resizeMoveScheduled = false;
        if (resizeGesture) await api.resizeMove();
      });
    });
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
  });
  window.addEventListener('blur', () => finish());
}

function openSettingsDialog() {
  if (!settingsWindowMode) {
    api.openSettingsWindow();
    return;
  }
  closeMobileSidebar();
  syncSettingControls();
  const dialog = $('#settingsDialog');
  if (!dialog.open) dialog.show();
  requestAnimationFrame(keepSettingsPanelInView);
}

function bindSettingsPanelDrag() {
  if (settingsWindowMode) return;
  const dialog = $('#settingsDialog');
  const handle = $('#settingsDragHandle');
  handle.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('button, input, select, textarea')) return;
    const rect = dialog.getBoundingClientRect();
    settingsPanelDrag = { pointerId: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
    try { handle.setPointerCapture(event.pointerId); } catch { /* 合成事件或旧系统不支持时仍可拖动 */ }
    dialog.classList.add('moving');
    event.preventDefault();
  });
  handle.addEventListener('pointermove', event => {
    if (!settingsPanelDrag || settingsPanelDrag.pointerId !== event.pointerId) return;
    const rect = dialog.getBoundingClientRect();
    const margin = 10;
    const left = Math.max(margin, Math.min(event.clientX - settingsPanelDrag.offsetX, window.innerWidth - rect.width - margin));
    const top = Math.max(margin, Math.min(event.clientY - settingsPanelDrag.offsetY, window.innerHeight - rect.height - margin));
    settingsPanelPosition = { left, top };
    dialog.style.left = `${left}px`;
    dialog.style.top = `${top}px`;
  });
  const finishDrag = event => {
    if (!settingsPanelDrag || settingsPanelDrag.pointerId !== event.pointerId) return;
    try { if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId); } catch { /* 无需处理 */ }
    settingsPanelDrag = null;
    dialog.classList.remove('moving');
  };
  handle.addEventListener('pointerup', finishDrag);
  handle.addEventListener('pointercancel', finishDrag);
}

function syncSettingControls() {
  if (!state) return;
  const s = state.settings;
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = s.theme === 'dark' || (s.theme === 'system' && prefersDark);
  const automaticText = dark ? '#F1F1F4' : '#292B32';
  const setValue = (id, value) => {
    const control = $(`#${id}`);
    if (control && !activeSettingControls.has(id)) control.value = String(value);
  };
  setValue('backgroundColor', s.background);
  setValue('widgetBackgroundColor', s.widgetBackground || s.background);
  setValue('mainTextColor', s.mainTextColor || automaticText);
  setValue('widgetTextColor', s.widgetTextColor || automaticText);
  $('#resetMainTextColor').classList.toggle('active', !s.mainTextColor);
  $('#resetWidgetTextColor').classList.toggle('active', !s.widgetTextColor);
  setValue('backgroundOpacity', Math.round(s.backgroundOpacity * 100));
  setValue('backgroundImageOpacity', Math.round(s.backgroundImageOpacity * 100));
  setValue('windowOpacity', Math.round(s.windowOpacity * 100));
  $('#backgroundOpacityValue').value = `${Math.round(s.backgroundOpacity * 100)}%`;
  $('#backgroundImageOpacityValue').value = `${Math.round(s.backgroundImageOpacity * 100)}%`;
  $('#windowOpacityValue').value = `${Math.round(s.windowOpacity * 100)}%`;
  setValue('backgroundFit', s.backgroundFit);
  setValue('widgetBackgroundFit', s.widgetBackgroundFit);
  $('#mainBackgroundImageName').textContent = s.backgroundImageName || '未设置图片';
  $('#widgetBackgroundImageName').textContent = s.widgetBackgroundImageName || '未设置图片';
  setValue('themeSelect', s.theme);
  setValue('closeBehavior', s.closeBehavior || 'widget');
  setValue('widgetWidth', s.widgetWidth);
  setValue('widgetOpacity', Math.round(s.widgetOpacity * 100));
  setValue('widgetBackgroundOpacity', Math.round(s.widgetBackgroundOpacity * 100));
  setValue('widgetBackgroundImageOpacity', Math.round(s.widgetBackgroundImageOpacity * 100));
  $('#widgetWidthValue').value = `${s.widgetWidth} px`;
  $('#widgetOpacityValue').value = `${Math.round(s.widgetOpacity * 100)}%`;
  $('#widgetBackgroundOpacityValue').value = `${Math.round(s.widgetBackgroundOpacity * 100)}%`;
  $('#widgetBackgroundImageOpacityValue').value = `${Math.round(s.widgetBackgroundImageOpacity * 100)}%`;
  if ($('#dataDirectoryPath')) $('#dataDirectoryPath').textContent = dataDirectoryPath || '正在读取…';
  syncMainWindowSize();
  ['alwaysOnTop', 'edgeHide', 'autoLaunch', 'playSound', 'showCompleted', 'widgetDockLeft', 'widgetAutoExpand', 'rememberWidgetMode'].forEach(key => {
    const control = $(`#${key}`);
    if (control && !activeSettingControls.has(key)) control.checked = Boolean(s[key]);
  });
  renderBackgroundPresets();
}

function save(render = true, delay = 120) {
  if (render) renderAll();
  if (!$('#saveStatus').classList.contains('saving')) {
    $('#saveStatus').textContent = '保存中…';
    $('#saveStatus').classList.add('saving');
  }
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    const settingsSnapshot = { ...state.settings };
    try {
      if (settingsWindowMode) await api.saveSettings(settingsSnapshot);
      else await api.saveState(state);
      for (const key of [...dirtySettingKeys]) {
        if (Object.is(state.settings[key], settingsSnapshot[key])) dirtySettingKeys.delete(key);
      }
      $('#saveStatus').textContent = '已保存';
    } catch (error) {
      console.error('保存设置失败:', error);
      $('#saveStatus').textContent = '保存失败';
    } finally {
      $('#saveStatus').classList.remove('saving');
    }
  }, delay);
}

function markAppearanceAdjusting() {
  document.body.classList.add('appearance-adjusting');
  clearTimeout(appearanceAdjustingTimer);
  appearanceAdjustingTimer = setTimeout(() => document.body.classList.remove('appearance-adjusting'), 180);
}

function queueAppearancePreview(patch, { widgetPreview = false } = {}) {
  Object.keys(patch).forEach(key => dirtySettingKeys.add(key));
  Object.assign(state.settings, patch);
  Object.assign(pendingAppearancePatch, patch);
  pendingWidgetPreview ||= widgetPreview;
  markAppearanceAdjusting();
  if (appearanceFrame === null) {
    appearanceFrame = requestAnimationFrame(() => {
      appearanceFrame = null;
      const previewPatch = pendingAppearancePatch;
      const showPreview = pendingWidgetPreview;
      pendingAppearancePatch = {};
      pendingWidgetPreview = false;
      applyAppearanceOnly();
      api.previewAppearance(previewPatch);
      if (showPreview) showWidgetPreview(720);
    });
  }
  save(false, 360);
}

function renderAll() {
  renderNotes();
  renderHeader();
  renderTasks();
  renderWidget();
  applySettings();
}

function renderNotes() {
  const list = $('#noteList');
  list.replaceChildren();
  for (const note of state.notes) {
    const open = (note.tasks || []).filter(task => !task.done).length;
    const button = document.createElement('button');
    button.className = `note-item${note.id === state.activeNoteId ? ' active' : ''}`;
    button.dataset.noteId = note.id;
    button.innerHTML = '<span class="note-dot"></span><span class="note-label"><strong></strong><small></small></span><span class="note-badge"></span>';
    button.querySelector('.note-dot').style.background = note.color;
    button.querySelector('strong').textContent = note.title;
    button.querySelector('small').textContent = open ? `${open} 项待完成` : '全部完成';
    button.querySelector('.note-badge').textContent = open;
    list.append(button);
  }
}

function renderHeader() {
  const note = currentNote();
  if (document.activeElement !== $('#noteTitle')) $('#noteTitle').value = note.title;
  resizeTitleInput();
  const tasks = note.tasks || [];
  const done = tasks.filter(task => task.done).length;
  const totalQuantity = tasks.reduce((sum, task) => sum + Math.max(1, Number(task.quantity) || 1), 0);
  $('#noteCount').textContent = `${tasks.length} 项${totalQuantity !== tasks.length ? ` · 共 ${totalQuantity} 份` : ''}`;
  const progress = tasks.length ? Math.round(done / tasks.length * 100) : 0;
  $('#progressBar').style.width = `${progress}%`;
  $('#progressText').textContent = tasks.length ? `已完成 ${done}/${tasks.length} · ${progress}%` : '今天也要稳稳向前';
  $('.color-trigger span').style.background = quickColor;
}

function resizeTitleInput() {
  const input = $('#noteTitle');
  input.style.width = `${Math.max(5, Math.min(28, input.value.length * 1.35 + 2))}ch`;
}

function isToday(date) {
  const value = new Date(date);
  const today = new Date();
  return value.getFullYear() === today.getFullYear() && value.getMonth() === today.getMonth() && value.getDate() === today.getDate();
}

function isSameDay(first, second) {
  return first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth() && first.getDate() === second.getDate();
}

function visibleTasks() {
  return (currentNote().tasks || []).filter(task => {
    if (searchTerm && !`${task.text} ${task.details || ''}`.toLocaleLowerCase().includes(searchTerm)) return false;
    if (activeFilter === 'active' && task.done) return false;
    if (activeFilter === 'completed' && !task.done) return false;
    if (activeFilter === 'today' && (!task.reminder?.enabled || !isToday(task.reminder.at))) return false;
    if (activeFilter === 'all' && !state.settings.showCompleted && task.done) return false;
    return true;
  });
}

function reminderInfo(task) {
  if (!task.reminder?.enabled || !task.reminder.at) return null;
  const date = new Date(task.reminder.at);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  const overdue = date < now && !task.done;
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const pad = value => String(value).padStart(2, '0');
  let label;
  if (isToday(date)) label = `今天 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  else if (isSameDay(date, tomorrow)) label = `明天 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  else label = `${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return { label, overdue, soon: !overdue && date.getTime() - now.getTime() < 24 * 3600 * 1000 };
}

function widgetOpenTasks() {
  return (currentNote().tasks || []).filter(task => !task.done);
}

function selectWidgetNote(noteId, announce = true) {
  const note = state.notes.find(item => item.id === noteId);
  if (!note || note.id === state.activeNoteId) return;
  state.activeNoteId = note.id;
  widgetIndex = 0;
  quickColor = note.color || TASK_COLORS[0];
  activeFilter = 'all';
  searchTerm = '';
  $('#searchInput').value = '';
  save();
  if (announce) toast(`已切换到“${note.title}”`);
}

function cycleWidgetNote() {
  if (state.notes.length < 2) return toast('当前只有一个便签');
  const index = state.notes.findIndex(note => note.id === state.activeNoteId);
  const next = state.notes[(index + 1) % state.notes.length];
  selectWidgetNote(next.id);
}

async function openWidgetTask(task) {
  if (!task) return api.widgetAction('toggle-expand');
  await api.widgetAction('exit');
  setTimeout(() => openTaskDialog(task), 180);
}

function renderWidget() {
  if (!state) return;
  const note = currentNote();
  const allTasks = note.tasks || [];
  const openTasks = widgetOpenTasks();
  widgetIndex = openTasks.length ? Math.min(widgetIndex, openTasks.length - 1) : 0;
  const current = openTasks[widgetIndex];
  const done = allTasks.filter(task => task.done).length;
  const progress = allTasks.length ? Math.round(done / allTasks.length * 100) : 0;

  $('#widgetProgress').style.setProperty('--progress', `${progress * 3.6}deg`);
  $('#widgetProgressText').textContent = `${progress}%`;
  $('#widgetNoteName').textContent = note.title;
  $('#widgetNoteSwitchBtn').disabled = state.notes.length < 2;
  $('#widgetNoteSwitchBtn').title = state.notes.length < 2 ? '当前只有一个便签' : `当前：${note.title}，点击切换下一个便签`;
  const noteSelect = $('#widgetNoteSelect');
  noteSelect.replaceChildren(...state.notes.map(item => {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.title;
    return option;
  }));
  noteSelect.value = note.id;
  $('#widgetSummary').textContent = openTasks.length ? `${openTasks.length} 项待完成 · ${progress}%` : '今日事项已完成';
  $('#widgetAccent').style.background = note.color;
  $('#widgetCurrentText').textContent = current?.text || '暂无待办，点开添加一件小事';
  $('#widgetPosition').textContent = openTasks.length ? `${widgetIndex + 1}/${openTasks.length}` : '0/0';
  $('#widgetCompleteBtn').disabled = !current;
  $('#widgetPrevBtn').disabled = openTasks.length < 2;
  $('#widgetNextBtn').disabled = openTasks.length < 2;
  const expandsUp = widgetUiState.expandDirection === 'up';
  const expandIcon = widgetUiState.expanded
    ? (expandsUp ? 'chevron-down' : 'chevron-up')
    : (expandsUp ? 'chevron-up' : 'chevron-down');
  $('#widgetExpandBtn').innerHTML = ICONS[expandIcon];
  $('#widgetExpandBtn').title = widgetUiState.expanded ? '收起' : '展开';
  $('#widgetCollapseBtn').innerHTML = ICONS[expandsUp ? 'chevron-down' : 'chevron-up'];

  const list = $('#widgetList');
  list.replaceChildren();
  openTasks.forEach((task, index) => {
    const item = document.createElement('div');
    item.className = `widget-item${index === widgetIndex ? ' active' : ''}`;
    item.dataset.taskId = task.id;
    item.style.setProperty('--item-color', task.color || note.color);
    item.innerHTML = '<button class="widget-item-check" aria-label="完成事项" data-icon="check"></button><button class="widget-item-main"><strong></strong><small></small></button><span class="widget-item-quantity"></span>';
    setIcons(item);
    item.querySelector('strong').textContent = task.text;
    const reminder = reminderInfo(task);
    const secondary = reminder?.label || task.details || (task.priority === 'high' ? '重要事项' : '');
    const small = item.querySelector('small');
    small.textContent = secondary;
    small.hidden = !secondary;
    const quantity = item.querySelector('.widget-item-quantity');
    quantity.textContent = Number(task.quantity) > 1 ? `×${task.quantity}` : '';
    list.append(item);
  });
  list.hidden = openTasks.length === 0;
  $('#widgetEmpty').hidden = openTasks.length > 0;
}

function renderTasks() {
  const list = $('#taskList');
  list.replaceChildren();
  const tasks = visibleTasks();
  for (const task of tasks) list.append(createTaskCard(task));
  $('#emptyState').hidden = tasks.length > 0;
  $('#taskList').hidden = tasks.length === 0;
  $$('#filterBar .filter').forEach(button => button.classList.toggle('active', button.dataset.filter === activeFilter));
}

function createTaskCard(task) {
  const card = document.createElement('article');
  card.className = `task-card${task.done ? ' done' : ''}`;
  card.dataset.taskId = task.id;
  card.draggable = false;
  card.style.setProperty('--task-color', task.color || TASK_COLORS[0]);
  card.innerHTML = `
    <span class="drag-handle" data-icon="grip" title="拖动排序"></span>
    <label class="check-wrap"><input type="checkbox" aria-label="完成待办"><span class="custom-check" data-icon="check"></span></label>
    <div class="task-main"><strong class="task-text"></strong><div class="task-details" hidden></div><div class="task-meta"></div></div>
    <div class="task-actions"><button class="icon-btn duplicate-task" title="复制" aria-label="复制待办" data-icon="copy"></button><button class="icon-btn edit-task" title="编辑" aria-label="编辑待办" data-icon="more"></button></div>`;
  setIcons(card);
  card.querySelector('.drag-handle').draggable = true;
  card.querySelector('input[type="checkbox"]').checked = task.done;
  card.querySelector('.task-text').textContent = task.text;
  if (task.details) {
    const details = card.querySelector('.task-details');
    details.hidden = false;
    details.textContent = task.details;
  }
  const meta = card.querySelector('.task-meta');
  const reminder = reminderInfo(task);
  if (reminder) addChip(meta, ICONS.calendar, reminder.label, reminder.overdue ? 'overdue' : reminder.soon ? 'due-soon' : '');
  if (task.reminder?.enabled && task.reminder.repeat !== 'none') addChip(meta, '', REPEAT_LABELS[task.reminder.repeat]);
  if (task.priority === 'high') addChip(meta, ICONS.flag, PRIORITY_LABELS.high, 'high');
  if (task.priority === 'low') addChip(meta, '', PRIORITY_LABELS.low);
  if (Number(task.quantity) > 1) addChip(meta, '', `× ${task.quantity}`);
  if (!meta.children.length) meta.remove();
  return card;
}

function addChip(container, icon, text, extra = '') {
  const chip = document.createElement('span');
  chip.className = `meta-chip ${extra}`.trim();
  if (icon) chip.insertAdjacentHTML('beforeend', icon);
  chip.append(document.createTextNode(text));
  container.append(chip);
}

function showPalette(anchor, current, callback) {
  const palette = $('#palette');
  palette.replaceChildren();
  paletteCallback = callback;
  for (const color of TASK_COLORS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.style.setProperty('--swatch', color);
    button.dataset.color = color;
    button.classList.toggle('active', color.toLowerCase() === String(current).toLowerCase());
    button.setAttribute('aria-label', `选择颜色 ${color}`);
    palette.append(button);
  }
  palette.hidden = false;
  const rect = anchor.getBoundingClientRect();
  const width = 148;
  palette.style.left = `${Math.min(window.innerWidth - width - 12, Math.max(12, rect.left))}px`;
  palette.style.top = `${Math.min(window.innerHeight - 92, rect.bottom + 6)}px`;
}

function renderColorOptions(container, selected, setter) {
  container.replaceChildren();
  for (const color of TASK_COLORS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.style.setProperty('--swatch', color);
    button.classList.toggle('active', color === selected);
    button.addEventListener('click', () => {
      setter(color);
      renderColorOptions(container, color, setter);
    });
    container.append(button);
  }
}

function defaultReminderTime() {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function openTaskDialog(task = null, options = {}) {
  editingTaskId = task?.id || null;
  selectedTaskColor = task?.color || quickColor;
  $('#taskDialogTitle').textContent = task ? '编辑待办' : '添加待办';
  $('#taskText').value = task?.text || options.text || '';
  $('#taskDetails').value = task?.details || '';
  $('#taskPriority').value = task?.priority || 'normal';
  $('#taskQuantity').value = task?.quantity || 1;
  const reminderEnabled = task?.reminder?.enabled || options.reminder || false;
  $('#reminderEnabled').checked = reminderEnabled;
  $('#reminderAt').value = task?.reminder?.at || defaultReminderTime();
  $('#reminderRepeat').value = task?.reminder?.repeat || 'none';
  $('#reminderFields').hidden = !reminderEnabled;
  $('#deleteTaskBtn').hidden = !task;
  renderColorOptions($('#taskColorOptions'), selectedTaskColor, color => { selectedTaskColor = color; });
  $('#taskDialog').showModal();
  setTimeout(() => $('#taskText').focus(), 30);
}

function removeTask(taskId, allowUndo = true) {
  const note = currentNote();
  const index = note.tasks.findIndex(task => task.id === taskId);
  if (index < 0) return;
  const [task] = note.tasks.splice(index, 1);
  if (allowUndo) {
    deletedSnapshot = { noteId: note.id, task, index };
    toast('已删除待办', '撤销', () => {
      const target = state.notes.find(item => item.id === deletedSnapshot.noteId);
      if (target) target.tasks.splice(deletedSnapshot.index, 0, deletedSnapshot.task);
      deletedSnapshot = null;
      save();
    });
  }
  save();
}

function duplicateTask(taskId) {
  const note = currentNote();
  const index = note.tasks.findIndex(task => task.id === taskId);
  if (index < 0) return;
  const original = note.tasks[index];
  const copy = JSON.parse(JSON.stringify(original));
  copy.id = uid('task');
  copy.text = `${copy.text}（副本）`;
  copy.done = false;
  copy.createdAt = Date.now();
  if (copy.reminder) { copy.reminder.enabled = false; copy.reminder.lastNotifiedAt = ''; }
  note.tasks.splice(index + 1, 0, copy);
  save();
  toast('已复制待办');
}

function openNoteDialog(mode = 'create') {
  noteDialogMode = mode;
  const note = currentNote();
  $('#noteDialogTitle').textContent = mode === 'create' ? '新建便签' : '重命名便签';
  $('#newNoteTitle').value = mode === 'create' ? '' : note.title;
  selectedNoteColor = mode === 'create' ? TASK_COLORS[state.notes.length % TASK_COLORS.length] : note.color;
  renderColorOptions($('#noteColorOptions'), selectedNoteColor, color => { selectedNoteColor = color; });
  $('#noteDialog').showModal();
  setTimeout(() => $('#newNoteTitle').focus(), 30);
}

function renderBackgroundPresets() {
  renderBackgroundPresetGroup('#backgroundPresets', 'background');
  renderBackgroundPresetGroup('#widgetBackgroundPresets', 'widgetBackground');
}

function renderBackgroundPresetGroup(selector, settingKey) {
  const container = $(selector);
  if (!container) return;
  container.replaceChildren();
  for (const color of BACKGROUNDS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.style.setProperty('--swatch', color);
    button.classList.toggle('active', color.toLowerCase() === String(state.settings[settingKey]).toLowerCase());
    button.addEventListener('click', () => {
      queueAppearancePreview({ [settingKey]: color }, { widgetPreview: settingKey === 'widgetBackground' });
      renderBackgroundPresets();
    });
    container.append(button);
  }
}

async function chooseBackground(target) {
  const result = await api.chooseBackgroundImage(target);
  if (result.canceled) return;
  if (result.error) return toast(result.error);
  const isWidget = target === 'widget';
  const pathKey = isWidget ? 'widgetBackgroundImagePath' : 'backgroundImagePath';
  const nameKey = isWidget ? 'widgetBackgroundImageName' : 'backgroundImageName';
  state.settings[pathKey] = result.path;
  state.settings[nameKey] = result.name;
  backgroundImageData[target] = result.dataUrl;
  applySettings();
  save(false);
  toast(`${isWidget ? '胶囊' : '主页面'}背景图片已更新`);
  if (isWidget) showWidgetPreview(1200);
}

async function clearBackground(target) {
  await api.clearBackgroundImage(target);
  const isWidget = target === 'widget';
  state.settings[isWidget ? 'widgetBackgroundImagePath' : 'backgroundImagePath'] = '';
  state.settings[isWidget ? 'widgetBackgroundImageName' : 'backgroundImageName'] = '';
  backgroundImageData[target] = '';
  applySettings();
  save(false);
  if (isWidget) showWidgetPreview(900);
}

async function loadBackgroundImages() {
  const sequence = ++backgroundLoadSequence;
  const [mainImage, widgetImage] = await Promise.all([
    api.loadBackgroundImage('main'),
    api.loadBackgroundImage('widget')
  ]);
  if (sequence !== backgroundLoadSequence) return false;
  backgroundImageData.main = mainImage?.dataUrl || '';
  backgroundImageData.widget = widgetImage?.dataUrl || '';
  return true;
}

function bindSettingsControlGuards() {
  $$('.settings-scroll input, .settings-scroll select').forEach(control => {
    if (!control.id) return;
    const begin = () => activeSettingControls.add(control.id);
    const finish = () => {
      activeSettingControls.delete(control.id);
      requestAnimationFrame(syncSettingControls);
    };
    control.addEventListener('pointerdown', begin);
    control.addEventListener('focus', begin);
    control.addEventListener('change', finish);
    control.addEventListener('pointercancel', finish);
    control.addEventListener('blur', finish);
  });
}

async function changeSystemSetting(key, value) {
  state.settings[key] = value;
  applySettings();
  try {
    const actual = await api.setSetting(key, value);
    state.settings[key] = actual;
    applySettings();
    save(key === 'showCompleted');
    if (key === 'autoLaunch') toast(actual ? '已开启开机自动启动' : '已关闭开机自动启动');
    if (key === 'edgeHide') toast(actual ? '已开启贴边隐藏，移入或点击边缘标签即可唤出' : '已关闭贴边隐藏');
  } catch (error) {
    state.settings[key] = !value;
    applySettings();
    toast(key === 'autoLaunch' ? '开机自动启动设置失败，请重新尝试' : '设置未能保存，请重新尝试');
  }
}

function toast(message, actionLabel = '', action = null, duration = 3500) {
  if (widgetUiState.enabled && !settingsWindowMode) return;
  const item = document.createElement('div');
  item.className = 'toast';
  const text = document.createElement('span');
  text.textContent = message;
  item.append(text);
  if (actionLabel && action) {
    const button = document.createElement('button');
    button.textContent = actionLabel;
    button.addEventListener('click', () => { action(); item.remove(); });
    item.append(button);
  }
  $('#toastRegion').append(item);
  setTimeout(() => item.remove(), duration);
}

function hidePopovers() {
  $('#noteMenu').hidden = true;
  $('#palette').hidden = true;
}

function cancelWidgetHoverTimer() {
  widgetHoverSequence += 1;
  clearTimeout(widgetHoverTimer);
  widgetHoverTimer = null;
}

function scheduleWidgetAutoCollapse(delay = 520) {
  cancelWidgetHoverTimer();
  if (widgetDragActive || !state.settings.widgetAutoExpand || !widgetUiState.expanded) return;
  const sequence = widgetHoverSequence;
  const verifyOutside = async () => {
    if (sequence !== widgetHoverSequence || widgetDragActive || !state.settings.widgetAutoExpand || !widgetUiState.expanded) return;
    let pointerInside = $('#widget').matches(':hover');
    try {
      pointerInside ||= await api.isCursorInsideWidget();
    } catch { /* 短暂的窗口切换失败时宁可保持展开，避免误收起。 */
      pointerInside = true;
    }
    if (sequence !== widgetHoverSequence) return;
    if (pointerInside) {
      widgetHoverTimer = setTimeout(verifyOutside, 260);
      return;
    }
    api.widgetAction('collapse');
  };
  widgetHoverTimer = setTimeout(verifyOutside, delay);
}

function bindEvents() {
  bindSettingsPanelDrag();
  bindWindowResizeHandles();
  bindSettingsControlGuards();
  window.addEventListener('resize', keepSettingsPanelInView);
  document.addEventListener('click', event => {
    if (!event.target.closest('#noteMenu') && !event.target.closest('#noteMenuBtn')) $('#noteMenu').hidden = true;
    if (!event.target.closest('#palette') && !event.target.closest('#quickColorBtn')) $('#palette').hidden = true;
  });

  $$('[data-window-action]').forEach(button => button.addEventListener('click', () => api.windowAction(button.dataset.windowAction)));
  $$('[data-close-dialog]').forEach(button => button.addEventListener('click', () => {
    if (settingsWindowMode && button.dataset.closeDialog === 'settingsDialog') api.settingsWindowAction('close');
    else $(`#${button.dataset.closeDialog}`).close();
  }));
  $('#widget').addEventListener('pointerdown', event => {
    cancelWidgetHoverTimer();
    const dragSurface = event.target.closest('.drag-region') || !event.target.closest('button, input, select, textarea, .no-drag');
    if (dragSurface) {
      widgetDragActive = true;
      widgetHoverSuppressedUntil = Date.now() + 1200;
      api.widgetAction('begin-drag');
    }
  });
  const finishWidgetDrag = () => {
    if (!widgetDragActive) return;
    widgetDragActive = false;
    cancelWidgetHoverTimer();
    widgetHoverSuppressedUntil = Date.now() + 520;
    api.widgetAction('end-drag');
  };
  window.addEventListener('pointerup', finishWidgetDrag);
  window.addEventListener('mouseup', finishWidgetDrag);
  window.addEventListener('pointercancel', finishWidgetDrag);
  $('#widgetBtn').addEventListener('click', () => api.widgetAction('enter'));
  $('#widgetExpandBtn').addEventListener('click', () => api.widgetAction('toggle-expand'));
  $('#widgetNoteSwitchBtn').addEventListener('click', cycleWidgetNote);
  $('#widgetNoteSelect').addEventListener('change', () => selectWidgetNote($('#widgetNoteSelect').value));
  $('#widgetCurrentBtn').addEventListener('click', () => openWidgetTask(widgetOpenTasks()[widgetIndex]));
  $('#widgetCollapseBtn').addEventListener('click', () => api.widgetAction('collapse'));
  $('#widgetFullBtn').addEventListener('click', () => api.widgetAction('exit'));
  $('#widgetHideBtn').addEventListener('click', () => api.widgetAction('hide'));
  $('#widgetSettingsBtn').addEventListener('click', async () => {
    await api.widgetAction('exit');
    setTimeout(openSettingsDialog, 180);
  });
  $('#widgetPrevBtn').addEventListener('click', () => {
    const tasks = widgetOpenTasks();
    if (tasks.length > 1) { widgetIndex = (widgetIndex - 1 + tasks.length) % tasks.length; renderWidget(); }
  });
  $('#widgetNextBtn').addEventListener('click', () => {
    const tasks = widgetOpenTasks();
    if (tasks.length > 1) { widgetIndex = (widgetIndex + 1) % tasks.length; renderWidget(); }
  });
  $('#widgetCompleteBtn').addEventListener('click', () => {
    const task = widgetOpenTasks()[widgetIndex];
    if (task) { task.done = true; save(); }
  });
  $('#widgetList').addEventListener('click', event => {
    const item = event.target.closest('.widget-item');
    if (!item) return;
    const tasks = widgetOpenTasks();
    const index = tasks.findIndex(task => task.id === item.dataset.taskId);
    if (event.target.closest('.widget-item-check')) {
      const task = currentNote().tasks.find(candidate => candidate.id === item.dataset.taskId);
      if (task) { task.done = true; widgetIndex = Math.max(0, Math.min(widgetIndex, tasks.length - 2)); save(); }
    } else if (index >= 0) openWidgetTask(tasks[index]);
  });
  $('#widgetAddForm').addEventListener('submit', event => {
    event.preventDefault();
    const text = $('#widgetAddInput').value.trim();
    if (!text) return;
    currentNote().tasks.unshift({ id: uid('task'), text, details: '', done: false, color: currentNote().color, priority: 'normal', quantity: 1, createdAt: Date.now(), reminder: { enabled: false, at: '', repeat: 'none', lastNotifiedAt: '' } });
    widgetIndex = 0;
    $('#widgetAddInput').value = '';
    save();
  });
  $('#widget').addEventListener('mouseenter', () => {
    cancelWidgetHoverTimer();
    if (state.settings.widgetAutoExpand && widgetUiState.enabled && !widgetUiState.expanded) {
      const delay = Math.max(90, widgetHoverSuppressedUntil - Date.now() + 20);
      const sequence = widgetHoverSequence;
      widgetHoverTimer = setTimeout(() => {
        if (sequence === widgetHoverSequence && Date.now() >= widgetHoverSuppressedUntil) api.widgetAction('expand');
      }, delay);
    }
  });
  $('#widget').addEventListener('mouseleave', () => {
    scheduleWidgetAutoCollapse();
  });

  $('#noteList').addEventListener('click', event => {
    const item = event.target.closest('.note-item');
    if (!item) return;
    state.activeNoteId = item.dataset.noteId;
    activeFilter = 'all'; searchTerm = ''; $('#searchInput').value = '';
    closeMobileSidebar();
    save();
  });

  $('#newNoteBtn').addEventListener('click', () => openNoteDialog('create'));
  $('#noteForm').addEventListener('submit', event => {
    event.preventDefault();
    const title = $('#newNoteTitle').value.trim();
    if (!title) return;
    if (noteDialogMode === 'create') {
      const note = { id: uid('note'), title, color: selectedNoteColor, createdAt: Date.now(), tasks: [] };
      state.notes.push(note); state.activeNoteId = note.id;
    } else {
      currentNote().title = title; currentNote().color = selectedNoteColor;
    }
    $('#noteDialog').close();
    save();
  });

  $('#noteTitle').addEventListener('input', () => {
    currentNote().title = $('#noteTitle').value.slice(0, 40) || '未命名便签';
    resizeTitleInput(); renderNotes(); save(false);
  });
  $('#noteTitle').addEventListener('blur', () => { if (!$('#noteTitle').value.trim()) { currentNote().title = '未命名便签'; renderAll(); save(false); } });

  $('#quickAddForm').addEventListener('submit', event => {
    event.preventDefault();
    const text = $('#quickAddInput').value.trim();
    if (!text) { $('#quickAddInput').focus(); return; }
    currentNote().tasks.unshift({ id: uid('task'), text, details: '', done: false, color: quickColor, priority: 'normal', quantity: 1, createdAt: Date.now(), reminder: { enabled: false, at: '', repeat: 'none', lastNotifiedAt: '' } });
    $('#quickAddInput').value = '';
    activeFilter = 'all';
    save();
  });
  $('#quickColorBtn').addEventListener('click', event => {
    event.stopPropagation();
    showPalette($('#quickColorBtn'), quickColor, color => { quickColor = color; renderHeader(); });
  });
  $('#palette').addEventListener('click', event => {
    const button = event.target.closest('[data-color]');
    if (!button || !paletteCallback) return;
    paletteCallback(button.dataset.color); $('#palette').hidden = true;
  });
  $('#quickReminderBtn').addEventListener('click', () => openTaskDialog(null, { text: $('#quickAddInput').value.trim(), reminder: true }));

  $('#reminderEnabled').addEventListener('change', () => { $('#reminderFields').hidden = !$('#reminderEnabled').checked; });
  $('#taskForm').addEventListener('submit', event => {
    event.preventDefault();
    const text = $('#taskText').value.trim();
    if (!text) { toast('请先填写事项名称，提醒才会保存'); $('#taskText').focus(); return; }
    const enabled = $('#reminderEnabled').checked;
    const at = $('#reminderAt').value;
    if (enabled && !at) { toast('请选择提醒时间'); $('#reminderAt').focus(); return; }
    if (enabled && !Number.isFinite(new Date(at).getTime())) { toast('提醒时间无效，请重新选择'); $('#reminderAt').focus(); return; }
    const old = editingTaskId ? currentNote().tasks.find(task => task.id === editingTaskId) : null;
    const task = old || { id: uid('task'), done: false, createdAt: Date.now() };
    task.text = text;
    task.details = $('#taskDetails').value.trim();
    task.color = selectedTaskColor;
    task.priority = $('#taskPriority').value;
    task.quantity = Math.max(1, Math.min(999, Number($('#taskQuantity').value) || 1));
    task.reminder = {
      enabled,
      at: enabled ? at : '',
      repeat: enabled ? $('#reminderRepeat').value : 'none',
      lastNotifiedAt: old?.reminder?.at === at ? (old.reminder.lastNotifiedAt || '') : ''
    };
    if (!old) currentNote().tasks.unshift(task);
    $('#taskDialog').close();
    if (!old) $('#quickAddInput').value = '';
    save();
    if (enabled) {
      const dueLabel = new Date(at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      toast(`提醒已保存：${dueLabel}`, '', null, 5200);
    }
  });
  $('#deleteTaskBtn').addEventListener('click', () => {
    const id = editingTaskId; $('#taskDialog').close(); removeTask(id);
  });

  $('#taskList').addEventListener('change', event => {
    const checkbox = event.target.closest('input[type="checkbox"]');
    if (!checkbox) return;
    const task = currentNote().tasks.find(item => item.id === checkbox.closest('.task-card').dataset.taskId);
    if (task) { task.done = checkbox.checked; save(); }
  });
  $('#taskList').addEventListener('click', event => {
    const card = event.target.closest('.task-card');
    if (!card) return;
    if (event.target.closest('.edit-task')) openTaskDialog(currentNote().tasks.find(task => task.id === card.dataset.taskId));
    if (event.target.closest('.duplicate-task')) duplicateTask(card.dataset.taskId);
  });
  $('#taskList').addEventListener('dblclick', event => {
    if (event.target.closest('button, input, label, .drag-handle')) return;
    const card = event.target.closest('.task-card');
    if (card) openTaskDialog(currentNote().tasks.find(task => task.id === card.dataset.taskId));
  });

  $('#taskList').addEventListener('dragstart', event => {
    const card = event.target.closest('.task-card');
    if (!card || !event.target.closest('.drag-handle')) { event.preventDefault(); return; }
    draggedTaskId = card.dataset.taskId; card.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', draggedTaskId);
  });
  $('#taskList').addEventListener('dragover', event => {
    const card = event.target.closest('.task-card');
    if (!card || card.dataset.taskId === draggedTaskId) return;
    event.preventDefault();
    $$('.task-card').forEach(item => item.classList.remove('drag-over-top', 'drag-over-bottom'));
    card.classList.add(event.clientY < card.getBoundingClientRect().top + card.offsetHeight / 2 ? 'drag-over-top' : 'drag-over-bottom');
  });
  $('#taskList').addEventListener('drop', event => {
    event.preventDefault();
    const target = event.target.closest('.task-card');
    if (!target || !draggedTaskId || target.dataset.taskId === draggedTaskId) return;
    const tasks = currentNote().tasks;
    const from = tasks.findIndex(task => task.id === draggedTaskId);
    const [moved] = tasks.splice(from, 1);
    let to = tasks.findIndex(task => task.id === target.dataset.taskId);
    if (event.clientY >= target.getBoundingClientRect().top + target.offsetHeight / 2) to += 1;
    tasks.splice(to, 0, moved); save();
  });
  $('#taskList').addEventListener('dragend', () => {
    draggedTaskId = null; $$('.task-card').forEach(item => item.classList.remove('dragging', 'drag-over-top', 'drag-over-bottom'));
  });

  $('#filterBar').addEventListener('click', event => {
    const button = event.target.closest('[data-filter]'); if (!button) return;
    activeFilter = button.dataset.filter; renderTasks();
  });
  $('#searchBtn').addEventListener('click', () => { $('#searchRow').hidden = false; $('#searchInput').focus(); });
  $('#searchInput').addEventListener('input', () => { searchTerm = $('#searchInput').value.trim().toLocaleLowerCase(); renderTasks(); });
  $('#clearSearchBtn').addEventListener('click', () => { searchTerm = ''; $('#searchInput').value = ''; $('#searchRow').hidden = true; renderTasks(); });

  $('#noteMenuBtn').addEventListener('click', event => {
    event.stopPropagation();
    const menu = $('#noteMenu'); menu.hidden = !menu.hidden;
    const rect = event.currentTarget.getBoundingClientRect();
    menu.style.left = `${Math.max(10, rect.right - 190)}px`; menu.style.top = `${rect.bottom + 5}px`;
  });
  $('#noteMenu').addEventListener('click', event => {
    const button = event.target.closest('[data-note-action]'); if (!button) return;
    const action = button.dataset.noteAction; $('#noteMenu').hidden = true;
    if (action === 'rename') openNoteDialog('rename');
    if (action === 'color') showPalette($('#noteMenuBtn'), currentNote().color, color => { currentNote().color = color; save(); });
    if (action === 'complete') { currentNote().tasks.forEach(task => { task.done = true; }); save(); toast('已全部标为完成'); }
    if (action === 'clear') {
      const removed = currentNote().tasks.filter(task => task.done);
      if (!removed.length) return toast('没有已完成事项');
      if (confirm(`清理 ${removed.length} 条已完成事项？`)) { currentNote().tasks = currentNote().tasks.filter(task => !task.done); save(); toast(`已清理 ${removed.length} 条事项`); }
    }
    if (action === 'delete') {
      if (state.notes.length === 1) return toast('至少保留一个便签');
      if (confirm(`确定删除“${currentNote().title}”及其中全部事项吗？`)) {
        const index = state.notes.findIndex(note => note.id === state.activeNoteId);
        state.notes.splice(index, 1); state.activeNoteId = state.notes[Math.max(0, index - 1)].id; save();
      }
    }
  });

  $('#pinBtn').addEventListener('click', () => changeSystemSetting('alwaysOnTop', !state.settings.alwaysOnTop));
  $('#edgeBtn').addEventListener('click', () => changeSystemSetting('edgeHide', !state.settings.edgeHide));
  $('#settingsBtn').addEventListener('click', openSettingsDialog);

  $('#backgroundColor').addEventListener('input', () => queueAppearancePreview({ background: $('#backgroundColor').value }));
  $('#widgetBackgroundColor').addEventListener('input', () => queueAppearancePreview({ widgetBackground: $('#widgetBackgroundColor').value }, { widgetPreview: true }));
  $('#mainTextColor').addEventListener('input', () => queueAppearancePreview({ mainTextColor: $('#mainTextColor').value }));
  $('#resetMainTextColor').addEventListener('click', () => queueAppearancePreview({ mainTextColor: '' }));
  $('#widgetTextColor').addEventListener('input', () => queueAppearancePreview({ widgetTextColor: $('#widgetTextColor').value }, { widgetPreview: true }));
  $('#resetWidgetTextColor').addEventListener('click', () => queueAppearancePreview({ widgetTextColor: '' }, { widgetPreview: true }));
  $('#backgroundOpacity').addEventListener('input', () => {
    const value = Number($('#backgroundOpacity').value) / 100;
    $('#backgroundOpacityValue').value = `${$('#backgroundOpacity').value}%`;
    queueAppearancePreview({ backgroundOpacity: value });
  });
  $('#backgroundImageOpacity').addEventListener('input', () => {
    const value = Number($('#backgroundImageOpacity').value) / 100;
    $('#backgroundImageOpacityValue').value = `${$('#backgroundImageOpacity').value}%`;
    queueAppearancePreview({ backgroundImageOpacity: value });
  });
  $('#windowOpacity').addEventListener('input', () => {
    const value = Number($('#windowOpacity').value) / 100;
    $('#windowOpacityValue').value = `${$('#windowOpacity').value}%`;
    queueAppearancePreview({ windowOpacity: value });
  });
  $('#backgroundFit').addEventListener('change', () => queueAppearancePreview({ backgroundFit: $('#backgroundFit').value }));
  $('#widgetBackgroundFit').addEventListener('change', () => queueAppearancePreview({ widgetBackgroundFit: $('#widgetBackgroundFit').value }, { widgetPreview: true }));
  $('#widgetBackgroundOpacity').addEventListener('input', () => {
    const value = Number($('#widgetBackgroundOpacity').value) / 100;
    $('#widgetBackgroundOpacityValue').value = `${$('#widgetBackgroundOpacity').value}%`;
    queueAppearancePreview({ widgetBackgroundOpacity: value }, { widgetPreview: true });
  });
  $('#widgetBackgroundImageOpacity').addEventListener('input', () => {
    const value = Number($('#widgetBackgroundImageOpacity').value) / 100;
    $('#widgetBackgroundImageOpacityValue').value = `${$('#widgetBackgroundImageOpacity').value}%`;
    queueAppearancePreview({ widgetBackgroundImageOpacity: value }, { widgetPreview: true });
  });
  $('#widgetWidth').addEventListener('input', () => {
    const value = Number($('#widgetWidth').value);
    $('#widgetWidthValue').value = `${value} px`;
    queueAppearancePreview({ widgetWidth: value }, { widgetPreview: true });
  });
  $('#widgetOpacity').addEventListener('input', () => {
    const value = Number($('#widgetOpacity').value) / 100;
    $('#widgetOpacityValue').value = `${$('#widgetOpacity').value}%`;
    queueAppearancePreview({ widgetOpacity: value }, { widgetPreview: true });
  });
  ['widgetBackgroundColor', 'widgetTextColor', 'widgetBackgroundOpacity', 'widgetBackgroundImageOpacity', 'widgetWidth', 'widgetOpacity'].forEach(id => {
    const control = $(`#${id}`);
    control.addEventListener('pointerdown', () => showWidgetPreview(0));
    control.addEventListener('input', () => showWidgetPreview(720));
    control.addEventListener('pointerup', () => hideWidgetPreview(420));
    control.addEventListener('change', () => hideWidgetPreview(420));
  });
  $('#widgetBackgroundFit').addEventListener('change', () => showWidgetPreview(900));
  $('#chooseMainBackground').addEventListener('click', () => chooseBackground('main'));
  $('#clearMainBackground').addEventListener('click', () => clearBackground('main'));
  $('#chooseWidgetBackground').addEventListener('click', () => chooseBackground('widget'));
  $('#clearWidgetBackground').addEventListener('click', () => clearBackground('widget'));
  $('#settingsDialog').addEventListener('close', hideWidgetPreviewImmediately);
  $('#settingsMinimizeBtn').addEventListener('click', () => {
    hideWidgetPreviewImmediately();
    api.settingsWindowAction('minimize');
  });
  $('#settingsMaximizeBtn').addEventListener('click', () => api.settingsWindowAction('maximize'));
  $('#mainWindowWidth').addEventListener('input', resizeMainFromControls);
  $('#mainWindowHeight').addEventListener('input', resizeMainFromControls);
  $('#mainWindowSizePresets').addEventListener('click', async event => {
    const button = event.target.closest('button[data-width][data-height]');
    if (!button) return;
    const bounds = await api.setMainWindowSize({ width: Number(button.dataset.width), height: Number(button.dataset.height) });
    if (bounds) syncMainWindowSize(bounds);
  });
  $('#closeBehavior').addEventListener('change', () => changeSystemSetting('closeBehavior', $('#closeBehavior').value));
  $('#themeSelect').addEventListener('change', () => changeSystemSetting('theme', $('#themeSelect').value));
  ['alwaysOnTop', 'edgeHide', 'autoLaunch', 'playSound', 'showCompleted', 'widgetDockLeft', 'widgetAutoExpand', 'rememberWidgetMode'].forEach(key => {
    $(`#${key}`).addEventListener('change', () => changeSystemSetting(key, $(`#${key}`).checked));
  });
  $('#testReminderBtn').addEventListener('click', async () => {
    try {
      const result = await api.testReminder();
      if (!result?.delivered) toast('测试提醒未能发送');
    } catch { toast('测试提醒发送失败，请重新尝试'); }
  });
  $('#chooseDataDirectoryBtn').addEventListener('click', async () => {
    clearTimeout(saveTimeout);
    try {
      if (settingsWindowMode) await api.saveSettings(state.settings);
      else await api.saveState(state);
      const result = await api.chooseDataDirectory();
      if (result.canceled) return;
      if (result.error) return toast(result.error);
      dataDirectoryPath = result.path;
      if (result.state) state = result.state;
      await loadBackgroundImages();
      renderAll();
      if (result.unchanged) toast('当前已经使用这个数据位置');
      else if (result.mode === 'loaded') toast('已切换并读取该位置的已有数据');
      else toast('默认数据位置已更改，原目录仍保留为备份');
    } catch { toast('更改数据位置失败，原数据未受影响'); }
  });
  $('#exportBtn').addEventListener('click', async () => {
    const result = await api.exportData(); if (!result.canceled) toast('备份已导出');
  });
  $('#importBtn').addEventListener('click', async () => {
    if (!confirm('导入将替换当前数据，建议先导出备份。继续吗？')) return;
    try {
      const result = await api.importData();
      if (!result.canceled) {
        state = result.state;
        await loadBackgroundImages();
        if (!settingsWindowMode) $('#settingsDialog').close();
        renderAll();
        toast('数据已成功恢复');
      }
    } catch { toast('备份文件无效，未导入'); }
  });

  $('#mobileMenuBtn').addEventListener('click', openMobileSidebar);
  $('#mobileBackdrop').addEventListener('click', closeMobileSidebar);
  $('#edgeHandle').addEventListener('mouseenter', () => api.edgeHover());
  $('#edgeHandle').addEventListener('pointerdown', () => api.edgeHover());
  $('#edgeHandle').addEventListener('click', () => api.edgeHover());
  document.body.addEventListener('mouseleave', () => { if (!widgetUiState.enabled && state.settings.edgeHide) api.edgeLeave(); });

  document.addEventListener('keydown', async event => {
    if (settingsWindowMode && event.key === 'Escape') {
      event.preventDefault();
      api.settingsWindowAction('close');
      return;
    }
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.shiftKey && event.key.toLowerCase() === 'm') { event.preventDefault(); api.widgetAction(widgetUiState.enabled ? 'exit' : 'enter'); }
    else if (modifier && event.key.toLowerCase() === 'n' && event.shiftKey) {
      event.preventDefault();
      if (widgetUiState.enabled) await api.widgetAction('exit');
      setTimeout(() => openNoteDialog('create'), 120);
    }
    else if (modifier && event.key.toLowerCase() === 'n') {
      event.preventDefault();
      if (widgetUiState.enabled) await api.widgetAction('exit');
      setTimeout(() => openTaskDialog(), 120);
    }
    else if (modifier && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      if (widgetUiState.enabled) await api.widgetAction('exit');
      setTimeout(() => { $('#searchRow').hidden = false; $('#searchInput').focus(); }, 120);
    }
    else if (modifier && event.key === ',') {
      event.preventDefault();
      if (widgetUiState.enabled) await api.widgetAction('exit');
      setTimeout(openSettingsDialog, 120);
    }
    else if (event.key === 'Escape' && widgetUiState.expanded) { api.widgetAction('collapse'); }
    else if (event.key === 'Escape') { hidePopovers(); closeMobileSidebar(); }
  });
}

function openMobileSidebar() { $('#sidebar').classList.add('mobile-open'); $('#mobileBackdrop').hidden = false; }
function closeMobileSidebar() { $('#sidebar').classList.remove('mobile-open'); $('#mobileBackdrop').hidden = true; }

async function init() {
  document.body.classList.toggle('settings-window', settingsWindowMode);
  setIcons();
  state = await api.loadState();
  dataDirectoryPath = await api.getDataDirectory();
  mainWindowBounds = await api.getMainWindowBounds() || mainWindowBounds;
  await loadBackgroundImages();
  quickColor = currentNote().color || TASK_COLORS[0];
  bindEvents();
  renderAll();
  if (settingsWindowMode) openSettingsDialog();
  api.onQuickAdd(async () => {
    if (widgetUiState.enabled) await api.widgetAction('exit');
    setTimeout(() => $('#quickAddInput').focus(), 120);
  });
  api.onEdgeState(value => {
    document.body.classList.toggle('edge-hidden', Boolean(value.hidden));
    document.body.classList.toggle('edge-left', value.side === 'left');
    document.body.classList.toggle('edge-right', value.side === 'right');
  });
  api.onWidgetState(value => {
    cancelWidgetHoverTimer();
    widgetUiState = value;
    if (value.enabled && !settingsWindowMode) $('#toastRegion').replaceChildren();
    document.body.classList.toggle('widget-mode', Boolean(value.enabled));
    document.body.classList.toggle('widget-expanded', Boolean(value.enabled && value.expanded));
    document.body.classList.toggle('widget-expand-up', value.expandDirection === 'up');
    renderWidget();
    applySettings();
  });
  api.onSettingChanged(({ key, value }) => {
    state.settings[key] = value; applySettings(); renderTasks(); renderWidget();
  });
  api.onAppearancePreview(patch => {
    if (!patch || typeof patch !== 'object') return;
    Object.assign(state.settings, patch);
    markAppearanceAdjusting();
    applyAppearanceOnly();
  });
  api.onDataDirectoryChanged(value => {
    dataDirectoryPath = value;
    syncSettingControls();
  });
  api.onReminderFired(payload => {
    toast(`${payload.title}：${payload.body}`, '查看', () => api.openReminder(payload), 12000);
  });
  api.onOpenReminder(async payload => {
    if (settingsWindowMode || !payload) return;
    if (widgetUiState.enabled) await api.widgetAction('exit');
    const note = state.notes.find(item => item.id === payload.noteId);
    if (!note) return;
    state.activeNoteId = note.id;
    renderAll();
    const task = note.tasks.find(item => item.id === payload.taskId);
    if (task) setTimeout(() => openTaskDialog(task), 100);
  });
  api.onStateUpdated(async value => {
    const localSettings = {};
    if (settingsWindowMode) {
      for (const key of dirtySettingKeys) localSettings[key] = state.settings[key];
    }
    state = value;
    if (settingsWindowMode) Object.assign(state.settings, localSettings);
    const loaded = await loadBackgroundImages();
    if (!loaded) return;
    renderAll();
  });
  api.onMainBounds(bounds => syncMainWindowSize(bounds));
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (state.settings.theme === 'system') applySettings(); });
}

init().catch(error => {
  console.error(error);
  document.body.innerHTML = '<main style="padding:30px;color:#a33;background:#fff;height:100%"><h2>轻笺启动失败</h2><p>请重新启动应用。</p></main>';
});
