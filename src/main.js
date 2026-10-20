'use strict';

const { app, BrowserWindow, ipcMain, Tray, Menu, Notification, nativeImage, screen, dialog, nativeTheme, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');

const APP_NAME = '轻笺';
const DATA_LOCATION_VERSION = 1;
const EDGE_VISIBLE = 38;
let mainWindow = null;
let settingsWindow = null;
let settingsWindowExpandedBounds = null;
let tray = null;
let isQuitting = false;
let appState = null;
let saveTimer = null;
let edgeTimer = null;
let edgeHidden = false;
let edgeSide = 'right';
let edgeRevealUntil = 0;
let internalMove = false;
let lastVisibleBounds = null;
let widgetMode = false;
let widgetExpanded = false;
let widgetExpandDirection = 'down';
let widgetCollapsedBounds = null;
let fullWindowBounds = null;
let widgetMoveSuppressedUntil = 0;
let widgetUserMoveUntil = 0;
let widgetDragSettleTimer = null;
let activeWindowResize = null;
let resizeFinishTimer = null;
let resolvedDataDirectory = null;
let hasDataDirectoryPreference = false;
let lastReminderPayload = null;
const backgroundCache = new Map();

// 独立测试实例不会读取或覆盖用户的正式便签数据。
if (process.argv.includes('--test-mode')) {
  app.setPath('userData', path.join(app.getPath('temp'), 'LingJianDesktopTest'));
}

function testMode() {
  return process.argv.includes('--test-mode');
}

function pathsEqual(left, right) {
  const first = path.resolve(String(left || ''));
  const second = path.resolve(String(right || ''));
  return process.platform === 'win32' ? first.toLowerCase() === second.toLowerCase() : first === second;
}

function dataLocatorFile() {
  if (testMode()) return path.join(app.getPath('userData'), 'data-location.json');
  return path.join(app.getPath('appData'), 'LingJianDesktop', 'data-location.json');
}

function readDataDirectoryPreference() {
  try {
    const locator = JSON.parse(fs.readFileSync(dataLocatorFile(), 'utf8'));
    if (locator?.version === DATA_LOCATION_VERSION && path.isAbsolute(String(locator.path || ''))) {
      hasDataDirectoryPreference = true;
      return path.normalize(locator.path);
    }
  } catch { /* 首次启动或定位文件损坏时使用安全默认位置。 */ }
  hasDataDirectoryPreference = false;
  return '';
}

function preferredDefaultDataDirectory() {
  const legacyDirectory = app.getPath('userData');
  if (testMode()) return legacyDirectory;
  if (process.platform === 'win32' && fs.existsSync('D:\\')) return 'D:\\轻笺data';
  if (fs.existsSync(path.join(legacyDirectory, 'state.json'))) return legacyDirectory;
  return path.join(app.getPath('documents'), '轻笺data');
}

function dataDirectory() {
  if (resolvedDataDirectory) return resolvedDataDirectory;
  resolvedDataDirectory = readDataDirectoryPreference() || preferredDefaultDataDirectory();
  return resolvedDataDirectory;
}

async function saveDataDirectoryPreference(directory) {
  const locatorPath = dataLocatorFile();
  await fsp.mkdir(path.dirname(locatorPath), { recursive: true });
  await fsp.writeFile(locatorPath, JSON.stringify({
    version: DATA_LOCATION_VERSION,
    path: path.normalize(directory),
    updatedAt: new Date().toISOString()
  }, null, 2), 'utf8');
  hasDataDirectoryPreference = true;
}

function migrateLegacyDataIfNeeded() {
  const targetDirectory = dataDirectory();
  const legacyDirectory = app.getPath('userData');
  if (pathsEqual(targetDirectory, legacyDirectory)) return;
  const targetState = path.join(targetDirectory, 'state.json');
  const legacyState = path.join(legacyDirectory, 'state.json');
  if (fs.existsSync(targetState) || !fs.existsSync(legacyState)) return;
  try {
    fs.mkdirSync(targetDirectory, { recursive: true });
    const targetBackgrounds = path.join(targetDirectory, 'backgrounds');
    const legacyBackgrounds = path.join(legacyDirectory, 'backgrounds');
    if (fs.existsSync(legacyBackgrounds)) fs.cpSync(legacyBackgrounds, targetBackgrounds, { recursive: true });
    const migrated = JSON.parse(fs.readFileSync(legacyState, 'utf8'));
    const settings = migrated?.settings || {};
    for (const key of ['backgroundImagePath', 'widgetBackgroundImagePath']) {
      const currentPath = String(settings[key] || '');
      if (currentPath && path.resolve(currentPath).toLowerCase().startsWith(path.resolve(legacyBackgrounds).toLowerCase())) {
        settings[key] = path.join(targetBackgrounds, path.basename(currentPath));
      }
    }
    fs.writeFileSync(targetState, JSON.stringify(migrated, null, 2), 'utf8');
  } catch (error) {
    console.error('迁移旧版轻笺数据失败:', error);
  }
}

const defaultState = () => {
  const now = Date.now();
  const noteId = `note-${now}`;
  return {
    version: 6,
    activeNoteId: noteId,
    notes: [{
      id: noteId,
      title: '今天要做',
      color: '#F7B955',
      createdAt: now,
      tasks: [{
        id: `task-${now}`,
        text: '欢迎使用轻笺，双击我或点右侧菜单进行编辑',
        details: '',
        done: false,
        color: '#F7B955',
        priority: 'normal',
        quantity: 1,
        createdAt: now,
        reminder: { enabled: false, at: '', repeat: 'none', lastNotifiedAt: '' }
      }]
    }],
    settings: {
      background: '#FFF8E8',
      mainTextColor: '',
      backgroundOpacity: 0.78,
      backgroundImagePath: '',
      backgroundImageName: '',
      backgroundImageOpacity: 0.55,
      backgroundFit: 'cover',
      windowOpacity: 1,
      theme: 'light',
      alwaysOnTop: false,
      edgeHide: false,
      edgeSide: 'right',
      autoLaunch: false,
      closeToTray: true,
      closeBehavior: 'widget',
      widgetDockLeft: false,
      widgetAutoExpand: false,
      widgetBackground: '#FFF8E8',
      widgetTextColor: '',
      widgetBackgroundOpacity: 0.82,
      widgetBackgroundImagePath: '',
      widgetBackgroundImageName: '',
      widgetBackgroundImageOpacity: 0.55,
      widgetBackgroundFit: 'cover',
      widgetOpacity: 0.96,
      widgetWidth: 330,
      rememberWidgetMode: true,
      lastMode: 'full',
      showCompleted: true,
      playSound: true,
      compactMode: false
    },
    windowBounds: { width: 920, height: 680 },
    widgetBounds: {}
  };
};

function stateFile() {
  return path.join(dataDirectory(), 'state.json');
}

function normalizeState(input) {
  const defaults = defaultState();
  const state = input && typeof input === 'object' ? input : {};
  const previousVersion = Number(state.version) || 1;
  const notes = Array.isArray(state.notes) && state.notes.length ? state.notes : defaults.notes;
  const normalized = {
    ...defaults,
    ...state,
    version: defaults.version,
    notes,
    settings: { ...defaults.settings, ...(state.settings || {}) },
    windowBounds: { ...defaults.windowBounds, ...(state.windowBounds || {}) },
    widgetBounds: { ...(state.widgetBounds || {}) }
  };
  if (!notes.some(note => note.id === normalized.activeNoteId)) normalized.activeNoteId = notes[0].id;
  normalized.settings.backgroundOpacity = clamp(Number(normalized.settings.backgroundOpacity), 0.35, 1);
  normalized.settings.backgroundImageOpacity = clamp(Number(normalized.settings.backgroundImageOpacity), 0, 1);
  normalized.settings.windowOpacity = clamp(Number(normalized.settings.windowOpacity), 0.55, 1);
  normalized.settings.widgetBackgroundOpacity = clamp(Number(normalized.settings.widgetBackgroundOpacity), 0.2, 1);
  normalized.settings.widgetBackgroundImageOpacity = clamp(Number(normalized.settings.widgetBackgroundImageOpacity), 0, 1);
  normalized.settings.widgetOpacity = clamp(Number(normalized.settings.widgetOpacity), 0.65, 1);
  normalized.settings.widgetWidth = clamp(Number(normalized.settings.widgetWidth), 280, 420);
  if (!['widget', 'tray', 'quit'].includes(normalized.settings.closeBehavior)) normalized.settings.closeBehavior = 'widget';
  if (!['full', 'widget'].includes(normalized.settings.lastMode)) normalized.settings.lastMode = 'full';
  if (!['cover', 'contain', 'repeat'].includes(normalized.settings.backgroundFit)) normalized.settings.backgroundFit = 'cover';
  if (!['cover', 'contain', 'repeat'].includes(normalized.settings.widgetBackgroundFit)) normalized.settings.widgetBackgroundFit = 'cover';
  for (const key of ['mainTextColor', 'widgetTextColor']) {
    if (!/^#[0-9a-f]{6}$/i.test(String(normalized.settings[key] || ''))) normalized.settings[key] = '';
  }
  if (previousVersion < 3) {
    normalized.settings.widgetDockLeft = false;
    normalized.settings.widgetBackground = normalized.settings.background;
    normalized.settings.widgetBackgroundOpacity = normalized.settings.backgroundOpacity;
  }
  if (previousVersion < 4) {
    // 旧版默认底色接近不透明；升级后自动调整为更清晰的磨砂玻璃效果。
    if (normalized.settings.backgroundOpacity >= 0.94) normalized.settings.backgroundOpacity = 0.78;
    if (normalized.settings.widgetBackgroundOpacity >= 0.94) normalized.settings.widgetBackgroundOpacity = 0.82;
  }
  if (previousVersion < 6) {
    // 1.7.4 的自绘滑块在部分 Windows 缩放环境下会把图片透明度误写为 0。
    // 只在首次升级且确实保存了背景图片时恢复可见度，之后仍允许用户自由调到 0。
    if (normalized.settings.backgroundImagePath && normalized.settings.backgroundImageOpacity <= 0.01) {
      normalized.settings.backgroundImageOpacity = 0.62;
    }
    if (normalized.settings.widgetBackgroundImagePath && normalized.settings.widgetBackgroundImageOpacity <= 0.01) {
      normalized.settings.widgetBackgroundImageOpacity = 0.62;
    }
  }
  return normalized;
}

function normalizeAppearancePreview(input) {
  if (!input || typeof input !== 'object') return {};
  const preview = {};
  for (const key of ['background', 'widgetBackground']) {
    if (/^#[0-9a-f]{6}$/i.test(String(input[key] || ''))) preview[key] = String(input[key]);
  }
  for (const key of ['mainTextColor', 'widgetTextColor']) {
    const value = String(input[key] || '');
    if (!value || /^#[0-9a-f]{6}$/i.test(value)) preview[key] = value;
  }
  const numeric = {
    backgroundOpacity: [0.35, 1],
    backgroundImageOpacity: [0, 1],
    windowOpacity: [0.55, 1],
    widgetBackgroundOpacity: [0.2, 1],
    widgetBackgroundImageOpacity: [0, 1],
    widgetOpacity: [0.65, 1],
    widgetWidth: [280, 420]
  };
  for (const [key, [minimum, maximum]] of Object.entries(numeric)) {
    if (Number.isFinite(Number(input[key]))) preview[key] = clamp(Number(input[key]), minimum, maximum);
  }
  for (const key of ['backgroundFit', 'widgetBackgroundFit']) {
    if (['cover', 'contain', 'repeat'].includes(input[key])) preview[key] = input[key];
  }
  return preview;
}

function clamp(value, min, max) {
  const safe = Number.isFinite(value) ? value : max;
  return Math.min(max, Math.max(min, safe));
}

function loadStateFromDisk() {
  return normalizeState(JSON.parse(fs.readFileSync(stateFile(), 'utf8')));
}

async function writeStateSnapshot(directory, state) {
  await fsp.mkdir(directory, { recursive: true });
  await fsp.writeFile(path.join(directory, 'state.json'), JSON.stringify(state, null, 2), 'utf8');
}

function persistState(immediate = false) {
  if (!appState) return Promise.resolve();
  clearTimeout(saveTimer);
  const write = async () => {
    try {
      await writeStateSnapshot(dataDirectory(), appState);
    } catch (error) {
      console.error('保存数据失败:', error);
    }
  };
  if (immediate) return write();
  else saveTimer = setTimeout(write, 180);
  return Promise.resolve();
}

function broadcast(channel, payload) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(channel, payload);
  }
}

function broadcastState() {
  broadcast('app:state-updated', appState);
}

function iconPath() {
  return path.join(__dirname, '..', 'assets', 'icon.png');
}

const backgroundTargets = {
  main: { pathKey: 'backgroundImagePath', nameKey: 'backgroundImageName', opacityKey: 'backgroundImageOpacity', filePrefix: 'main-background', defaultOpacity: 0.62 },
  widget: { pathKey: 'widgetBackgroundImagePath', nameKey: 'widgetBackgroundImageName', opacityKey: 'widgetBackgroundImageOpacity', filePrefix: 'widget-background', defaultOpacity: 0.62 }
};

function imageMime(extension) {
  return ({
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    webp: 'image/webp', bmp: 'image/bmp', gif: 'image/gif'
  })[String(extension).replace('.', '').toLowerCase()] || '';
}

async function backgroundDataUrl(target, metadataOnly = false) {
  const config = backgroundTargets[target];
  if (!config) return { dataUrl: '', name: '' };
  const filePath = appState.settings[config.pathKey];
  const name = appState.settings[config.nameKey] || (filePath ? path.basename(filePath) : '');
  if (!filePath) return { dataUrl: '', name: '', path: '', exists: false };
  const mime = imageMime(path.extname(filePath));
  if (!mime) return { dataUrl: '', name, path: filePath, exists: false, error: 'unsupported' };
  try {
    const stat = await fsp.stat(filePath);
    if (metadataOnly) return { dataUrl: '', name, path: filePath, exists: true, size: stat.size };
    const signature = `${filePath}|${stat.size}|${stat.mtimeMs}`;
    const cached = backgroundCache.get(target);
    if (cached?.signature === signature) return cached.value;
    const buffer = await fsp.readFile(filePath);
    const value = { dataUrl: `data:${mime};base64,${buffer.toString('base64')}`, name, path: filePath, exists: true };
    backgroundCache.set(target, { signature, value });
    return value;
  } catch {
    backgroundCache.delete(target);
    return { dataUrl: '', name, path: filePath, exists: false, error: 'missing' };
  }
}

function createWindow() {
  const saved = appState.windowBounds || {};
  mainWindow = new BrowserWindow({
    width: clamp(Number(saved.width), 380, 1800),
    height: clamp(Number(saved.height), 360, 1400),
    x: Number.isFinite(saved.x) ? saved.x : undefined,
    y: Number.isFinite(saved.y) ? saved.y : undefined,
    minWidth: 380,
    minHeight: 360,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: true,
    maximizable: true,
    minimizable: true,
    alwaysOnTop: Boolean(appState.settings.alwaysOnTop),
    skipTaskbar: false,
    icon: iconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.setOpacity(clamp(Number(appState.settings.windowOpacity), 0.55, 1));
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.once('ready-to-show', () => {
    lastVisibleBounds = mainWindow.getBounds();
    if (!process.argv.includes('--hidden')) {
      mainWindow.show();
      if (appState.settings.rememberWidgetMode && appState.settings.lastMode === 'widget') setTimeout(enterWidgetMode, 280);
      else if (appState.settings.edgeHide) setTimeout(() => setEdgeHide(true), 500);
    }
  });

  const rememberBounds = () => {
    if (!mainWindow || internalMove || edgeHidden || mainWindow.isMaximized()) return;
    const bounds = mainWindow.getBounds();
    if (widgetMode) {
      const isUserMove = Date.now() < widgetUserMoveUntil;
      if (!isUserMove && Date.now() < widgetMoveSuppressedUntil) return;
      const collapsedHeight = widgetDimensions(false).height;
      const capsuleY = widgetExpanded && widgetExpandDirection === 'up'
        ? bounds.y + bounds.height - collapsedHeight
        : bounds.y;
      widgetCollapsedBounds = { x: bounds.x, y: capsuleY, width: bounds.width, height: collapsedHeight };
      appState.widgetBounds = { x: bounds.x, y: capsuleY };
      if (appState.settings.widgetDockLeft && isUserMove) {
        appState.settings.widgetDockLeft = false;
        broadcast('app:setting-changed', { key: 'widgetDockLeft', value: false });
        sendWidgetState();
        rebuildTrayMenu();
      }
      if (isUserMove) {
        clearTimeout(widgetDragSettleTimer);
        widgetDragSettleTimer = setTimeout(settleWidgetDrag, 360);
      }
      persistState();
      return;
    }
    lastVisibleBounds = bounds;
    appState.windowBounds = bounds;
    persistState();
  };
  mainWindow.on('move', rememberBounds);
  mainWindow.on('resize', rememberBounds);
  mainWindow.on('moved', () => {
    if (widgetMode && Date.now() < widgetUserMoveUntil) settleWidgetDrag();
  });

  mainWindow.on('blur', () => {
    if (!widgetMode && appState.settings.edgeHide && !edgeHidden && Date.now() > edgeRevealUntil) {
      clearTimeout(edgeTimer);
      edgeTimer = setTimeout(() => dockToEdge(), 500);
    }
  });

  mainWindow.on('close', event => {
    if (!isQuitting) {
      const behavior = appState.settings.closeBehavior || (appState.settings.closeToTray ? 'tray' : 'quit');
      if (behavior === 'widget' && !widgetMode) {
        event.preventDefault();
        enterWidgetMode();
      } else if (behavior === 'widget' || behavior === 'tray') {
        event.preventDefault();
        mainWindow.hide();
      } else {
        isQuitting = true;
        setImmediate(() => app.quit());
      }
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    if (settingsWindow.isMinimized()) settingsWindow.restore();
    settingsWindow.show();
    settingsWindow.focus();
    broadcastState();
    return settingsWindow;
  }
  const mainBounds = mainWindow?.getBounds() || appState.windowBounds || { x: 100, y: 80, width: 920, height: 680 };
  const area = screen.getDisplayMatching(mainBounds).workArea;
  const width = Math.min(720, area.width - 30);
  const height = Math.min(800, area.height - 30);
  let x = mainBounds.x + mainBounds.width + 12;
  if (x + width > area.x + area.width - 10) x = Math.max(area.x + 10, mainBounds.x + mainBounds.width - width - 18);
  const y = clamp(mainBounds.y, area.y + 10, area.y + area.height - height - 10);
  settingsWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    minWidth: 460,
    minHeight: 420,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: true,
    maximizable: true,
    minimizable: true,
    skipTaskbar: false,
    title: '轻笺 · 设置',
    icon: iconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.on('page-title-updated', event => {
    event.preventDefault();
    settingsWindow?.setTitle('轻笺 · 设置');
  });
  settingsWindow.loadFile(path.join(__dirname, 'index.html'), { query: { mode: 'settings' } });
  settingsWindow.once('ready-to-show', () => {
    settingsWindowExpandedBounds = settingsWindow.getBounds();
    settingsWindow.show();
    settingsWindow.focus();
  });
  settingsWindow.on('resize', () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindowExpandedBounds = settingsWindow.getBounds();
  });
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
  return settingsWindow;
}

function resizeTargetFromSender(sender) {
  const target = BrowserWindow.fromWebContents(sender);
  if (!target || target.isDestroyed()) return null;
  if (target !== mainWindow && target !== settingsWindow) return null;
  if (target === mainWindow && widgetMode) return null;
  return target;
}

function beginWindowResize(sender, edge) {
  const target = resizeTargetFromSender(sender);
  if (!target || !/^(n|s|e|w|ne|nw|se|sw)$/.test(String(edge))) return false;
  if (target.isMaximized()) target.unmaximize();
  const [minimumWidth, minimumHeight] = target.getMinimumSize();
  activeWindowResize = {
    target,
    edge: String(edge),
    startBounds: target.getBounds(),
    startPoint: screen.getCursorScreenPoint(),
    minimumWidth: Math.max(320, minimumWidth),
    minimumHeight: Math.max(260, minimumHeight)
  };
  clearTimeout(resizeFinishTimer);
  return true;
}

function updateWindowResize(sender) {
  const resize = activeWindowResize;
  if (!resize || resize.target.isDestroyed() || resize.target.webContents !== sender) return false;
  const point = screen.getCursorScreenPoint();
  const dx = point.x - resize.startPoint.x;
  const dy = point.y - resize.startPoint.y;
  const start = resize.startBounds;
  const next = { ...start };
  if (resize.edge.includes('e')) next.width = Math.max(resize.minimumWidth, start.width + dx);
  if (resize.edge.includes('s')) next.height = Math.max(resize.minimumHeight, start.height + dy);
  if (resize.edge.includes('w')) {
    next.width = Math.max(resize.minimumWidth, start.width - dx);
    next.x = start.x + start.width - next.width;
  }
  if (resize.edge.includes('n')) {
    next.height = Math.max(resize.minimumHeight, start.height - dy);
    next.y = start.y + start.height - next.height;
  }
  resize.target.setBounds(next, false);
  clearTimeout(resizeFinishTimer);
  resizeFinishTimer = setTimeout(() => finishWindowResize(sender), 1200);
  return next;
}

function finishWindowResize(sender) {
  const resize = activeWindowResize;
  if (!resize || (sender && resize.target.webContents !== sender)) return false;
  clearTimeout(resizeFinishTimer);
  const bounds = resize.target.isDestroyed() ? null : resize.target.getBounds();
  if (bounds && resize.target === mainWindow && !widgetMode) {
    appState.windowBounds = bounds;
    lastVisibleBounds = bounds;
    persistState(true);
    broadcast('app:main-bounds', bounds);
  }
  if (bounds && resize.target === settingsWindow) settingsWindowExpandedBounds = bounds;
  activeWindowResize = null;
  return bounds || true;
}

function setMainWindowSize(size) {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (widgetMode) exitWidgetMode(false);
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  const current = mainWindow.getBounds();
  const area = currentWorkArea(current);
  const width = clamp(Number(size?.width), 380, area.width);
  const height = clamp(Number(size?.height), 360, area.height);
  const target = {
    width,
    height,
    x: clamp(current.x, area.x, area.x + area.width - width),
    y: clamp(current.y, area.y, area.y + area.height - height)
  };
  internalMove = true;
  mainWindow.setBounds(target, false);
  internalMove = false;
  appState.windowBounds = target;
  lastVisibleBounds = target;
  persistState(true);
  broadcast('app:main-bounds', target);
  return target;
}

function showWindow() {
  if (!mainWindow) createWindow();
  if (widgetMode) exitWidgetMode(false);
  if (edgeHidden) revealFromEdge();
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  const icon = nativeImage.createFromPath(iconPath()).resize({ width: 18, height: 18 });
  tray = new Tray(icon);
  tray.setToolTip(`${APP_NAME} · 桌面便签`);
  tray.on('click', () => widgetMode ? exitWidgetMode() : showWindow());
  tray.on('balloon-click', () => openReminderInMain(lastReminderPayload));
  rebuildTrayMenu();
}

function rebuildTrayMenu() {
  if (!tray || !appState) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示完整轻笺', click: showWindow },
    {
      label: widgetMode ? '退出桌面小部件' : '收成桌面小部件',
      click: () => widgetMode ? exitWidgetMode() : enterWidgetMode()
    },
    { label: '快速添加待办', click: () => { showWindow(); mainWindow.webContents.send('app:quick-add'); } },
    { type: 'separator' },
    {
      label: '窗口置顶', type: 'checkbox', checked: Boolean(appState.settings.alwaysOnTop),
      click: item => updateSetting('alwaysOnTop', item.checked)
    },
    {
      label: '贴边半隐藏', type: 'checkbox', checked: Boolean(appState.settings.edgeHide),
      click: item => updateSetting('edgeHide', item.checked)
    },
    {
      label: '开机自动启动', type: 'checkbox', checked: Boolean(appState.settings.autoLaunch),
      click: item => updateSetting('autoLaunch', item.checked)
    },
    { type: 'separator' },
    { label: '退出轻笺', click: () => { isQuitting = true; app.quit(); } }
  ]));
}

function applyAutoLaunch(enabled) {
  if (process.argv.includes('--test-mode')) return Boolean(enabled);
  const settings = { openAtLogin: Boolean(enabled), name: APP_NAME };
  if (process.platform === 'win32' && app.isPackaged) {
    // 融合版由一个外层 exe 直接运行；portable 环境变量可避免注册临时解压目录。
    settings.path = process.env.PORTABLE_EXECUTABLE_FILE || app.getPath('exe');
    settings.args = ['--hidden'];
  }
  try {
    app.setLoginItemSettings(settings);
    return Boolean(enabled);
  } catch (error) {
    console.error('设置开机启动失败:', error);
    return false;
  }
}

function updateSetting(key, value) {
  appState.settings[key] = value;
  if (key === 'alwaysOnTop' && mainWindow && !widgetMode) mainWindow.setAlwaysOnTop(Boolean(value));
  if (key === 'windowOpacity' && mainWindow && !widgetMode) mainWindow.setOpacity(clamp(Number(value), 0.55, 1));
  if (key === 'widgetOpacity' && mainWindow && widgetMode) mainWindow.setOpacity(clamp(Number(value), 0.65, 1));
  if (['widgetWidth', 'widgetDockLeft'].includes(key) && mainWindow && widgetMode) resizeWidget(widgetExpanded);
  if (key === 'edgeHide') setEdgeHide(Boolean(value));
  if (key === 'autoLaunch') appState.settings.autoLaunch = applyAutoLaunch(Boolean(value));
  if (key === 'theme') nativeTheme.themeSource = ['light', 'dark', 'system'].includes(value) ? value : 'system';
  persistState();
  rebuildTrayMenu();
  broadcast('app:setting-changed', { key, value: appState.settings[key] });
  return appState.settings[key];
}

function currentWorkArea(bounds) {
  return screen.getDisplayMatching(bounds || mainWindow.getBounds()).workArea;
}

function widgetDimensions(expanded = widgetExpanded) {
  const width = clamp(Number(appState.settings.widgetWidth), 280, 420);
  return { width, height: expanded ? 392 : 64 };
}

function widgetCollapsedTargetBounds() {
  const size = widgetDimensions(false);
  const reference = mainWindow?.getBounds() || fullWindowBounds || appState.windowBounds;
  const area = currentWorkArea(reference);
  const margin = 14;
  if (appState.settings.widgetDockLeft) {
    return { ...size, x: area.x + margin, y: area.y + area.height - size.height - margin };
  }
  const saved = widgetCollapsedBounds || appState.widgetBounds || {};
  if (!Number.isFinite(saved.x) || !Number.isFinite(saved.y)) {
    return { ...size, x: area.x + margin, y: area.y + area.height - size.height - margin };
  }
  return {
    ...size,
    x: clamp(Number(saved.x), area.x + margin, area.x + area.width - size.width - margin),
    y: clamp(Number(saved.y), area.y + margin, area.y + area.height - size.height - margin)
  };
}

function widgetExpansionFrom(collapsed) {
  const desired = widgetDimensions(true);
  const area = currentWorkArea(collapsed);
  const margin = 14;
  const top = area.y + margin;
  const bottom = area.y + area.height - margin;
  const availableDown = Math.max(collapsed.height, bottom - collapsed.y);
  const availableUp = Math.max(collapsed.height, collapsed.y + collapsed.height - top);
  const direction = availableDown >= desired.height
    ? 'down'
    : (availableUp >= desired.height ? 'up' : (availableDown >= availableUp ? 'down' : 'up'));
  const height = Math.max(collapsed.height, Math.min(desired.height, direction === 'down' ? availableDown : availableUp));
  return {
    direction,
    bounds: {
      x: collapsed.x,
      y: direction === 'up' ? collapsed.y + collapsed.height - height : collapsed.y,
      width: collapsed.width,
      height
    }
  };
}

function sendWidgetState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('app:widget-state', {
    enabled: widgetMode,
    expanded: widgetExpanded,
    docked: Boolean(appState.settings.widgetDockLeft),
    expandDirection: widgetExpandDirection
  });
}

function settleWidgetDrag() {
  clearTimeout(widgetDragSettleTimer);
  if (!mainWindow || !widgetMode || mainWindow.isDestroyed()) return;
  const bounds = mainWindow.getBounds();
  const collapsedSize = widgetDimensions(false);
  const capsuleY = widgetExpanded && widgetExpandDirection === 'up'
    ? bounds.y + bounds.height - collapsedSize.height
    : bounds.y;
  widgetCollapsedBounds = { x: bounds.x, y: capsuleY, width: collapsedSize.width, height: collapsedSize.height };
  appState.widgetBounds = { x: bounds.x, y: capsuleY };
  widgetUserMoveUntil = 0;
  if (!widgetExpanded && (bounds.width !== collapsedSize.width || bounds.height !== collapsedSize.height)) {
    widgetMoveSuppressedUntil = Date.now() + 450;
    internalMove = true;
    mainWindow.setBounds({ x: bounds.x, y: bounds.y, ...collapsedSize }, false);
    internalMove = false;
  }
  persistState(true);
}

function resizeWidget(expanded, saveBounds = true) {
  if (!mainWindow || !widgetMode) return;
  if (!widgetExpanded && expanded) {
    const current = mainWindow.getBounds();
    widgetCollapsedBounds = { ...current, height: widgetDimensions(false).height };
  }
  const collapsed = widgetCollapsedTargetBounds();
  widgetCollapsedBounds = collapsed;
  const expansion = widgetExpansionFrom(collapsed);
  widgetExpanded = Boolean(expanded);
  widgetExpandDirection = expansion.direction;
  const target = widgetExpanded ? expansion.bounds : collapsed;
  widgetMoveSuppressedUntil = Date.now() + 650;
  sendWidgetState();
  internalMove = true;
  mainWindow.setBounds(target, true);
  internalMove = false;
  appState.widgetBounds = { x: collapsed.x, y: collapsed.y };
  if (saveBounds) persistState();
}

function enterWidgetMode() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  clearTimeout(edgeTimer);
  if (edgeHidden) revealFromEdge();
  if (!widgetMode) {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    const bounds = mainWindow.getBounds();
    if (bounds.width >= 380 && bounds.height >= 360) {
      fullWindowBounds = bounds;
      appState.windowBounds = bounds;
    }
  }
  widgetMode = true;
  widgetExpanded = false;
  widgetCollapsedBounds = null;
  appState.settings.lastMode = 'widget';
  mainWindow.setMinimumSize(250, 56);
  mainWindow.setResizable(false);
  mainWindow.setMaximizable(false);
  mainWindow.setSkipTaskbar(true);
  mainWindow.setAlwaysOnTop(true, 'floating');
  mainWindow.setOpacity(clamp(Number(appState.settings.widgetOpacity), 0.65, 1));
  resizeWidget(false);
  mainWindow.show();
  mainWindow.focus();
  rebuildTrayMenu();
  persistState();
}

