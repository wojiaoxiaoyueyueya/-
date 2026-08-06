const port = Number(process.argv[2] || 9467);
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

let target;
for (let attempt = 0; attempt < 40; attempt += 1) {
  try {
    const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json());
    target = pages.find(item => item.type === 'page' && item.url.includes('index.html') && !item.url.includes('mode=settings'));
    if (target) break;
  } catch { /* The portable executable may still be unpacking. */ }
  await delay(200);
}
if (!target) throw new Error('Main reminder test target not found');

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

const response = await new Promise((resolve, reject) => {
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data));
    if (message.id !== 1) return;
    if (message.error || message.result?.exceptionDetails) reject(new Error(JSON.stringify(message.error || message.result.exceptionDetails)));
    else resolve(message.result.result.value);
  });
  socket.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: { expression: 'window.lingjian.testReminder()', awaitPromise: true, returnByValue: true }
  }));
});

console.log(JSON.stringify(response, null, 2));
socket.close();
