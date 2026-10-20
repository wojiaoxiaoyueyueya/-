import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, '..');
const requestedExecutable = process.argv[2] ? path.resolve(process.argv[2]) : '';
const packaged = Boolean(requestedExecutable);
const executable = requestedExecutable || path.join(project, 'node_modules', 'electron', 'dist', 'electron.exe');
const isolatedUserData = path.join(os.tmpdir(), 'LingJianDesktopTest');
const selectedDataDirectory = path.join(isolatedUserData, 'SelectedData');
if (!path.resolve(isolatedUserData).startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error('Unsafe UI smoke test directory');
await fs.rm(isolatedUserData, { recursive: true, force: true });
await fs.mkdir(isolatedUserData, { recursive: true });
await fs.writeFile(path.join(isolatedUserData, 'data-location.json'), JSON.stringify({
  version: 1,
  path: selectedDataDirectory,
  updatedAt: new Date().toISOString()
}, null, 2), 'utf8');
const port = 9333 + Math.floor(Math.random() * 300);
const args = packaged
  ? [`--remote-debugging-port=${port}`, '--test-mode', '--test-recovery-create']
  : [`--remote-debugging-port=${port}`, project, '--test-mode', '--test-recovery-create'];

const child = spawn(executable, args, { cwd: project, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
let childLog = '';
child.stdout.on('data', chunk => { childLog += chunk.toString(); });
child.stderr.on('data', chunk => { childLog += chunk.toString(); });

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const startupTimeout = packaged ? 60000 : 15000;

async function targets() {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  return response.json();
}

async function waitForTarget(predicate, timeout = startupTimeout) {
  const deadline = Date.now() + timeout;
  let last = [];
  while (Date.now() < deadline) {
    try {
      last = await targets();
      const found = last.find(predicate);
      if (found) return found;
    } catch { /* Electron may still be starting. */ }
    await delay(180);
  }
  throw new Error(`Timed out waiting for page target: ${JSON.stringify(last.map(item => item.url))}`);
}

async function waitForTargetGone(predicate, timeout = 8000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      if (!(await targets()).some(predicate)) return true;
    } catch { /* Electron may be replacing the window target. */ }
    await delay(120);
  }
  return false;
}

async function connect(target) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data));
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });
  socket.addEventListener('close', () => {
    for (const { reject } of pending.values()) reject(new Error('Renderer debug connection closed'));
    pending.clear();
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) {
      const description = result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Renderer evaluation failed';
      throw new Error(description);
    }
    return result.result?.value;
  };
  return { socket, evaluate };
}

async function waitForValue(client, expression, predicate = Boolean, timeout = 12000) {
  const deadline = Date.now() + timeout;
  let value;
  while (Date.now() < deadline) {
    try {
      value = await client.evaluate(expression);
      if (predicate(value)) return value;
    } catch { /* The renderer may still be loading. */ }
    await delay(120);
  }
  throw new Error(`Timed out waiting for renderer value: ${JSON.stringify(value)}`);
}

