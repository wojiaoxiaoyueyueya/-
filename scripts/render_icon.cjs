'use strict';

const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.commandLine.appendSwitch('force-device-scale-factor', '1');

app.whenReady().then(async () => {
  const project = path.join(__dirname, '..');
  const source = fs.readFileSync(path.join(project, 'assets', 'icon.svg'), 'utf8');
  const window = new BrowserWindow({
    width: 512,
    height: 512,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: { offscreen: true }
  });
  const html = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:512px;height:512px;overflow:hidden;background:transparent}svg{display:block;width:512px;height:512px}</style>${source}`;
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await new Promise(resolve => setTimeout(resolve, 120));
  const image = await window.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  fs.writeFileSync(path.join(project, 'assets', 'icon.png'), image.toPNG());
  window.destroy();
  app.quit();
}).catch(error => {
  console.error(error);
  app.exit(1);
});
