import { test as base, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const leafletDist = path.join(root, 'node_modules', 'leaflet', 'dist');

const LOCAL_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]']);

// PNG transparente de 1x1 para sustituir teselas del mapa y carteles remotos.
const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

const CORS = { 'access-control-allow-origin': '*' };

// Leaflet se sirve desde node_modules en vez de unpkg: es el mismo fichero
// publicado en npm, byte a byte, así que el SRI que fija el repo se verifica
// de verdad (si alguien cambia el hash, el navegador rechaza el script y el
// test del mapa falla) y la suite no depende de la red.
function leafletBody(pathname) {
  const file = pathname.endsWith('.css') ? 'leaflet.css' : 'leaflet.js';
  return {
    body: fs.readFileSync(path.join(leafletDist, file)),
    contentType: file.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8'
  };
}

function json(value) {
  return { status: 200, contentType: 'application/json; charset=utf-8', headers: CORS, body: JSON.stringify(value) };
}

// Cada entrada responde a un dominio que el front consulta en producción.
// Lo que no esté aquí se aborta y hace fallar el test: la suite no puede
// depender de terceros ni mandar telemetría desde CI.
function stubFor(url) {
  const { hostname, pathname } = url;

  if (hostname === 'unpkg.com') {
    const { body, contentType } = leafletBody(pathname);
    return { status: 200, contentType, headers: CORS, body };
  }

  if (hostname.endsWith('.basemaps.cartocdn.com')) {
    return { status: 200, contentType: 'image/png', headers: CORS, body: PIXEL_PNG };
  }

  if (hostname === 'api.aldeapucela.org') {
    if (pathname === '/weather') return json({ daily: [], hourly: [] });
    if (pathname === '/fiestas/saves') return json({ ok: true, activities: [] });
    if (pathname === '/fiestas/plan-adds') return json({ ok: true, plans: [] });
    return json({ ok: true });
  }

  // Font Awesome y los carteles alojados en otros dominios de Aldea Pucela o
  // en las webs de venta de entradas: no aportan nada al comportamiento.
  if (hostname === 'eventos.aldeapucela.org') {
    return { status: 200, contentType: 'text/css; charset=utf-8', headers: CORS, body: '' };
  }
  if (/\.(png|jpe?g|webp|gif|svg|avif)$/i.test(pathname)) {
    return { status: 200, contentType: 'image/png', headers: CORS, body: PIXEL_PNG };
  }

  return null;
}

export const test = base.extend({
  // Sustituye a `page`: instala el aislamiento de red y recoge errores de
  // consola y respuestas fallidas para que los tests puedan afirmar sobre ellos.
  page: async ({ page }, use) => {
    const blocked = [];
    const consoleErrors = [];
    const failedResponses = [];

    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(String(error)));
    page.on('response', (response) => {
      if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
    });

    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (LOCAL_HOSTNAMES.has(url.hostname)) return route.continue();

      const stub = stubFor(url);
      if (stub) return route.fulfill(stub);

      blocked.push(url.href);
      return route.abort();
    });

    page.consoleErrors = consoleErrors;
    page.failedResponses = failedResponses;

    await use(page);

    expect(blocked, `La suite no debe llamar a dominios externos sin simular: ${blocked.join(', ')}`).toEqual([]);
  }
});

export { expect };