let main;
let settings;
try {
  const mainTarget = await waitForTarget(item => item.type === 'page' && /index\.html(?:$|#)/.test(item.url));
  main = await connect(mainTarget);

  const mainInitial = await waitForValue(main, `(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const shellNode = document.querySelector('.app-shell');
    if (!window.lingjian || !document.querySelector('#settingsBtn') || !shellNode) return null;
    const shell = shellNode.getBoundingClientRect();
    return {
      ready: Boolean(window.lingjian && document.querySelector('#settingsBtn')),
      size: [innerWidth, innerHeight],
      shell: [shell.left, shell.top, shell.right, shell.bottom],
      resizeHandles: document.querySelectorAll('.window-resize-handle').length,
      duplicateIds: [...document.querySelectorAll('[id]')].map(node => node.id).filter((id, index, all) => all.indexOf(id) !== index)
    };
  })()`, value => Boolean(value?.ready && value.shell[0] === 0 && value.shell[1] === 0));
  assert(mainInitial.ready, 'Main renderer did not initialize');
  assert(mainInitial.shell[0] === 0 && mainInitial.shell[1] === 0,
    `Main shell still has an outer transparent inset: ${JSON.stringify(mainInitial)}`);
  assert(mainInitial.shell[2] === mainInitial.size[0] && mainInitial.shell[3] === mainInitial.size[1],
    `Main shell does not fill its window: ${JSON.stringify(mainInitial)}`);
  assert(mainInitial.resizeHandles === 8, 'Main window is missing resize handles');
  assert(mainInitial.duplicateIds.length === 0, `Duplicate HTML ids: ${mainInitial.duplicateIds.join(', ')}`);

  await main.evaluate(`window.lingjian.openSettingsWindow()`);
  const settingsTarget = await waitForTarget(item => item.type === 'page' && item.url.includes('mode=settings'));
  settings = await connect(settingsTarget);
  await waitForValue(settings, `Boolean(window.lingjian && document.querySelector('#themeSelect') && document.querySelector('#settingsDialog')?.open)`, Boolean);
  const dataDirectoryInfo = await settings.evaluate(`(async () => ({
    apiPath: await window.lingjian.getDataDirectory(),
    displayedPath: document.querySelector('#dataDirectoryPath')?.textContent,
    explanation: document.querySelector('.data-location')?.textContent,
    chooseButton: document.querySelector('#chooseDataDirectoryBtn')?.textContent
  }))()`);
  assert(dataDirectoryInfo.apiPath === dataDirectoryInfo.displayedPath, 'Displayed data directory does not match the active directory');
  assert(dataDirectoryInfo.apiPath === selectedDataDirectory, 'Saved data-directory preference was not restored');
  const recoveredState = JSON.parse(await fs.readFile(path.join(selectedDataDirectory, 'state.json'), 'utf8'));
  assert(Array.isArray(recoveredState.notes) && recoveredState.notes.length > 0, 'Cancel-recovery path did not recreate state.json');
  assert(dataDirectoryInfo.explanation.includes('目录丢失时会提示导入备份'), 'Settings page does not explain missing-directory recovery');
  assert(dataDirectoryInfo.chooseButton.includes('更改默认保存位置'), 'Settings page is missing the data-directory chooser');

  const settingsNavigation = await settings.evaluate(`(() => {
    const result = [];
    for (const button of document.querySelectorAll('[data-settings-section]')) {
      button.click();
      const visible = [...document.querySelectorAll('[data-settings-panel]')].filter(panel => !panel.hidden);
      const scroller = document.querySelector('#settingsScroll');
      result.push({
        section: button.dataset.settingsSection,
        active: button.classList.contains('active'),
        visible: visible.map(panel => panel.dataset.settingsPanel),
        overflow: scroller.scrollWidth - scroller.clientWidth
      });
    }
    document.querySelector('[data-settings-section="appearance"]').click();
    return result;
  })()`);
  assert(settingsNavigation.length === 4 && settingsNavigation.every(item => item.active && item.visible.length === 1 && item.visible[0] === item.section),
    'Settings category navigation did not isolate each panel');
  assert(settingsNavigation.every(item => item.overflow === 0), 'A settings category overflows horizontally');

  const widgetPreviewImage = path.join(selectedDataDirectory, 'backgrounds', 'widget-preview-test.bmp');
  await fs.mkdir(path.dirname(widgetPreviewImage), { recursive: true });
  const widgetPreviewBitmap = Buffer.alloc(58);
  widgetPreviewBitmap.write('BM', 0, 2, 'ascii');
  widgetPreviewBitmap.writeUInt32LE(58, 2);
  widgetPreviewBitmap.writeUInt32LE(54, 10);
  widgetPreviewBitmap.writeUInt32LE(40, 14);
  widgetPreviewBitmap.writeInt32LE(1, 18);
  widgetPreviewBitmap.writeInt32LE(1, 22);
  widgetPreviewBitmap.writeUInt16LE(1, 26);
  widgetPreviewBitmap.writeUInt16LE(24, 28);
  widgetPreviewBitmap.writeUInt32LE(4, 34);
  widgetPreviewBitmap.set([0x33, 0x99, 0xff, 0x00], 54);
  await fs.writeFile(widgetPreviewImage, widgetPreviewBitmap);
  const widgetPreviewPathLiteral = JSON.stringify(widgetPreviewImage);
  const widgetPreviewResult = await settings.evaluate(`(async () => {
    state.settings.widgetBackgroundImagePath = ${widgetPreviewPathLiteral};
    state.settings.widgetBackgroundImageName = 'widget-preview-test.bmp';
    state.settings.widgetBackgroundImageOpacity = .84;
    state.settings.widgetBackground = '#112233';
    state.settings.widgetBackgroundOpacity = 1;
    state.settings.widgetOpacity = 1;
    await window.lingjian.saveSettings({ ...state.settings });
    document.querySelector('[data-settings-section="widget"]').click();
    const deadline = performance.now() + 3000;
    while (document.querySelector('#widgetLivePreview').dataset.imageState !== 'loaded' && performance.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    showWidgetPreview(0);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const preview = document.querySelector('#widgetLivePreview');
    const layer = document.querySelector('#widgetPreviewBackground');
    const beforeImage = layer.style.backgroundImage;
    const color = document.querySelector('#widgetBackgroundColor');
    color.value = '#884422';
    color.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 100));
    const result = {
      imageState: preview.dataset.imageState,
      visible: !preview.hidden && preview.classList.contains('visible'),
      beforeImage,
      afterImage: layer.style.backgroundImage,
      imageOpacity: layer.style.opacity,
      imageSize: layer.style.backgroundSize,
      selectedColor: state.settings.widgetBackground,
      backgroundColor: getComputedStyle(preview).backgroundColor
    };
    hideWidgetPreviewImmediately();
    document.querySelector('[data-settings-section="appearance"]').click();
    return result;
  })()`);
  assert(widgetPreviewResult.imageState === 'loaded' && widgetPreviewResult.visible,
    `Widget preview did not report a loaded visible image: ${JSON.stringify(widgetPreviewResult)}`);
  assert(widgetPreviewResult.beforeImage.startsWith('url(') && widgetPreviewResult.beforeImage.includes('data:image/bmp;base64,'),
    'Widget preview did not render the configured image data');
  assert(widgetPreviewResult.afterImage === widgetPreviewResult.beforeImage,
    'Changing the widget background color removed the preview image');
  assert(widgetPreviewResult.imageOpacity === '0.84' && widgetPreviewResult.imageSize === 'cover',
    `Widget preview image settings differ from the real widget: ${JSON.stringify(widgetPreviewResult)}`);
  assert(widgetPreviewResult.selectedColor.toLowerCase() === '#884422', 'Widget preview background color did not update in real time');
  console.log('[ui-smoke] 胶囊图片预览通过');

  const reminderTest = await settings.evaluate(`(async () => {
    const result = await window.lingjian.testReminder();
    await new Promise(resolve => setTimeout(resolve, 180));
    return {
      result,
      testButton: document.querySelector('#testReminderBtn')?.textContent,
      toastText: [...document.querySelectorAll('.toast')].map(item => item.textContent).join(' ')
    };
  })()`);
  assert(reminderTest.result?.delivered, 'Reminder test IPC did not report delivery');
  assert(reminderTest.result?.methods?.includes('in-app'), 'Reminder test is missing its in-app fallback');
  assert(reminderTest.testButton.includes('立即测试'), 'Settings page is missing the reminder test button');
  assert(reminderTest.toastText.includes('轻笺提醒测试'), 'In-app reminder fallback was not displayed');

  const scheduledReminderId = await main.evaluate(`(async () => {
    window.__scheduledReminderEvents = [];
    window.lingjian.onReminderFired(payload => window.__scheduledReminderEvents.push(payload));
    const id = 'ui-smoke-reminder-' + Date.now();
    state.notes[0].tasks.unshift({
      id,
      text: '自动到点提醒测试',
      details: '',
      done: false,
      color: '#F7B955',
      priority: 'normal',
      quantity: 1,
      createdAt: Date.now(),
      reminder: { enabled: true, at: new Date(Date.now() - 60000).toISOString(), repeat: 'none', lastNotifiedAt: '' }
    });
    await window.lingjian.saveState(state);
    return id;
  })()`);
  await delay(6500);
  const scheduledReminder = await main.evaluate(`(() => {
    const task = state.notes.flatMap(note => note.tasks).find(item => item.id === ${JSON.stringify(scheduledReminderId)});
    return {
      eventCount: window.__scheduledReminderEvents?.filter(payload => payload.taskId === ${JSON.stringify(scheduledReminderId)}).length || 0,
      enabledAfterFire: task?.reminder?.enabled,
      marker: task?.reminder?.lastNotifiedAt || ''
    };
  })()`);
  assert(scheduledReminder.eventCount === 1, 'Due reminder was not fired exactly once by the scheduler');
  assert(scheduledReminder.enabledAfterFire === false, 'One-time reminder was not disabled after delivery');
  assert(Boolean(scheduledReminder.marker), 'Delivered reminder marker was not persisted');
  console.log('[ui-smoke] 提醒测试通过');

  const darkSelect = await settings.evaluate(`(async () => {
    const select = document.querySelector('#themeSelect');
    select.value = 'dark';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 260));
    const option = document.querySelector('#backgroundFit option:nth-child(2)');
    const style = getComputedStyle(option);
    return { dark: document.body.classList.contains('theme-dark'), color: style.color, background: style.backgroundColor };
  })()`);
  assert(darkSelect.dark, 'Dark theme was not applied');
  assert(darkSelect.color !== darkSelect.background, 'Dark select option text is not distinguishable');
  assert(!/rgba?\(255, 255, 255/.test(darkSelect.background), 'Dark select options still use a white popup background');

  await main.evaluate(`(() => {
    window.__appearancePreviewEvents = 0;
    window.__fullStateUpdatesDuringPreview = 0;
    window.lingjian.onAppearancePreview(() => { window.__appearancePreviewEvents += 1; });
    window.lingjian.onStateUpdated(() => { window.__fullStateUpdatesDuringPreview += 1; });
    return true;
  })()`);
  const appearanceFrames = await settings.evaluate(`(async () => {
    const opacity = document.querySelector('#backgroundImageOpacity');
    const color = document.querySelector('#backgroundColor');
    const frameTimes = [];
    let previous = performance.now();
    for (let index = 0; index < 24; index += 1) {
      await new Promise(resolve => requestAnimationFrame(() => {
        const now = performance.now();
        frameTimes.push(now - previous);
        previous = now;
        opacity.value = String(Math.round(10 + index * 80 / 23));
        color.value = index === 23 ? '#336699' : '#' + (0x234567 + index * 0x070503).toString(16).slice(-6).padStart(6, '0');
        opacity.dispatchEvent(new Event('input', { bubbles: true }));
        color.dispatchEvent(new Event('input', { bubbles: true }));
        resolve();
      }));
    }
    const sorted = [...frameTimes].sort((a, b) => a - b);
    return {
      events: frameTimes.length,
      maximumFrameMs: Math.max(...frameTimes),
      p95FrameMs: sorted[Math.floor(sorted.length * .95)],
      output: document.querySelector('#backgroundImageOpacityValue').value,
      finalColor: color.value
    };
  })()`);
  const liveAppearance = await main.evaluate(`(async () => {
    await new Promise(resolve => setTimeout(resolve, 70));
    return {
      opacity: document.querySelector('#mainBackgroundLayer').style.opacity,
      color: state.settings.background,
      previewEvents: window.__appearancePreviewEvents,
      fullStateUpdates: window.__fullStateUpdatesDuringPreview
    };
  })()`);
  assert(appearanceFrames.output === '90%', 'Image opacity value did not update while dragging');
  assert(appearanceFrames.finalColor === '#336699', 'Color input did not retain its live value');
  assert(appearanceFrames.maximumFrameMs < 80, `Appearance preview dropped a long frame: ${appearanceFrames.maximumFrameMs.toFixed(1)}ms`);
  assert(liveAppearance.opacity === '0.9', 'Main background image opacity was not previewed before mouse release');
  assert(liveAppearance.color.toLowerCase() === '#336699', 'Main background color was not previewed in real time');
  assert(liveAppearance.previewEvents > 5 && liveAppearance.previewEvents <= 26, 'Appearance IPC was not coalesced to animation frames');
  assert(liveAppearance.fullStateUpdates === 0, 'A full state save occurred during continuous appearance input');
  await delay(430);
  const savedAppearance = await main.evaluate(`({
    color: state.settings.background,
    opacity: state.settings.backgroundImageOpacity,
    fullStateUpdates: window.__fullStateUpdatesDuringPreview
  })`);
  assert(savedAppearance.color.toLowerCase() === '#336699' && savedAppearance.opacity === 0.9, 'Final appearance values were not persisted');
  assert(savedAppearance.fullStateUpdates >= 1 && savedAppearance.fullStateUpdates <= 2, 'Appearance changes were saved more than once after input settled');

  const guardedEditStart = await settings.evaluate(`(() => {
    const control = document.querySelector('#windowOpacity');
    control.focus();
    control.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 17, button: 0 }));
    control.value = '61';
    control.dispatchEvent(new Event('input', { bubbles: true }));
    const rect = control.getBoundingClientRect();
    return {
      value: control.value,
      output: document.querySelector('#windowOpacityValue').value,
      visualProgress: control.style.getPropertyValue('--range-progress'),
      rangeGroups: document.querySelectorAll('.range-setting').length,
      ungroupedRanges: [...document.querySelectorAll('input.range')].filter(item => !item.closest('.range-setting')).length,
      appearance: getComputedStyle(control).webkitAppearance,
      trackHeight: getComputedStyle(control, '::-webkit-slider-runnable-track').height,
      controlHeight: rect.height,
      pointerEvents: getComputedStyle(control).pointerEvents,
      hitTarget: document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.id || ''
    };
  })()`);
  assert(guardedEditStart.value === '61' && guardedEditStart.output === '61%', 'Window opacity did not enter the live editing state');
  assert(Number.parseFloat(guardedEditStart.visualProgress) > 13 && Number.parseFloat(guardedEditStart.visualProgress) < 14,
    'Window opacity slider did not repaint its progress in real time');
  assert(guardedEditStart.rangeGroups === 9 && guardedEditStart.ungroupedRanges === 0, 'Settings sliders are not grouped with their labels and values');
  assert(guardedEditStart.appearance === 'none', 'Settings slider still relies on the unstable native appearance');
  assert(guardedEditStart.controlHeight === 24 && guardedEditStart.pointerEvents !== 'none' && guardedEditStart.hitTarget === 'windowOpacity',
    `Custom slider is not interactive: ${JSON.stringify(guardedEditStart)}`);

  await main.evaluate(`(async () => {
    const staleState = structuredClone(state);
    staleState.settings.windowOpacity = .99;
    staleState.settings.showCompleted = !staleState.settings.showCompleted;
    await window.lingjian.saveState(staleState);
    return true;
  })()`);
  await delay(160);
  const guardedDuringBroadcast = await settings.evaluate(`(() => ({
    control: document.querySelector('#windowOpacity').value,
    output: document.querySelector('#windowOpacityValue').value,
    local: state.settings.windowOpacity
  }))()`);
  assert(guardedDuringBroadcast.control === '61' && guardedDuringBroadcast.output === '61%' && guardedDuringBroadcast.local === .61,
    'A full-state broadcast overwrote the opacity currently being edited');
  await settings.evaluate(`(() => {
    const control = document.querySelector('#windowOpacity');
    control.dispatchEvent(new Event('change', { bubbles: true }));
    control.blur();
    return true;
  })()`);
  await delay(430);
  const guardedSaved = await main.evaluate(`state.settings.windowOpacity`);
  assert(guardedSaved === .61, 'The guarded opacity edit was not persisted after the state race');
  console.log('[ui-smoke] 外观与状态保护测试通过');

  const settingsSizes = [];
  for (const [width, height] of [[720, 760], [560, 520], [460, 420]]) {
    const result = await settings.evaluate(`(async () => {
      const requestedBounds = await window.lingjian.settingsWindowAction('size', { width: ${width}, height: ${height} });
      const resizeDeadline = performance.now() + 3000;
      while ((innerWidth !== ${width} || innerHeight !== ${height}) && performance.now() < resizeDeadline) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      const dialog = document.querySelector('#settingsDialog').getBoundingClientRect();
      const scroller = document.querySelector('.settings-scroll');
      const badRows = [...document.querySelectorAll('.setting-row')].filter(row => row.scrollWidth > row.clientWidth + 1).length;
      const badRanges = [...document.querySelectorAll('[data-settings-panel]:not([hidden]) .range-setting')].filter(group => {
        const range = group.querySelector('.range');
        return !range || group.scrollWidth > group.clientWidth + 1 || range.getBoundingClientRect().width < 180;
      }).length;
      return {
        size: [innerWidth, innerHeight],
        requestedBounds,
        dialog: [dialog.left, dialog.top, dialog.right, dialog.bottom],
        scroll: [document.documentElement.clientWidth, document.documentElement.scrollWidth],
        badRows,
        badRanges,
        scrollbar: getComputedStyle(scroller, '::-webkit-scrollbar').width,
        minimizeButton: Boolean(document.querySelector('#settingsMinimizeBtn')),
        capsuleClass: document.querySelector('#settingsDialog').classList.contains('collapsed')
      };
    })()`);
    assert(result.size[0] === width && result.size[1] === height,
      `Settings size did not reach ${width}x${height}: ${JSON.stringify(result)}`);
    assert(result.dialog[0] === 0 && result.dialog[1] === 0, `Settings dialog has an outer inset at ${width}x${height}`);
    assert(result.dialog[2] === width && result.dialog[3] === height, `Settings dialog does not fill ${width}x${height}`);
    assert(result.scroll[0] === result.scroll[1], `Settings page overflows horizontally at ${width}x${height}`);
    assert(result.badRows === 0, `Settings rows overflow at ${width}x${height}`);
    assert(result.badRanges === 0, `Settings sliders are misaligned at ${width}x${height}`);
    assert(result.scrollbar === '5px', `Settings scrollbar is not the slim 5px style at ${width}x${height}`);
    assert(result.minimizeButton && !result.capsuleClass, 'Settings minimize still uses the old capsule behavior');
    settingsSizes.push(result);
  }
  console.log('[ui-smoke] 设置窗口尺寸测试通过');

  await settings.evaluate(`window.lingjian.settingsWindowAction('minimize')`);
  await delay(260);
  await main.evaluate(`window.lingjian.openSettingsWindow()`);
  await delay(260);
  const restoredSettings = await settings.evaluate(`({ size: [innerWidth, innerHeight], collapsed: document.querySelector('#settingsDialog').classList.contains('collapsed') })`);
  assert(restoredSettings.size[0] >= 460 && restoredSettings.size[1] >= 420, 'Minimized settings restored as an empty capsule');
  assert(!restoredSettings.collapsed, 'Minimized settings restored with the old collapsed class');

  const settingsReopenCycles = [];
  for (let cycle = 0; cycle < 3; cycle += 1) {
    await settings.evaluate(`(() => { setTimeout(() => window.lingjian.settingsWindowAction('close'), 20); return true; })()`);
    settings.socket.close();
    assert(await waitForTargetGone(item => item.type === 'page' && item.url.includes('mode=settings')), 'Settings target did not close cleanly');
    await main.evaluate(`window.lingjian.openSettingsWindow()`);
    const reopenedTarget = await waitForTarget(item => item.type === 'page' && item.url.includes('mode=settings'));
    settings = await connect(reopenedTarget);
    await waitForValue(settings, `Boolean(window.lingjian && document.querySelector('#settingsDialog')?.open)`, Boolean);
    const reopened = await settings.evaluate(`(() => {
      const ranges = [...document.querySelectorAll('input.range')];
      const selects = [...document.querySelectorAll('.settings-scroll select')];
      const opacity = document.querySelector('#windowOpacity');
      const rect = opacity.getBoundingClientRect();
      return {
        ranges: ranges.length,
        groupedRanges: ranges.filter(item => item.closest('.range-setting')).length,
        rangeValuesReady: ranges.every(item => item.value !== '' && Number.isFinite(Number(item.value))),
        selectsReady: selects.every(item => item.value !== '' && item.selectedIndex >= 0),
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        opacityHitTarget: document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.id || ''
      };
    })()`);
    assert(reopened.ranges === 9 && reopened.groupedRanges === 9 && reopened.rangeValuesReady,
      `Settings sliders were corrupted after reopen cycle ${cycle + 1}`);
    assert(reopened.selectsReady && reopened.horizontalOverflow === 0 && reopened.opacityHitTarget === 'windowOpacity',
      `Settings controls were misaligned after reopen cycle ${cycle + 1}`);
    settingsReopenCycles.push(reopened);
  }
  console.log('[ui-smoke] 设置窗口重复打开测试通过');

  const compactMain = await main.evaluate(`(async () => {
    await window.lingjian.widgetAction('exit');
    await window.lingjian.setMainWindowSize({ width: 420, height: 380 });
    await new Promise(resolve => setTimeout(resolve, 220));
    const shell = document.querySelector('.app-shell').getBoundingClientRect();
    return {
      size: [innerWidth, innerHeight],
      shell: [shell.left, shell.top, shell.right, shell.bottom],
      scroll: [document.documentElement.clientWidth, document.documentElement.scrollWidth],
      mobileMenu: getComputedStyle(document.querySelector('.mobile-menu')).display,
      taskScrollbar: getComputedStyle(document.querySelector('.task-scroll'), '::-webkit-scrollbar').width
    };
  })()`);
  assert(compactMain.size[0] === 420 && compactMain.size[1] === 380, 'Main compact size failed');
  assert(compactMain.shell.join(',') === '0,0,420,380', 'Main compact shell has an outer inset');
  assert(compactMain.scroll[0] === compactMain.scroll[1], 'Main compact layout overflows horizontally');
  assert(compactMain.mobileMenu === 'grid', 'Main compact responsive navigation did not activate');
  assert(compactMain.taskScrollbar === '5px', 'Main task scrollbar is not the slim style');

  const widget = await main.evaluate(`(async () => {
    const probe = document.createElement('div');
    probe.className = 'toast';
    probe.textContent = '胶囊不应显示此提示';
    document.querySelector('#toastRegion').append(probe);
    await window.lingjian.widgetAction('enter');
    await new Promise(resolve => setTimeout(resolve, 260));
    const shell = document.querySelector('.widget-shell').getBoundingClientRect();
    return {
      size: [innerWidth, innerHeight],
      shell: [shell.left, shell.top, shell.right, shell.bottom],
      toastCount: document.querySelector('#toastRegion').childElementCount,
      toastDisplay: getComputedStyle(document.querySelector('#toastRegion')).display
    };
  })()`);
  assert(widget.size[1] === 64, `Collapsed widget height should be 64px, got ${widget.size[1]}px`);
  assert(widget.shell[0] === 0 && widget.shell[1] === 0, 'Widget still has an outer transparent inset');
  assert(widget.shell[2] === widget.size[0] && widget.shell[3] === widget.size[1], 'Widget shell does not fill its window');
  assert(widget.toastCount === 0 && widget.toastDisplay === 'none', 'Homepage toast leaked into widget mode');

  await main.evaluate(`(async () => {
    await window.lingjian.widgetAction('exit');
    await window.lingjian.setMainWindowSize({ width: 920, height: 680 });
    setTimeout(() => window.lingjian.windowAction('quit'), 30);
    return true;
  })()`);

  console.log(JSON.stringify({
    target: packaged ? executable : 'source',
    mainInitial,
    darkSelect,
    dataDirectoryInfo,
    settingsNavigation,
    reminderTest,
    scheduledReminder,
    appearancePerformance: { appearanceFrames, liveAppearance, savedAppearance },
    settingsStateRace: { guardedEditStart, guardedDuringBroadcast, guardedSaved },
    settingsSizes: settingsSizes.map(item => ({ size: item.size, scroll: item.scroll, badRows: item.badRows, badRanges: item.badRanges, scrollbar: item.scrollbar })),
    restoredSettings,
    settingsReopenCycles,
    compactMain,
    widget,
    passed: true
  }, null, 2));
} catch (error) {
  try { await main?.evaluate(`setTimeout(() => window.lingjian.windowAction('quit'), 20); true`); } catch { /* best effort */ }
  console.error(error.stack || error.message);
  if (childLog.trim()) console.error(childLog.trim());
  process.exitCode = 1;
} finally {
  settings?.socket.close();
  main?.socket.close();
  await delay(300);
  if (!child.killed) child.kill();
  await delay(180);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await fs.rm(isolatedUserData, { recursive: true, force: true });
      break;
    } catch (error) {
      if (error.code !== 'EBUSY' || attempt === 9) throw error;
      await delay(300);
    }
  }
}
