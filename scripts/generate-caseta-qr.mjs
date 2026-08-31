import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import QRCode from 'qrcode';
import { createCasetaQrPosterSvg, createCasetaQrTargetUrl, createCompactQrSvg } from './caseta-qr.mjs';
import { getCasetaPublicSlug } from './caseta-routes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'src', 'data', 'fiestas-2026', 'casetas.json');
const outputDir = path.join(root, 'src', 'assets', 'qr', 'casetas');
const posterBasePath = path.join(root, 'src', 'assets', 'qr', 'caseta-poster-base.jpg');
const publicBaseUrl = 'https://fiestas.aldeapucela.org';
const force = process.argv.includes('--force');
const onlyId = process.argv.find((argument) => argument.startsWith('--only='))?.slice('--only='.length) || '';
const execFileAsync = promisify(execFile);

const source = JSON.parse(await fs.readFile(sourcePath, 'utf8'));
if (source?.schemaVersion !== 1 || !Array.isArray(source?.casetas)) {
  throw new Error('El catálogo de casetas no tiene el formato esperado.');
}

await fs.mkdir(outputDir, { recursive: true });
const posterBase = await fs.readFile(posterBasePath);
const posterBaseDataUri = 'data:image/jpeg;base64,' + posterBase.toString('base64');
let generated = 0;
let skipped = 0;
let browser;
let page;
let renderer = 'playwright';

for (const caseta of source.casetas) {
  const id = String(caseta.id || '').trim();
  const name = String(caseta.name || '').trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || !name) throw new Error(`Caseta inválida: ${id || '(sin ID)'}`);
  if (onlyId && id !== onlyId) continue;

  const pngPath = path.join(outputDir, `${id}.png`);
  if (!force) {
    try {
      await fs.access(pngPath);
      skipped += 1;
      continue;
    } catch (_) {
      // Es la primera generación de este cartel.
    }
  }

  const canonicalUrl = createCasetaQrTargetUrl({ baseUrl: publicBaseUrl, publicSlug: getCasetaPublicSlug(caseta) });
  const qrCode = QRCode.create(canonicalUrl, { errorCorrectionLevel: 'M' });
  const poster = createCasetaQrPosterSvg({
    qrSvg: createCompactQrSvg(qrCode),
    posterBaseDataUri,
    siteUrl: canonicalUrl
  });
  if (!browser && renderer === 'playwright') {
    const executablePath = process.env.FIESTAS_QR_BROWSER || undefined;
    try {
      browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
      page = await browser.newPage({ viewport: { width: 904, height: 1280 }, deviceScaleFactor: 1 });
    } catch (error) {
      renderer = 'magick';
      console.warn(`No se pudo iniciar el renderizador del navegador (${error.message}). Se usará ImageMagick.`);
    }
  }
  if (renderer === 'playwright') {
    const svgDataUrl = 'data:image/svg+xml;base64,' + Buffer.from(poster).toString('base64');
    const rawPngPath = `${pngPath}.raw.png`;
    try {
      await page.goto(svgDataUrl, { waitUntil: 'load' });
      await page.locator('svg').screenshot({ path: rawPngPath });
      await execFileAsync('magick', [rawPngPath, '-depth', '8', '-strip', '-colors', '256', pngPath]);
    } finally {
      await fs.rm(rawPngPath, { force: true });
    }
  } else {
    const svgPath = path.join(outputDir, `.tmp-${id}.svg`);
    const fallbackPoster = createCasetaQrPosterSvg({
      qrSvg: createCompactQrSvg(qrCode),
      posterBaseHref: pathToFileURL(posterBasePath).href,
      siteUrl: canonicalUrl
    });
    await fs.writeFile(svgPath, fallbackPoster);
    try {
      await execFileAsync('magick', [svgPath, '-background', 'none', '-depth', '8', '-strip', '-colors', '256', pngPath]);
    } finally {
      await fs.rm(svgPath, { force: true });
    }
  }
  generated += 1;
}

if (browser) await browser.close();
console.log(`Carteles QR: ${generated} generados, ${skipped} ya existentes${force ? ' (forzado)' : ''}.`);
