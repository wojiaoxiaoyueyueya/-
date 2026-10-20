import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, '..');
const executable = path.join(project, 'node_modules', 'electron', 'dist', 'electron.exe');
const userData = path.join(os.tmpdir(), 'LingJianDesktopTest');
const dataDirectory = path.join(userData, 'BackgroundMigrationData');
const backgroundDirectory = path.join(dataDirectory, 'backgrounds');
const backgroundPath = path.join(backgroundDirectory, 'main-background.png');
const port = 9740 + Math.floor(Math.random() * 100);

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

await fs.rm(userData, { recursive: true, force: true });
await fs.mkdir(backgroundDirectory, { recursive: true });
await fs.copyFile(path.join(project, 'assets', 'icon.png'), backgroundPath);
await fs.writeFile(path.join(userData, 'data-location.json'), JSON.stringify({
  version: 1,
  path: dataDirectory,
  updatedAt: new Date().toISOString()
}, null, 2), 'utf8');
await fs.writeFile(path.join(dataDirectory, 'state.json'), JSON.stringify({
  version: 5,
  activeNoteId: 'migration-note',
  notes: [{ id: 'migration-note', title: '背景迁移测试', color: '#F7B955', tasks: [] }],
  settings: {
    backgroundImagePath: backgroundPath,
    backgroundImageName: 'main-background.png',
    backgroundImageOpacity: 0
  },
  windowBounds: { width: 920, height: 680 },
  widgetBounds: {}
}, null, 2), 'utf8');

const child = spawn(executable, [`--remote-debugging-port=${port}`, project, '--test-mode'], {
  cwd: project,
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true
});
let log = '';
child.stdout.on('data', chunk => { log += chunk.toString(); });
child.stderr.on('data', chunk => { log += chunk.toString(); });

let socket;
let evaluate;
try {
  let target;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json());
      target = targets.find(item => item.type === 'page' && item.url.includes('index.html') && !item.url.includes('mode=settings'));
      if (target) break;
    } catch { /* Electron is still starting. */ }
    await delay(150);
  }
  assert(target, 'Background migration test window did not start');

  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data));
    if (!message.id || !pending.has(message.id)) return;
    const callbacks = pending.get(message.id);
    pending.delete(message.id);
    if (message.error || message.result?.exceptionDetails) callbacks.reject(new Error(JSON.stringify(message.error || message.result.exceptionDetails)));
    else callbacks.resolve(message.result?.result?.value);
  });
  evaluate = expression => new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({
      id,
      method: 'Runtime.evaluate',
      params: { expression, awaitPromise: true, returnByValue: true }
    }));
  });

  let result;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    result = await evaluate(`(() => {
      if (typeof state === 'undefined') return null;
      return {
        version: state.version,
        opacity: state.settings?.backgroundImageOpacity,
        layerOpacity: document.querySelector('#mainBackgroundLayer')?.style.opacity,
        hasImage: document.querySelector('#mainBackgroundLayer')?.style.backgroundImage?.startsWith('url(')
      };
    })()`);
    if (result?.version === 6 && result?.opacity === .62 && result?.layerOpacity === '0.62' && result?.hasImage) break;
    await delay(120);
  }
  assert(result?.version === 6, 'Version 5 state was not migrated to version 6');
  assert(result?.opacity === .62, 'Hidden saved background opacity was not restored to 62%');
  assert(result?.layerOpacity === '0.62' && result?.hasImage, 'Recovered background was not rendered');

  let persisted;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      persisted = JSON.parse(await fs.readFile(path.join(dataDirectory, 'state.json'), 'utf8'));
      if (persisted.version === 6 && persisted.settings?.backgroundImageOpacity === .62) break;
    } catch { /* Startup migration is still being written. */ }
    await delay(100);
  }
  assert(persisted.version === 6 && persisted.settings.backgroundImageOpacity === .62, 'Recovered background was not persisted');
  console.log(JSON.stringify({ ...result, persisted: true, passed: true }, null, 2));
} catch (error) {
  console.error(error.stack || error.message);
  if (log.trim()) console.error(log.trim());
  process.exitCode = 1;
} finally {
  try { await evaluate?.(`window.lingjian?.windowAction('quit'); true`); } catch { /* best effort */ }
  socket?.close();
  await delay(500);
  if (!child.killed) child.kill();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await fs.rm(userData, { recursive: true, force: true });
      break;
    } catch (error) {
      if (error.code !== 'EBUSY' || attempt === 7) throw error;
      await delay(250);
    }
  }
}
