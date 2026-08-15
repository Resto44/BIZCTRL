import fs from 'node:fs/promises';

const endpoint = 'http://127.0.0.1:9222/json/list';
const targets = await fetch(endpoint).then((response) => response.json());
const target = targets.find((item) => item.type === 'page' && item.url.startsWith('http://127.0.0.1:4173/'));
if (!target?.webSocketDebuggerUrl) throw new Error('No local preview browser target is available.');

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let sequence = 0;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
  }
});
function command(method, params = {}) {
  const id = ++sequence;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
async function evaluate(expression) {
  return command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }).then((result) => result.result.value);
}

await command('Page.enable');
await command('Runtime.enable');
await command('Emulation.setEmulatedMedia', { media: 'screen' });
const viewports = [
  { name: 'iphone', width: 390, height: 844, deviceScaleFactor: 3, mobile: true },
  { name: 'tablet', width: 768, height: 1024, deviceScaleFactor: 2, mobile: true },
  { name: 'windows', width: 1280, height: 900, deviceScaleFactor: 1, mobile: false },
];
const report = [];
for (const viewport of viewports) {
  await command('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: viewport.deviceScaleFactor, mobile: viewport.mobile });
  await new Promise((resolve) => setTimeout(resolve, 450));
  const metrics = await evaluate(`(() => {
    const root = document.documentElement;
    const body = document.body;
    const overflowing = [...document.querySelectorAll('*')].filter((element) => element.scrollWidth > document.documentElement.clientWidth + 1).slice(0, 5).map((element) => element.tagName + '.' + element.className);
    const form = document.querySelector('form');
    const button = [...document.querySelectorAll('button')].find((element) => /تسجيل دخول آمن/.test(element.textContent));
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      direction: root.dir,
      language: root.lang,
      horizontalOverflow: body.scrollWidth > root.clientWidth + 1,
      overflowing,
      formVisible: Boolean(form && form.getBoundingClientRect().width > 0 && form.getBoundingClientRect().right <= root.clientWidth + 1),
      signInVisible: Boolean(button && button.getBoundingClientRect().width > 0 && button.getBoundingClientRect().right <= root.clientWidth + 1),
      localized: document.body.innerText.includes('دخول مالك المنصة'),
    };
  })()`);
  const screenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await fs.writeFile(`/home/ubuntu/verification/platform-owner-${viewport.name}.png`, Buffer.from(screenshot.data, 'base64'));
  report.push({ viewport: viewport.name, configured: viewport, ...metrics });
}
await command('Emulation.clearDeviceMetricsOverride');
await fs.writeFile('/home/ubuntu/verification/platform-owner-responsive.json', `${JSON.stringify(report, null, 2)}\n`);
socket.close();
console.log(JSON.stringify(report, null, 2));
