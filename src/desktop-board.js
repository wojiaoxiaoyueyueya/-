'use strict';

const api = window.lingjian;
const $ = selector => document.querySelector(selector);
let state = null;
let boardState = { enabled: true, locked: false, scope: 'active', style: 'glass' };
const completing = new Set();
let resizeActive = false;
let resizeFrame = null;
let backgroundImageData = '';
let loadedBackgroundPath = '';
let backgroundLoadSequence = 0;
let addTaskPending = false;

function hexToRgb(hex) {
  const cleaned = String(hex || '').replace('#', '');
  const value = cleaned.length === 3 ? cleaned.split('').map(char => char + char).join('') : cleaned;
  const number = Number.parseInt(value, 16);
  if (!Number.isFinite(number)) return [255, 248, 232];
  return [(number >> 16) & 255, (number >> 8) & 255, number & 255];
}

function applyBackgroundLayer() {
  const layer = $('#desktopBoardBackgroundLayer');
  if (!layer) return;
  if (layer.__lingjianBackgroundData !== backgroundImageData) {
    layer.__lingjianBackgroundData = backgroundImageData;
    layer.style.backgroundImage = backgroundImageData ? `url(${JSON.stringify(backgroundImageData)})` : 'none';
  }
  const fit = state.settings.desktopBoardBackgroundFit || 'cover';
  layer.style.backgroundSize = fit === 'repeat' ? 'auto' : fit;
  layer.style.backgroundRepeat = fit === 'repeat' ? 'repeat' : 'no-repeat';
  layer.style.backgroundPosition = 'center';
  layer.style.opacity = String(state.settings.desktopBoardBackgroundImageOpacity ?? 0.55);
}

async function loadBackgroundImage(force = false) {
  const expectedPath = state.settings.desktopBoardBackgroundImagePath || '';
  if (!force && expectedPath === loadedBackgroundPath && (backgroundImageData || !expectedPath)) return;
  const sequence = ++backgroundLoadSequence;
  const image = await api.loadBackgroundImage('desktopBoard', false);
  if (sequence !== backgroundLoadSequence) return;
  loadedBackgroundPath = image?.path || expectedPath;
  backgroundImageData = image?.dataUrl || '';
  applyBackgroundLayer();
}

function currentNote() {
  return state.notes.find(note => note.id === state.activeNoteId) || state.notes[0];
}

function activeEntries() {
  const notes = boardState.scope === 'all' ? state.notes : [currentNote()];
  return notes.flatMap(note => (note.tasks || []).filter(task => !task.done).map(task => ({ note, task })));
}

function progressInfo() {
  const notes = boardState.scope === 'all' ? state.notes : [currentNote()];
  const tasks = notes.flatMap(note => note.tasks || []);
  const done = tasks.filter(task => task.done).length;
  return { total: tasks.length, done, percent: tasks.length ? Math.round(done / tasks.length * 100) : 0 };
}