function exitWidgetMode(focus = true) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!widgetMode) {
    mainWindow.show();
    if (focus) mainWindow.focus();
    return;
  }
  widgetMode = false;
  widgetExpanded = false;
  appState.settings.lastMode = 'full';
  mainWindow.setMinimumSize(380, 360);
  mainWindow.setResizable(true);
  mainWindow.setMaximizable(true);
  mainWindow.setSkipTaskbar(false);
  mainWindow.setAlwaysOnTop(Boolean(appState.settings.alwaysOnTop));
  mainWindow.setOpacity(clamp(Number(appState.settings.windowOpacity), 0.55, 1));
  const saved = fullWindowBounds || appState.windowBounds || { width: 920, height: 680 };
  const area = currentWorkArea(saved);
  const width = clamp(Number(saved.width), 380, area.width);
  const height = clamp(Number(saved.height), 360, area.height);
  const target = {
    width, height,
    x: clamp(Number(saved.x), area.x, area.x + area.width - width),
    y: clamp(Number(saved.y), area.y, area.y + area.height - height)
  };
  widgetMoveSuppressedUntil = Date.now() + 650;
  internalMove = true;
  mainWindow.setBounds(target, true);
  internalMove = false;
  lastVisibleBounds = target;
  sendWidgetState();
  mainWindow.show();
  if (focus) mainWindow.focus();
  rebuildTrayMenu();
  persistState();
}

