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

async function targets() {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  return response.json();
}

async function waitForTarget(predicate, timeout = 15000) {
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

  const mainInitial = await waitForValue(main, `(() => {
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
  })()`, Boolean);
  assert(mainInitial.ready, 'Main renderer did not initialize');
  assert(mainInitial.shell[0] === 0 && mainInitial.shell[1] === 0, 'Main shell still has an outer transparent inset');
  assert(mainInitial.shell[2] === mainInitial.size[0] && mainInitial.shell[3] === mainInitial.size[1], 'Main shell does not fill its window');
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

  const settingsSizes = [];
  for (const [width, height] of [[580, 760], [380, 500], [320, 360]]) {
    const result = await settings.evaluate(`(async () => {
      await window.lingjian.settingsWindowAction('size', { width: ${width}, height: ${height} });
      await new Promise(resolve => setTimeout(resolve, 220));
      const dialog = document.querySelector('#settingsDialog').getBoundingClientRect();
      const scroller = document.querySelector('.settings-scroll');
      const badRows = [...document.querySelectorAll('.setting-row')].filter(row => row.scrollWidth > row.clientWidth + 1).length;
      return {
        size: [innerWidth, innerHeight],
        dialog: [dialog.left, dialog.top, dialog.right, dialog.bottom],
        scroll: [document.documentElement.clientWidth, document.documentElement.scrollWidth],
        badRows,
        scrollbar: getComputedStyle(scroller, '::-webkit-scrollbar').width,
        minimizeButton: Boolean(document.querySelector('#settingsMinimizeBtn')),
        capsuleClass: document.querySelector('#settingsDialog').classList.contains('collapsed')
      };
    })()`);
    assert(result.size[0] === width && result.size[1] === height, `Settings size did not reach ${width}x${height}`);
    assert(result.dialog[0] === 0 && result.dialog[1] === 0, `Settings dialog has an outer inset at ${width}x${height}`);
    assert(result.dialog[2] === width && result.dialog[3] === height, `Settings dialog does not fill ${width}x${height}`);
    assert(result.scroll[0] === result.scroll[1], `Settings page overflows horizontally at ${width}x${height}`);
    assert(result.badRows === 0, `Settings rows overflow at ${width}x${height}`);
    assert(result.scrollbar === '5px', `Settings scrollbar is not the slim 5px style at ${width}x${height}`);
    assert(result.minimizeButton && !result.capsuleClass, 'Settings minimize still uses the old capsule behavior');
    settingsSizes.push(result);
  }

  await settings.evaluate(`window.lingjian.settingsWindowAction('minimize')`);
  await delay(260);
  await main.evaluate(`window.lingjian.openSettingsWindow()`);
  await delay(260);
  const restoredSettings = await settings.evaluate(`({ size: [innerWidth, innerHeight], collapsed: document.querySelector('#settingsDialog').classList.contains('collapsed') })`);
  assert(restoredSettings.size[0] >= 320 && restoredSettings.size[1] >= 360, 'Minimized settings restored as an empty capsule');
  assert(!restoredSettings.collapsed, 'Minimized settings restored with the old collapsed class');

  const compactMain = await main.evaluate(`(async () => {
    await window.lingjian.widgetAction('exit');
    await window.lingjian.setMainWindowSize({ width: 520, height: 480 });
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
  assert(compactMain.size[0] === 520 && compactMain.size[1] === 480, 'Main compact size failed');
  assert(compactMain.shell.join(',') === '0,0,520,480', 'Main compact shell has an outer inset');
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
    reminderTest,
    scheduledReminder,
    appearancePerformance: { appearanceFrames, liveAppearance, savedAppearance },
    settingsSizes: settingsSizes.map(item => ({ size: item.size, scroll: item.scroll, badRows: item.badRows, scrollbar: item.scrollbar })),
    restoredSettings,
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
  await fs.rm(isolatedUserData, { recursive: true, force: true });
}