function reminderLabel(task) {
  if (!task.reminder?.enabled || !task.reminder.at) return '';
  const date = new Date(task.reminder.at);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const pad = value => String(value).padStart(2, '0');
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay ? `今天 ${pad(date.getHours())}:${pad(date.getMinutes())}` : `${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function renderTheme() {
  const selectedTheme = state.settings.desktopBoardTheme || 'inherit';
  const theme = selectedTheme === 'inherit' ? (state.settings.theme || 'light') : selectedTheme;
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  const automaticText = dark ? '#F3F3F5' : '#24262C';
  const text = state.settings.desktopBoardTextColor || automaticText;
  let rgb = hexToRgb(state.settings.desktopBoardBackground || state.settings.background || '#FFF8E8');
  if (dark) rgb = rgb.map(value => Math.round(value * .24));
  document.body.classList.toggle('theme-dark', dark);
  document.body.classList.toggle('locked', Boolean(boardState.locked));
  document.body.classList.toggle('style-clear', boardState.style === 'clear');
  document.body.classList.toggle('style-airy', boardState.style === 'airy');
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  document.documentElement.style.setProperty('--board-bg-rgb', rgb.join(', '));
  document.documentElement.style.setProperty('--board-bg-opacity', String(state.settings.desktopBoardBackgroundOpacity ?? 0.72));
  document.documentElement.style.setProperty('--board-text', text);
  document.documentElement.style.setProperty('--board-muted', `color-mix(in srgb, ${text} 58%, transparent)`);
  document.documentElement.style.setProperty('--board-blur', `${Number(state.settings.desktopBoardBlur ?? 28)}px`);
  document.documentElement.style.setProperty('--board-brightness', String(state.settings.desktopBoardBrightness ?? 1));
  applyBackgroundLayer();
  $('#boardLockBtn').classList.toggle('active', Boolean(boardState.locked));
  $('#boardLockBtn').textContent = boardState.locked ? '◆' : '◇';
  $('#boardLockBtn').title = boardState.locked ? '已锁定，点击允许拖动' : '点击锁定位置';
}

function renderNotes() {
  const select = $('#boardNoteSelect');
  const current = currentNote();
  select.replaceChildren(...state.notes.map(note => {
    const option = document.createElement('option');
    option.value = note.id;
    option.textContent = boardState.scope === 'all' ? `当前：${note.title}` : note.title;
    return option;
  }));
  select.value = current.id;
}

function taskSecondary(note, task) {
  const parts = [];
  if (boardState.scope === 'all') parts.push(note.title);
  const reminder = reminderLabel(task);
  if (reminder) parts.push(reminder);
  else if (task.details) parts.push(task.details);
  else if (task.priority === 'high') parts.push('重要事项');
  return parts.join(' · ');
}

function createTask(entry) {
  const { note, task } = entry;
  const item = document.createElement('article');
  item.className = `board-task${completing.has(task.id) ? ' completing' : ''}`;
  item.dataset.noteId = note.id;
  item.dataset.taskId = task.id;
  item.style.setProperty('--task-color', task.color || note.color || '#f2ad42');

  const check = document.createElement('button');
  check.className = 'task-check';
  check.type = 'button';
  check.textContent = '✓';
  check.setAttribute('aria-label', `完成：${task.text}`);

  const copy = document.createElement('button');
  copy.className = 'task-copy';
  copy.type = 'button';
  const title = document.createElement('strong');
  title.textContent = task.text;
  const secondary = document.createElement('small');
  secondary.textContent = taskSecondary(note, task);
  secondary.hidden = !secondary.textContent;
  copy.append(title, secondary);

  const quantity = document.createElement('span');
  quantity.className = 'task-quantity';
  quantity.textContent = Number(task.quantity) > 1 ? `×${task.quantity}` : '';
  item.append(check, copy, quantity);
  return item;
}

function render() {
  if (!state) return;
  boardState = {
    ...boardState,
    enabled: Boolean(state.settings.desktopBoardEnabled),
    locked: Boolean(state.settings.desktopBoardLocked),
    scope: state.settings.desktopBoardScope || 'active',
    style: state.settings.desktopBoardStyle || 'glass'
  };
  renderTheme();
  renderNotes();
  const entries = activeEntries();
  const progress = progressInfo();
  const note = currentNote();
  $('#boardHeadline').textContent = boardState.scope === 'all' ? '所有便签的待办' : note.title;
  $('#boardSummary').textContent = entries.length ? `${entries.length} 项待完成 · 已完成 ${progress.done}/${progress.total}` : '此刻没有未完成事项';
  $('#boardProgress').style.setProperty('--progress', `${progress.percent * 3.6}deg`);
  $('#boardProgressText').textContent = `${progress.percent}%`;
  $('#boardModeHint').textContent = boardState.scope === 'all' ? '显示全部便签 · 与轻笺实时同步' : '只显示当前便签 · 与轻笺实时同步';
  const list = $('#boardList');
  list.replaceChildren(...entries.map(createTask));
  list.hidden = entries.length === 0;
  $('#boardEmpty').hidden = entries.length > 0;
}

async function completeTask(item) {
  if (!item || item.classList.contains('completing')) return;
  const payload = { noteId: item.dataset.noteId, taskId: item.dataset.taskId };
  completing.add(payload.taskId);
  item.classList.add('completing');
  await new Promise(resolve => setTimeout(resolve, 310));
  try {
    const completed = await api.desktopBoardCompleteTask(payload);
    if (!completed) completing.delete(payload.taskId);
  } catch {
    completing.delete(payload.taskId);
    render();
  }
}

async function addTaskFromBoard() {
  const input = $('#boardQuickAddInput');
  const button = $('#boardQuickAddButton');
  const text = input.value.trim();
  if (!text || addTaskPending) {
    input.focus();
    return;
  }
  addTaskPending = true;
  input.disabled = true;
  button.disabled = true;
  try {
    const task = await api.desktopBoardAddTask({ noteId: currentNote()?.id, text });
    if (task) input.value = '';
  } finally {
    addTaskPending = false;
    input.disabled = false;
    button.disabled = false;
    input.focus();
  }
}

function bindResize() {
  document.querySelectorAll('[data-resize-edge]').forEach(handle => {
    handle.addEventListener('pointerdown', async event => {
      if (boardState.locked || event.button !== 0) return;
      event.preventDefault();
      resizeActive = Boolean(await api.resizeStart(handle.dataset.resizeEdge));
      if (resizeActive) handle.setPointerCapture?.(event.pointerId);
    });
  });
  window.addEventListener('pointermove', () => {
    if (!resizeActive || resizeFrame !== null) return;
    resizeFrame = requestAnimationFrame(() => { resizeFrame = null; api.resizeMove(); });
  });
  const finish = () => {
    if (!resizeActive) return;
    resizeActive = false;
    if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
    resizeFrame = null;
    api.resizeEnd();
  };
  window.addEventListener('pointerup', finish);
  window.addEventListener('pointercancel', finish);
}

function bindEvents() {
  $('#boardNoteSelect').addEventListener('change', () => api.desktopBoardSelectNote($('#boardNoteSelect').value));
  $('#boardLockBtn').addEventListener('click', () => api.desktopBoardAction('toggle-lock'));
  $('#boardOpenBtn').addEventListener('click', () => api.desktopBoardAction('open-main'));
  $('#boardHideBtn').addEventListener('click', () => api.desktopBoardAction('hide'));
  $('#boardQuickAddForm').addEventListener('submit', event => {
    event.preventDefault();
    addTaskFromBoard().catch(error => console.error('桌面任务板添加任务失败:', error));
  });
  $('#boardList').addEventListener('click', event => {
    const item = event.target.closest('.board-task');
    if (!item) return;
    if (event.target.closest('.task-check')) completeTask(item);
    else if (event.target.closest('.task-copy')) api.desktopBoardOpenTask({ noteId: item.dataset.noteId, taskId: item.dataset.taskId });
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', renderTheme);
  bindResize();
}

async function init() {
  state = await api.loadState();
  bindEvents();
  await loadBackgroundImage(true);
  render();
  api.onStateUpdated(value => {
    const previousPath = state?.settings?.desktopBoardBackgroundImagePath || '';
    state = value;
    for (const id of [...completing]) {
      const task = state.notes.flatMap(note => note.tasks || []).find(item => item.id === id);
      if (!task || task.done) completing.delete(id);
    }
    render();
    if (previousPath !== (state.settings.desktopBoardBackgroundImagePath || '') || (state.settings.desktopBoardBackgroundImagePath && !backgroundImageData)) {
      loadBackgroundImage(true).catch(error => console.error('读取桌面任务板背景失败:', error));
    }
  });
  api.onSettingChanged(({ key, value }) => {
    state.settings[key] = value;
    render();
  });
  api.onDesktopBoardState(value => {
    boardState = { ...boardState, ...value };
    if (state) {
      state.settings.desktopBoardLocked = boardState.locked;
      state.settings.desktopBoardScope = boardState.scope;
      state.settings.desktopBoardStyle = boardState.style;
    }
    render();
  });
  api.onAppearancePreview(patch => {
    if (!patch || typeof patch !== 'object') return;
    Object.assign(state.settings, patch);
    renderTheme();
  });
  api.onBackgroundChanged(({ target }) => {
    if (target !== 'desktopBoard') return;
    loadedBackgroundPath = '';
    backgroundImageData = '';
    loadBackgroundImage(true).catch(error => console.error('刷新桌面任务板背景失败:', error));
  });
}

init().catch(error => {
  console.error(error);
  document.body.innerHTML = '<main style="padding:20px;color:#8d2f2f;background:rgba(255,255,255,.9);height:100%">桌面任务板启动失败，请重新打开轻笺。</main>';
});
