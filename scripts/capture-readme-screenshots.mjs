import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const outputDir = path.join(root, 'docs', 'screenshots');
const chromePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const baseUrl = process.env.FIESTAS_BASE_URL || 'http://127.0.0.1:8002';
const debugPort = Number(process.env.CHROME_DEBUG_PORT || 9223);
const userDataDir = `/tmp/fiestas-readme-chrome-${Date.now()}`;

const shots = [
  {
    name: '01-agenda-desktop.png',
    path: '/',
    viewport: { width: 1440, height: 1000 },
    prepare: async (page) => {
      await page.waitForSelector('.fiestas-event-card');
    }
  },
  {
    name: '02-filtro-busqueda.png',
    path: '/',
    viewport: { width: 1440, height: 1000 },
    prepare: async (page) => {
      await page.waitForSelector('.fiestas-event-card');
      await page.evaluate(() => {
        const input = document.querySelector('[data-fiestas-search]');
        input.value = 'folklore';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await page.wait(400);
    }
  },
  {
    name: '03-filtro-tipos.png',
    path: '/',
    viewport: { width: 1440, height: 1000 },
    prepare: async (page) => {
      await page.waitForSelector('.fiestas-event-card');
      await page.click('[data-fiestas-types-toggle]');
      await page.evaluate(() => {
        const input = [...document.querySelectorAll('input[data-type]')].find((item) => item.value === 'Música');
        if (input) {
          input.checked = true;
          input.dispatchEvent(new Event('click', { bubbles: true }));
        }
      });
      await page.wait(400);
    }
  },
  {
    name: '04-favoritos.png',
    path: '/',
    viewport: { width: 1440, height: 1000 },
    prepare: async (page) => {
      await page.waitForSelector('.fiestas-event-card');
      await page.click('[data-fiestas-save]');
      await page.wait(300);
      await page.click('[data-fiestas-favorites-filter]');
      await page.wait(400);
    }
  },
  {
    name: '05-mapa.png',
    path: '/',
    viewport: { width: 1440, height: 1000 },
    prepare: async (page) => {
      await page.waitForSelector('.fiestas-event-card');
      await page.click('[data-view-tab="map"]');
      await page.waitForSelector('.leaflet-container');
      await page.wait(1800);
    }
  },
  {
    name: '06-detalle-evento.png',
    path: '/e/2026-09-04-2030-pregon-de-la-feria-y-fiestas-de-la-virgen-de-san-lorenzo-2026-a-cargo-cf838a77/',
    viewport: { width: 1440, height: 1100 },
    prepare: async (page) => {
      await page.waitForSelector('.fiestas-detail');
      await page.wait(1200);
    }
  },
  {
    name: '07-menu-movil.png',
    path: '/',
    viewport: { width: 390, height: 900, mobile: true },
    prepare: async (page) => {
      await page.waitForSelector('.fiestas-event-card');
      await page.click('[data-menu-open]');
      await page.wait(400);
    }
  },
  {
    name: '08-filtros-movil.png',
    path: '/',
    viewport: { width: 390, height: 900, mobile: true },
    prepare: async (page) => {
      await page.waitForSelector('.fiestas-event-card');
      await page.click('[data-fiestas-mobile-filters-toggle]');
      await page.wait(400);
    }
  },
  {
    name: '09-tema-oscuro.png',
    path: '/',
    viewport: { width: 1440, height: 1000 },
    theme: 'dark',
    prepare: async (page) => {
      await page.waitForSelector('.fiestas-event-card');
      await page.wait(400);
    }
  }
];

async function run() {
  await fs.mkdir(outputDir, { recursive: true });

  const chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${debugPort}`,
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${userDataDir}`,
    'about:blank'
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  try {
    await waitForChrome();
    for (const shot of shots) {
      const page = await createPage();
      try {
        await page.setViewport(shot.viewport);
        await page.setInitialState(shot.theme || 'light');
        await page.navigate(new URL(shot.path, baseUrl).toString());
        await page.waitForLoad();
        await shot.prepare(page);
        await page.screenshot(path.join(outputDir, shot.name));
        console.log(`Captured ${shot.name}`);
      } finally {
        await page.close();
      }
    }
  } finally {
    chrome.kill('SIGTERM');
  }
}

async function waitForChrome() {
  const start = Date.now();
  while (Date.now() - start < 15000) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error('Chrome did not start');
}

async function createPage() {
  const response = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' });
  const target = await response.json();
  return new CdpPage(target.webSocketDebuggerUrl, target.id);
}

class CdpPage {
  constructor(webSocketUrl, targetId) {
    this.targetId = targetId;
    this.nextId = 1;
    this.pending = new Map();
    this.events = new Map();
    this.socket = new WebSocket(webSocketUrl);
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => this.onMessage(event));
  }

  onMessage(event) {
    const message = JSON.parse(event.data);
    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result || {});
      return;
    }
    if (message.method && this.events.has(message.method)) {
      for (const listener of this.events.get(message.method)) listener(message.params || {});
    }
  }

  async send(method, params = {}) {
    await this.ready;
    const id = this.nextId++;
    const promise = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.socket.send(JSON.stringify({ id, method, params }));
    return promise;
  }

  on(method, listener) {
    if (!this.events.has(method)) this.events.set(method, new Set());
    this.events.get(method).add(listener);
    return () => this.events.get(method)?.delete(listener);
  }

  async setViewport({ width, height, mobile = false }) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile
    });
  }

  async setInitialState(theme) {
    await this.send('Page.enable');
    await this.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        localStorage.setItem('aldeapucela_theme', ${JSON.stringify(theme)});
        localStorage.removeItem('fiestasPucela:favorites');
      `
    });
  }

  async navigate(url) {
    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('Page.navigate', { url });
  }

  async waitForLoad() {
    await new Promise((resolve) => {
      const off = this.on('Page.loadEventFired', () => {
        off();
        resolve();
      });
      setTimeout(resolve, 3000);
    });
  }

  async wait(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  async evaluate(fn, ...args) {
    const source = typeof fn === 'function'
      ? `(${fn})(...${JSON.stringify(args)})`
      : String(fn);
    const result = await this.send('Runtime.evaluate', {
      expression: source,
      awaitPromise: true,
      returnByValue: true
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || 'Evaluation failed');
    }
    return result.result?.value;
  }

  async click(selector) {
    await this.evaluate((sel) => {
      const element = document.querySelector(sel);
      if (!element) throw new Error(`Missing selector: ${sel}`);
      element.click();
    }, selector);
  }

  async waitForSelector(selector, timeout = 8000) {
    const found = await this.evaluate((sel, limit) => new Promise((resolve) => {
      const start = Date.now();
      const tick = () => {
        if (document.querySelector(sel)) {
          resolve(true);
          return;
        }
        if (Date.now() - start > limit) {
          resolve(false);
          return;
        }
        setTimeout(tick, 100);
      };
      tick();
    }), selector, timeout);
    if (!found) throw new Error(`Timed out waiting for ${selector}`);
  }

  async screenshot(filePath) {
    const result = await this.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
      fromSurface: true
    });
    await fs.writeFile(filePath, Buffer.from(result.data, 'base64'));
  }

  async close() {
    this.socket.close();
    await fetch(`http://127.0.0.1:${debugPort}/json/close/${this.targetId}`);
  }
}

await run();
