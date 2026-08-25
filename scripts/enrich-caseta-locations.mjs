import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'src', 'data', 'fiestas-2026', 'casetas.json');
const cachePath = path.join(root, '.cache', 'fiestas', 'nominatim-caseta-location-cache.json');
const reportsDir = path.join(root, '.cache', 'fiestas', 'reports');
const userAgent = 'AldeaPucelaFiestas/1.0 (contacto@aldeapucela.org)';
const args = parseArgs(process.argv.slice(2));
const provider = createProvider(args.provider);

const source = JSON.parse(await fs.readFile(sourcePath, 'utf8'));
validateSource(source);
const cache = await readJson(cachePath, {});
const report = {
  mode: args.apply ? 'apply' : 'dry-run',
  provider: provider.name,
  generatedAt: new Date().toISOString(),
  totals: { casetas: source.casetas.length, audited: 0, modified: 0, missing: 0, ambiguous: 0, skipped: 0 },
  missing: [],
  ambiguous: [],
  modified: [],
  skipped: []
};

for (const caseta of source.casetas) {
  if (caseta.coordinates && !args.repair) {
    report.totals.skipped += 1;
    report.skipped.push({ id: caseta.id, name: caseta.name, reason: 'Tiene coordenadas válidas; no se geocodifica sin --repair.' });
    continue;
  }

  report.totals.audited += 1;
  const query = normalizeText(caseta.addressQuery || `${caseta.location}, Valladolid, España`);
  const item = { id: caseta.id, name: caseta.name, location: caseta.location, query };
  if (!query) {
    report.totals.missing += 1;
    report.missing.push({ ...item, reason: 'No hay una dirección suficiente para consultar.' });
    continue;
  }

  const result = await cachedSearch(query);
  if (!result) {
    report.totals.missing += 1;
    report.missing.push({ ...item, reason: 'Sin coincidencias.' });
    continue;
  }
  if (result.ambiguous || result.accuracy < 0.72) {
    report.totals.ambiguous += 1;
    report.ambiguous.push({ ...item, candidate: result });
    continue;
  }

  const coordinates = {
    lat: result.lat,
    lng: result.lng,
    source: result.source,
    osmType: result.osmType,
    osmId: result.osmId,
    displayName: result.displayName,
    query,
    accuracy: result.accuracy,
    geocodedAt: new Date().toISOString()
  };
  report.totals.modified += 1;
  report.modified.push({ ...item, coordinates });
  if (args.apply) caseta.coordinates = coordinates;
}

if (args.apply && report.totals.modified) {
  await fs.writeFile(sourcePath, JSON.stringify(source, null, 2) + '\n');
}

await fs.mkdir(path.dirname(cachePath), { recursive: true });
await fs.writeFile(cachePath, JSON.stringify(cache, null, 2) + '\n');
await fs.mkdir(reportsDir, { recursive: true });
const reportPath = path.join(reportsDir, `caseta-location-report-${stamp()}.json`);
await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');

console.log(JSON.stringify({
  reportPath: path.relative(root, reportPath),
  totals: report.totals,
  mode: report.mode,
  provider: report.provider
}, null, 2));

function validateSource(value) {
  if (value?.schemaVersion !== 1 || value?.festival !== 'valladolid-2026' || !Array.isArray(value.casetas)) {
    throw new Error('El JSON de casetas debe usar schemaVersion 1 y festival valladolid-2026.');
  }
}

function parseArgs(values) {
  const parsed = { apply: false, repair: false, provider: 'audit' };
  for (const value of values) {
    if (value === '--apply') parsed.apply = true;
    else if (value === '--dry-run') parsed.apply = false;
    else if (value === '--repair') parsed.repair = true;
    else if (value.startsWith('--provider=')) parsed.provider = value.split('=')[1] || 'audit';
  }
  return parsed;
}

function createProvider(name) {
  if (name === 'audit') return { name, delayMs: 0, search: async () => null };
  if (name !== 'nominatim') throw new Error(`Proveedor no soportado: ${name}`);
  return {
    name,
    delayMs: 1100,
    async search(query) {
      const url = new URL('https://nominatim.openstreetmap.org/search');
      url.searchParams.set('q', query);
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('limit', '3');
      url.searchParams.set('addressdetails', '1');
      const response = await fetch(url, {
        headers: { 'User-Agent': userAgent, 'Accept-Language': 'es' }
      });
      if (!response.ok) throw new Error(`Nominatim respondió ${response.status}`);
      const results = await response.json();
      if (!Array.isArray(results) || !results.length) return null;
      const best = results[0];
      const accuracy = scoreResult(best, query);
      return {
        lat: Number(best.lat),
        lng: Number(best.lon),
        source: 'OpenStreetMap Nominatim',
        osmType: best.osm_type,
        osmId: best.osm_id,
        displayName: best.display_name,
        accuracy,
        ambiguous: results.length > 1 && accuracy < 0.86,
        rawCount: results.length
      };
    }
  };
}

async function cachedSearch(query) {
  if (provider.name === 'audit') return null;
  const key = normalizeText(query).toLowerCase();
  if (!cache[key]) {
    cache[key] = await provider.search(query);
    await wait(provider.delayMs);
  }
  return cache[key];
}

function scoreResult(result, query) {
  const haystack = normalizeText([result.display_name, result.name, result.type, result.class].filter(Boolean).join(' ')).toLowerCase();
  const words = normalizeText(query).toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3);
  if (!words.length) return 0;
  const matches = words.filter((word) => haystack.includes(word)).length;
  const base = matches / words.length;
  const inValladolid = haystack.includes('valladolid') ? 0.2 : 0;
  return Math.min(1, Number((base + inValladolid).toFixed(2)));
}

function normalizeText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}