function setEdgeHide(enabled) {
  clearTimeout(edgeTimer);
  if (!mainWindow) return;
  if (widgetMode && enabled) return;
  if (enabled) {
    appState.settings.edgeHide = true;
    dockToEdge();
  } else {
    appState.settings.edgeHide = false;
    revealFromEdge();
    edgeHidden = false;
    mainWindow.webContents.send('app:edge-state', { enabled: false, hidden: false, side: edgeSide });
  }
  persistState();
  rebuildTrayMenu();
}

function dockToEdge() {
  if (!mainWindow || widgetMode || !appState.settings.edgeHide || mainWindow.isDestroyed()) return;
  const bounds = edgeHidden && lastVisibleBounds ? lastVisibleBounds : mainWindow.getBounds();
  const area = currentWorkArea(bounds);
  edgeSide = (bounds.x + bounds.width / 2) < (area.x + area.width / 2) ? 'left' : 'right';
  appState.settings.edgeSide = edgeSide;
  if (!edgeHidden) {
    lastVisibleBounds = {
      ...bounds,
      x: edgeSide === 'left' ? area.x : area.x + area.width - bounds.width,
      y: clamp(bounds.y, area.y, area.y + area.height - Math.min(bounds.height, area.height))
    };
  }
  const hiddenX = edgeSide === 'left'
    ? area.x - bounds.width + EDGE_VISIBLE
    : area.x + area.width - EDGE_VISIBLE;
  internalMove = true;
  mainWindow.setBounds({ ...bounds, x: hiddenX, y: lastVisibleBounds.y }, true);
  internalMove = false;
  edgeHidden = true;
  mainWindow.webContents.send('app:edge-state', { enabled: true, hidden: true, side: edgeSide });
  persistState();
}

