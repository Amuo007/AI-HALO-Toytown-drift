import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;
const URL = 'http://localhost:8094/?demo=1&view=car&auto=1';
const SECONDS = Number(process.argv[2] || 22);
const OUT = 'shots/tmp/frames';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new', '--user-data-dir=/tmp/toytown-rec',
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  `--remote-debugging-port=${PORT}`, '--window-size=1280,720', URL,
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));

let targets = [];
for (let i = 0; i < 60; i++) {
  try {
    targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
    if (targets.length) break;
  } catch (e) {}
  await sleep(500);
}
const page = targets.find(t => t.type === 'page');
if (!page) { console.error('no page target'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let id = 0;
const pending = new Map();
const frames = [];
ws.onmessage = ev => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  if (msg.method === 'Page.screencastFrame') {
    frames.push(msg.params.data);
    send('Page.screencastFrameAck', { sessionId: msg.params.sessionId });
  }
};
function send(method, params = {}) {
  return new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
}

await send('Page.enable');
for (;;) {
  const r = await send('Runtime.evaluate', { expression: 'window.__ready===true' });
  if (r.result && r.result.result && r.result.result.value === true) break;
  await sleep(500);
}
console.log('game ready; recording', SECONDS, 's ...');
await send('Page.startScreencast', { format: 'jpeg', quality: 70, maxWidth: 960, maxHeight: 540, everyNthFrame: 1, fps: 15 });
await sleep(SECONDS * 1000);
await send('Page.stopScreencast');
await sleep(500);
frames.forEach((f, i) => fs.writeFileSync(path.join(OUT, `${String(i).padStart(4, '0')}.jpg`), Buffer.from(f, 'base64')));
console.log('frames captured:', frames.length);
ws.close();
chrome.kill();