function revealFromEdge() {
  clearTimeout(edgeTimer);
  if (!mainWindow || !edgeHidden) return;
  const bounds = lastVisibleBounds || mainWindow.getBounds();
  const area = currentWorkArea(bounds);
  const x = edgeSide === 'left' ? area.x : area.x + area.width - bounds.width;
  const y = clamp(bounds.y, area.y, area.y + area.height - Math.min(bounds.height, area.height));
  internalMove = true;
  mainWindow.setBounds({ ...bounds, x, y }, true);
  internalMove = false;
  edgeHidden = false;
  edgeRevealUntil = Date.now() + 1800;
  mainWindow.webContents.send('app:edge-state', { enabled: true, hidden: false, side: edgeSide });
  mainWindow.show();
  mainWindow.focus();
}

function nextReminder(at, repeat) {
  const next = new Date(at);
  if (Number.isNaN(next.getTime())) return '';
  const now = Date.now();
  do {
    if (repeat === 'daily') next.setDate(next.getDate() + 1);
    else if (repeat === 'weekly') next.setDate(next.getDate() + 7);
    else if (repeat === 'monthly') next.setMonth(next.getMonth() + 1);
    else if (repeat === 'weekdays') {
      next.setDate(next.getDate() + 1);
      while (next.getDay() === 0 || next.getDay() === 6) next.setDate(next.getDate() + 1);
    } else return '';
  } while (next.getTime() <= now);
  const pad = number => String(number).padStart(2, '0');
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}T${pad(next.getHours())}:${pad(next.getMinutes())}`;
}

function openReminderInMain(payload) {
  if (!payload) return false;
  showWindow();
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('app:open-reminder', payload);
  }, 120);
  return true;
}

function deliverReminder(payload, options = {}) {
  lastReminderPayload = payload;
  broadcast('app:reminder-fired', payload);
  const methods = ['in-app'];
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.flashFrame(true);
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.flashFrame(false);
    }, 9000);
  }
  if (testMode() || options.silent) return { delivered: true, methods };

  if (appState.settings.playSound) {
    try { shell.beep(); methods.push('sound'); }
    catch (error) { console.error('播放提醒声音失败:', error); }
  }

  let systemDelivered = false;
  if (process.platform === 'win32' && tray && !tray.isDestroyed()) {
    try {
      tray.displayBalloon({
        icon: iconPath(),
        iconType: 'custom',
        title: payload.title,
        content: payload.body,
        largeIcon: true,
        noSound: true,
        respectQuietTime: false
      });
      methods.push('tray-balloon');
      systemDelivered = true;
    } catch (error) {
      console.error('显示 Windows 托盘提醒失败:', error);
    }
  }

  if (!systemDelivered && Notification.isSupported()) {
    try {
      const notification = new Notification({
        title: payload.title,
        body: payload.body,
        icon: iconPath(),
        silent: true,
        timeoutType: 'default'
      });
      notification.on('click', () => openReminderInMain(payload));
      notification.show();
      methods.push('native-notification');
      systemDelivered = true;
    } catch (error) {
      console.error('显示系统提醒失败:', error);
    }
  }
  return { delivered: true, systemDelivered, methods };
}

function checkReminders() {
  if (!appState) return;
  const now = Date.now();
  let changed = false;
  for (const note of appState.notes) {
    for (const task of note.tasks || []) {
      const reminder = task.reminder;
      if (task.done || !reminder?.enabled || !reminder.at) continue;
      const due = new Date(reminder.at).getTime();
      if (!Number.isFinite(due) || due > now) continue;
      const marker = String(reminder.at);
      if (reminder.lastNotifiedAt === marker) continue;
      reminder.lastNotifiedAt = marker;
      deliverReminder({
        noteId: note.id,
        taskId: task.id,
        dueAt: reminder.at,
        title: `轻笺提醒 · ${note.title}`,
        body: task.text + (Number(task.quantity) > 1 ? `  × ${task.quantity}` : '')
      });
      if (reminder.repeat && reminder.repeat !== 'none') reminder.at = nextReminder(reminder.at, reminder.repeat);
      else reminder.enabled = false;
      changed = true;
    }
  }
  if (changed) {
    persistState(true);
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('app:state-updated', appState);
  }
}

async function stateWithEmbeddedBackgrounds() {
  const snapshot = JSON.parse(JSON.stringify(appState));
  for (const [target, config] of Object.entries(backgroundTargets)) {
    const filePath = appState.settings[config.pathKey];
    if (!filePath || !fs.existsSync(filePath)) continue;
    const mime = imageMime(path.extname(filePath));
    if (!mime) continue;
    const buffer = await fsp.readFile(filePath);
    snapshot.settings[`${target}BackgroundBackup`] = {
      name: appState.settings[config.nameKey] || path.basename(filePath),
      mime,
      data: buffer.toString('base64')
    };
  }
  return snapshot;
}

async function restoreEmbeddedBackgrounds(rawState, normalized, directory = dataDirectory()) {
  const extensions = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/bmp': 'bmp', 'image/gif': 'gif' };
  const backgroundsDir = path.join(directory, 'backgrounds');
  await fsp.mkdir(backgroundsDir, { recursive: true });
  for (const [target, config] of Object.entries(backgroundTargets)) {
    const backupKey = `${target}BackgroundBackup`;
    const backup = rawState?.settings?.[backupKey];
    delete normalized.settings[backupKey];
    if (backup?.data && extensions[backup.mime]) {
      const buffer = Buffer.from(backup.data, 'base64');
      if (buffer.length <= 12 * 1024 * 1024) {
        const savedPath = path.join(backgroundsDir, `${config.filePrefix}.${extensions[backup.mime]}`);
        await fsp.writeFile(savedPath, buffer);
        normalized.settings[config.pathKey] = savedPath;
        normalized.settings[config.nameKey] = String(backup.name || path.basename(savedPath)).slice(0, 180);
        continue;
      }
    }
    const existingPath = normalized.settings[config.pathKey];
    if (existingPath && !fs.existsSync(existingPath)) {
      const localPath = path.join(backgroundsDir, path.basename(existingPath));
      if (fs.existsSync(localPath)) normalized.settings[config.pathKey] = localPath;
      else {
        normalized.settings[config.pathKey] = '';
        normalized.settings[config.nameKey] = '';
      }
    }
  }
}

function repairBackgroundPathsForDirectory(state, directory) {
  const backgroundsDir = path.join(directory, 'backgrounds');
  for (const config of Object.values(backgroundTargets)) {
    const currentPath = String(state.settings[config.pathKey] || '');
    if (!currentPath || fs.existsSync(currentPath)) continue;
    const localPath = path.join(backgroundsDir, path.basename(currentPath));
    if (fs.existsSync(localPath)) state.settings[config.pathKey] = localPath;
    else {
      state.settings[config.pathKey] = '';
      state.settings[config.nameKey] = '';
    }
  }
  return state;
}

async function copyStateToDirectory(sourceState, directory) {
  const relocated = normalizeState(JSON.parse(JSON.stringify(sourceState)));
  const backgroundsDir = path.join(directory, 'backgrounds');
  for (const config of Object.values(backgroundTargets)) {
    const sourcePath = String(relocated.settings[config.pathKey] || '');
    if (!sourcePath || !fs.existsSync(sourcePath)) {
      relocated.settings[config.pathKey] = '';
      relocated.settings[config.nameKey] = '';
      continue;
    }
    const extension = path.extname(sourcePath).toLowerCase();
    if (!imageMime(extension)) {
      relocated.settings[config.pathKey] = '';
      relocated.settings[config.nameKey] = '';
      continue;
    }
    await fsp.mkdir(backgroundsDir, { recursive: true });
    const destination = path.join(backgroundsDir, `${config.filePrefix}${extension}`);
    if (!pathsEqual(sourcePath, destination)) await fsp.copyFile(sourcePath, destination);
    relocated.settings[config.pathKey] = destination;
  }
  await writeStateSnapshot(directory, relocated);
  return relocated;
}

function applyLoadedStateToRuntime() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setAlwaysOnTop(Boolean(appState.settings.alwaysOnTop));
    const opacity = widgetMode ? appState.settings.widgetOpacity : appState.settings.windowOpacity;
    mainWindow.setOpacity(clamp(Number(opacity), widgetMode ? 0.65 : 0.55, 1));
  }
  nativeTheme.themeSource = appState.settings.theme || 'light';
  applyAutoLaunch(Boolean(appState.settings.autoLaunch));
  rebuildTrayMenu();
}

function broadcastDataDirectory() {
  broadcast('app:data-directory-changed', dataDirectory());
}

async function activateDataDirectory(directory, state) {
  await saveDataDirectoryPreference(directory);
  resolvedDataDirectory = path.normalize(directory);
  appState = state;
  backgroundCache.clear();
  applyLoadedStateToRuntime();
  broadcastDataDirectory();
  broadcastState();
}

async function relocateCurrentData(directory) {
  await persistState(true);
  const relocated = await copyStateToDirectory(appState, directory);
  await activateDataDirectory(directory, relocated);
  return relocated;
}

async function loadExistingDataDirectory(directory) {
  const raw = JSON.parse(await fsp.readFile(path.join(directory, 'state.json'), 'utf8'));
  const imported = normalizeState(raw);
  await restoreEmbeddedBackgrounds(raw, imported, directory);
  repairBackgroundPathsForDirectory(imported, directory);
  await writeStateSnapshot(directory, imported);
  await activateDataDirectory(directory, imported);
  return imported;
}

async function commitBackupToDirectory(raw, directory) {
  const imported = normalizeState(raw);
  await restoreEmbeddedBackgrounds(raw, imported, directory);
  repairBackgroundPathsForDirectory(imported, directory);
  await writeStateSnapshot(directory, imported);
  await saveDataDirectoryPreference(directory);
  resolvedDataDirectory = path.normalize(directory);
  appState = imported;
  backgroundCache.clear();
  return imported;
}

async function createFreshDataAt(directory, preserveUnreadable = false) {
  const existingState = path.join(directory, 'state.json');
  if (preserveUnreadable && fs.existsSync(existingState)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    await fsp.copyFile(existingState, path.join(directory, `state-unreadable-${stamp}.json`));
  }
  const fresh = defaultState();
  await writeStateSnapshot(directory, fresh);
  await saveDataDirectoryPreference(directory);
  resolvedDataDirectory = path.normalize(directory);
  appState = fresh;
  return fresh;
}

async function chooseAlternativeRecoveryDirectory() {
  const result = await dialog.showOpenDialog({
    title: '选择新的轻笺数据保存文件夹',
    defaultPath: app.getPath('documents'),
    properties: ['openDirectory', 'createDirectory']
  });
  if (!result.canceled && result.filePaths[0]) return result.filePaths[0];
  return path.join(app.getPath('documents'), '轻笺data');
}

async function createFreshWithFallback(directory, preserveUnreadable = false) {
  try {
    return await createFreshDataAt(directory, preserveUnreadable);
  } catch (error) {
    console.error('无法在原数据位置重新建立轻笺数据:', error);
    await dialog.showMessageBox({
      type: 'error',
      title: '原数据位置不可用',
      message: '无法在原位置建立数据文件夹',
      detail: `${directory}\n可能是磁盘不存在或没有写入权限，请选择其他位置。`,
      buttons: ['选择其他位置'],
      defaultId: 0,
      noLink: true
    });
    const alternative = await chooseAlternativeRecoveryDirectory();
    return createFreshDataAt(alternative, false);
  }
}

async function recoverMissingConfiguredData(directory, readError) {
  const stateWasUnreadable = fs.existsSync(path.join(directory, 'state.json'));
  if (testMode() && process.argv.includes('--test-recovery-create')) {
    return createFreshWithFallback(directory, stateWasUnreadable);
  }
  const response = await dialog.showMessageBox({
    type: 'warning',
    title: '找不到轻笺数据',
    message: stateWasUnreadable ? '默认位置中的数据文件无法读取' : '默认位置中的数据已被删除或移动',
    detail: `当前默认数据位置：\n${directory}\n\n您可以从其他位置导入轻笺备份；如果取消导入，软件会在这个默认位置重新建立文件夹并保存一份全新数据。`,
    buttons: ['从其他位置导入备份', '在原位置重新建立'],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  });

  if (response.response === 0) {
    const backup = await dialog.showOpenDialog({
      title: '选择要恢复的轻笺备份',
      defaultPath: fs.existsSync(directory) ? directory : path.dirname(directory),
      properties: ['openFile'],
      filters: [{ name: '轻笺备份', extensions: ['json'] }]
    });
    if (!backup.canceled && backup.filePaths[0]) {
      let raw;
      try {
        raw = JSON.parse(await fsp.readFile(backup.filePaths[0], 'utf8'));
      } catch (error) {
        console.error('启动恢复轻笺备份失败:', error);
        await dialog.showMessageBox({
          type: 'error',
          title: '备份无法导入',
          message: '所选文件不是有效的轻笺备份',
          detail: '软件将返回恢复选择，您也可以取消导入并在默认位置重新建立数据。',
          buttons: ['重新选择'],
          defaultId: 0,
          noLink: true
        });
        return recoverMissingConfiguredData(directory, error);
      }
      try {
        return await commitBackupToDirectory(raw, directory);
      } catch (error) {
        console.error('无法把备份恢复到原数据位置:', error);
        await dialog.showMessageBox({
          type: 'error',
          title: '原数据位置不可用',
          message: '备份有效，但无法写入原来的默认位置',
          detail: `${directory}\n请为恢复后的数据选择其他保存位置。`,
          buttons: ['选择其他位置'],
          defaultId: 0,
          noLink: true
        });
        const alternative = await chooseAlternativeRecoveryDirectory();
        return commitBackupToDirectory(raw, alternative);
      }
    }
  }

  if (readError) console.error('原轻笺数据读取失败:', readError);
  return createFreshWithFallback(directory, stateWasUnreadable);
}

async function initializeAppState() {
  const directory = dataDirectory();
  const preferenceAlreadyExisted = hasDataDirectoryPreference;
  if (!preferenceAlreadyExisted) migrateLegacyDataIfNeeded();
  try {
    appState = loadStateFromDisk();
    // 将版本迁移和修复后的设置立即落盘，避免用户未做其他操作时下次启动又读到旧值。
    await writeStateSnapshot(directory, appState);
    await saveDataDirectoryPreference(directory);
    return appState;
  } catch (error) {
    const stateAlreadyExists = fs.existsSync(stateFile());
    const automatedRecoveryTest = testMode() && process.argv.includes('--test-recovery-create');
    if ((preferenceAlreadyExisted || stateAlreadyExists) && (!testMode() || automatedRecoveryTest)) {
      return recoverMissingConfiguredData(directory, error);
    }
    appState = defaultState();
    await writeStateSnapshot(directory, appState);
    await saveDataDirectoryPreference(directory);
    return appState;
  }
}

function registerIpc() {
  ipcMain.handle('state:load', () => appState);
  ipcMain.handle('data:directory', () => dataDirectory());
  ipcMain.handle('data:choose-directory', async event => {
    const owner = BrowserWindow.fromWebContents(event.sender) || settingsWindow || mainWindow;
    const selection = await dialog.showOpenDialog(owner, {
      title: '选择轻笺默认数据保存文件夹',
      defaultPath: dataDirectory(),
      properties: ['openDirectory', 'createDirectory']
    });
    if (selection.canceled || !selection.filePaths[0]) return { canceled: true };
    const targetDirectory = path.normalize(selection.filePaths[0]);
    if (pathsEqual(targetDirectory, dataDirectory())) {
      return { canceled: false, unchanged: true, path: dataDirectory(), state: appState };
    }

    try {
      const targetState = path.join(targetDirectory, 'state.json');
      let mode = 'copied';
      let nextState;
      if (fs.existsSync(targetState)) {
        let targetIsReadable = true;
        try { JSON.parse(await fsp.readFile(targetState, 'utf8')); }
        catch { targetIsReadable = false; }
        if (targetIsReadable) {
          const choice = await dialog.showMessageBox(owner, {
            type: 'question',
            title: '此位置已有轻笺数据',
            message: '要读取已有数据，还是用当前数据覆盖？',
            detail: `${targetDirectory}\n读取已有数据会立即切换；覆盖时当前目录仍会保留为备份。`,
            buttons: ['读取已有数据', '用当前数据覆盖', '取消'],
            defaultId: 0,
            cancelId: 2,
            noLink: true
          });
          if (choice.response === 2) return { canceled: true };
          if (choice.response === 0) {
            nextState = await loadExistingDataDirectory(targetDirectory);
            mode = 'loaded';
          } else nextState = await relocateCurrentData(targetDirectory);
        } else {
          const choice = await dialog.showMessageBox(owner, {
            type: 'warning',
            title: '目标位置的数据无法读取',
            message: '此文件夹中已有无效的 state.json',
            detail: '可以用当前数据覆盖该文件，原来的无效文件不会作为轻笺数据读取。',
            buttons: ['用当前数据覆盖', '取消'],
            defaultId: 0,
            cancelId: 1,
            noLink: true
          });
          if (choice.response !== 0) return { canceled: true };
          nextState = await relocateCurrentData(targetDirectory);
        }
      } else nextState = await relocateCurrentData(targetDirectory);
      return { canceled: false, path: dataDirectory(), state: nextState, mode };
    } catch (error) {
      console.error('更改轻笺数据位置失败:', error);
      await dialog.showMessageBox(owner, {
        type: 'error',
        title: '无法更改数据位置',
        message: '所选文件夹不可用或没有写入权限',
        detail: String(error.message || error),
        buttons: ['确定'],
        noLink: true
      });
      return { canceled: false, error: '无法写入所选文件夹' };
    }
  });
  ipcMain.handle('state:save', (_event, state) => {
    appState = normalizeState(state);
    persistState();
    rebuildTrayMenu();
    broadcastState();
    return true;
  });
  ipcMain.handle('settings:save-all', (_event, settings) => {
    appState.settings = { ...appState.settings, ...(settings && typeof settings === 'object' ? settings : {}) };
    appState = normalizeState(appState);
    persistState();
    rebuildTrayMenu();
    broadcastState();
    return appState.settings;
  });
  ipcMain.handle('settings:set', (_event, key, value) => updateSetting(key, value));
  ipcMain.handle('reminder:test', () => deliverReminder({
    noteId: appState.activeNoteId,
    taskId: '',
    dueAt: new Date().toISOString(),
    title: '轻笺提醒测试',
    body: '如果您看到这条消息，提醒功能已经正常工作。'
  }, { silent: testMode() }));
  ipcMain.handle('reminder:open', (_event, payload) => openReminderInMain(payload));
  ipcMain.on('appearance:preview', (event, value) => {
    const preview = normalizeAppearancePreview(value);
    if (!Object.keys(preview).length) return;
    Object.assign(appState.settings, preview);
    if (Object.hasOwn(preview, 'windowOpacity') && mainWindow && !widgetMode) {
      mainWindow.setOpacity(preview.windowOpacity);
    }
    if (Object.hasOwn(preview, 'widgetOpacity') && mainWindow && widgetMode) {
      mainWindow.setOpacity(preview.widgetOpacity);
    }
    if (Object.hasOwn(preview, 'widgetWidth') && mainWindow && widgetMode) {
      resizeWidget(widgetExpanded, false);
    }
    for (const target of BrowserWindow.getAllWindows()) {
      if (!target.isDestroyed() && target.webContents !== event.sender) {
        target.webContents.send('app:appearance-preview', preview);
      }
    }
  });
  ipcMain.handle('window:open-settings', () => { createSettingsWindow(); return true; });
  ipcMain.handle('window:settings-action', (_event, action, value) => {
    if (!settingsWindow || settingsWindow.isDestroyed()) return false;
    if (action === 'close') settingsWindow.close();
    else if (action === 'minimize') settingsWindow.minimize();
    else if (action === 'maximize') settingsWindow.isMaximized() ? settingsWindow.unmaximize() : settingsWindow.maximize();
    else if (action === 'size') {
      if (settingsWindow.isMaximized()) settingsWindow.unmaximize();
      const current = settingsWindow.getBounds();
      const area = currentWorkArea(current);
      const width = clamp(Number(value?.width), 460, area.width);
      const height = clamp(Number(value?.height), 420, area.height);
      settingsWindow.setBounds({
        x: clamp(current.x, area.x, area.x + area.width - width),
        y: clamp(current.y, area.y, area.y + area.height - height),
        width,
        height
      }, false);
      settingsWindowExpandedBounds = settingsWindow.getBounds();
      return settingsWindowExpandedBounds;
    }
    return true;
  });
  ipcMain.handle('window:resize-start', (event, edge) => beginWindowResize(event.sender, edge));
  ipcMain.handle('window:resize-move', event => updateWindowResize(event.sender));
  ipcMain.handle('window:resize-end', event => finishWindowResize(event.sender));
  ipcMain.handle('window:main-bounds', () => mainWindow && !mainWindow.isDestroyed() ? mainWindow.getBounds() : appState.windowBounds);
  ipcMain.handle('window:main-size', (_event, size) => setMainWindowSize(size));
  ipcMain.handle('window:action', (_event, action) => {
    if (!mainWindow) return false;
    if (action === 'minimize') mainWindow.minimize();
    else if (action === 'maximize') mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
    else if (action === 'close') mainWindow.close();
    else if (action === 'widget') enterWidgetMode();
    else if (action === 'hide') mainWindow.hide();
    else if (action === 'quit') { isQuitting = true; app.quit(); }
    return true;
  });
  ipcMain.handle('window:widget', (_event, action) => {
    if (!mainWindow) return false;
    if (action === 'enter') enterWidgetMode();
    else if (action === 'exit') exitWidgetMode();
    else if (action === 'toggle-expand') resizeWidget(!widgetExpanded);
    else if (action === 'expand') resizeWidget(true);
    else if (action === 'collapse') resizeWidget(false);
    else if (action === 'hide') mainWindow.hide();
    else if (action === 'begin-drag') {
      clearTimeout(widgetDragSettleTimer);
      widgetUserMoveUntil = Date.now() + 10000;
    }
    else if (action === 'end-drag') settleWidgetDrag();
    return { enabled: widgetMode, expanded: widgetExpanded };
  });
  ipcMain.handle('window:widget-pointer-inside', event => {
    if (!mainWindow || mainWindow.isDestroyed() || !widgetMode) return false;
    if (BrowserWindow.fromWebContents(event.sender) !== mainWindow) return false;
    const cursor = screen.getCursorScreenPoint();
    const bounds = mainWindow.getBounds();
    return cursor.x >= bounds.x && cursor.x < bounds.x + bounds.width
      && cursor.y >= bounds.y && cursor.y < bounds.y + bounds.height;
  });
  ipcMain.handle('window:edge-hover', () => { revealFromEdge(); return true; });
  ipcMain.handle('window:edge-leave', () => {
    if (Date.now() < edgeRevealUntil) return true;
    if (appState.settings.edgeHide && !edgeHidden) {
      clearTimeout(edgeTimer);
      edgeTimer = setTimeout(dockToEdge, 650);
    }
    return true;
  });
  ipcMain.handle('appearance:choose-image', async (event, target) => {
    const config = backgroundTargets[target];
    if (!config) return { canceled: false, error: '无效的背景目标' };
    const owner = BrowserWindow.fromWebContents(event.sender) || mainWindow;
    const result = await dialog.showOpenDialog(owner, {
      title: '选择便签背景图片',
      defaultPath: dataDirectory(),
      properties: ['openFile'],
      filters: [{ name: '图片文件', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] }]
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const filePath = result.filePaths[0];
    const stat = await fsp.stat(filePath);
    if (stat.size > 24 * 1024 * 1024) return { canceled: false, error: '图片不能超过 24 MB' };
    const extension = path.extname(filePath).slice(1).toLowerCase();
    const mime = imageMime(extension);
    if (!mime) return { canceled: false, error: '不支持这种图片格式' };
    const backgroundsDir = path.join(dataDirectory(), 'backgrounds');
    await fsp.mkdir(backgroundsDir, { recursive: true });
    const savedPath = path.join(backgroundsDir, `${config.filePrefix}.${extension}`);
    if (!pathsEqual(filePath, savedPath)) await fsp.copyFile(filePath, savedPath);
    appState.settings[config.pathKey] = savedPath;
    appState.settings[config.nameKey] = path.basename(filePath);
    if (Number(appState.settings[config.opacityKey]) <= 0.01) {
      appState.settings[config.opacityKey] = config.defaultOpacity;
    }
    backgroundCache.delete(target);
    await persistState(true);
    const buffer = await fsp.readFile(savedPath);
    return {
      canceled: false,
      name: path.basename(filePath),
      path: savedPath,
      size: stat.size,
      opacity: appState.settings[config.opacityKey],
      dataUrl: `data:${mime};base64,${buffer.toString('base64')}`
    };
  });
  ipcMain.handle('appearance:load-image', (_event, target, metadataOnly) => backgroundDataUrl(target, Boolean(metadataOnly)));
  ipcMain.handle('appearance:clear-image', (_event, target) => {
    const config = backgroundTargets[target];
    if (!config) return false;
    appState.settings[config.pathKey] = '';
    appState.settings[config.nameKey] = '';
    backgroundCache.delete(target);
    persistState();
    return true;
  });
  ipcMain.handle('data:export', async event => {
    const owner = BrowserWindow.fromWebContents(event.sender) || mainWindow;
    const result = await dialog.showSaveDialog(owner, {
      title: '导出轻笺数据', defaultPath: path.join(dataDirectory(), `轻笺备份-${new Date().toISOString().slice(0, 10)}.json`),
      filters: [{ name: '轻笺备份', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    const snapshot = await stateWithEmbeddedBackgrounds();
    await fsp.writeFile(result.filePath, JSON.stringify(snapshot, null, 2), 'utf8');
    return { canceled: false, path: result.filePath };
  });
  ipcMain.handle('data:import', async event => {
    const owner = BrowserWindow.fromWebContents(event.sender) || mainWindow;
    const result = await dialog.showOpenDialog(owner, {
      title: '导入轻笺数据', defaultPath: dataDirectory(), properties: ['openFile'], filters: [{ name: '轻笺备份', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const rawImported = JSON.parse(await fsp.readFile(result.filePaths[0], 'utf8'));
    const imported = normalizeState(rawImported);
    await restoreEmbeddedBackgrounds(rawImported, imported);
    appState = imported;
    backgroundCache.clear();
    applyLoadedStateToRuntime();
    await persistState(true);
    broadcastState();
    return { canceled: false, state: appState };
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else {
  app.on('second-instance', showWindow);
  app.whenReady().then(async () => {
    app.setName(APP_NAME);
    app.setAppUserModelId('com.lingjian.desktop');
    await initializeAppState();
    nativeTheme.themeSource = appState.settings.theme || 'light';
    applyAutoLaunch(Boolean(appState.settings.autoLaunch));
    registerIpc();
    createWindow();
    createTray();
    setInterval(checkReminders, 5000);
    setTimeout(checkReminders, 3000);
  }).catch(async error => {
    console.error('轻笺启动失败:', error);
    try {
      await dialog.showMessageBox({
        type: 'error',
        title: '轻笺无法启动',
        message: '数据目录无法读取或建立',
        detail: String(error.message || error),
        buttons: ['退出'],
        noLink: true
      });
    } finally {
      isQuitting = true;
      app.quit();
    }
  });
}

app.on('before-quit', () => {
  isQuitting = true;
  if (appState && mainWindow && !widgetMode && !edgeHidden && !mainWindow.isMaximized()) appState.windowBounds = mainWindow.getBounds();
  if (appState) persistState(true);
});
app.on('window-all-closed', () => {});
app.on('activate', showWindow);
