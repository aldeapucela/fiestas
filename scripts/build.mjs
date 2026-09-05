import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import nunjucks from 'nunjucks';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import { transform as esbuildTransform } from 'esbuild';
import sharp from 'sharp';
import { readManifest, scanUsedIcons } from './build-icons.mjs';
import { jsonForScript } from './json-for-script.mjs';
import { casetaDetailPath, casetaLegacyPaths, casetaQrPath, getCasetaPublicSlug, slugifyCaseta } from './caseta-routes.mjs';
import { assertRegistryIntegrity, normalizeImportRegistry } from './event-import-registry.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const publicBaseUrl = 'https://fiestas.aldeapucela.org';
const communityPromptCampaign = {
  id: 'valladolid-2026',
  startDate: '2026-08-31',
  endDate: '2026-09-13'
};
const analyticsConfig = {
  enabled: parseBooleanEnv(process.env.FIESTAS_ANALYTICS_ENABLED),
  trackerUrl: process.env.FIESTAS_MATOMO_URL || 'https://stats.aldeapucela.org/',
  siteId: process.env.FIESTAS_MATOMO_SITE_ID || '29'
};
const communityPlanIcons = new Set([
  'stars', 'music', 'microphone', 'cocktail', 'beer', 'food', 'dance', 'theater', 'masks',
  'fireworks', 'parade', 'family', 'children', 'sports', 'religious', 'camera', 'art',
  'culture', 'map', 'calendar', 'heart', 'layers'
]);
const casetaPalette = [
  '#0f9f8d', '#73579f', '#d48625', '#1976a8', '#ba3d3d', '#087e8c',
  '#b94f72', '#4f7cac', '#d06b37', '#657a3b', '#9b5de5', '#a44a3f'
];
const casetaMenuCollator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });
const casetaDietaryLabels = new Set(['vegetarian', 'vegan']);
const casetaCityCenter = { lat: 41.6523, lng: -4.7245 };
const casetaCityRadiusKm = 12;
const vallabusStopsUrl = process.env.FIESTAS_VALLABUS_STOPS_URL || 'https://gtfs.vallabus.com/paradas/';
const vallabusStopsTimeoutMs = 8000;
const vallabusNearbyRadiusMeters = 500;
const vallabusNearbyFallbackRadiusMeters = 1000;
const vallabusNearbyStopLimit = 3;
const transitLineCollator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
const eventImportRegistryPath = path.join(root, 'src', 'data', 'fiestas-2026', 'event-import-registry.json');
const env = nunjucks.configure(path.join(root, 'src', 'templates'), { autoescape: true, noCache: true });

env.addFilter('urlencode', (value) => encodeURIComponent(String(value || '')));
env.addFilter('dumpForScript', (value) => jsonForScript(value));
env.addFilter('dump', (value) => JSON.stringify(value));
env.addFilter('slugify', (value) => slugify(value));

function parseBooleanEnv(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

function slugify(value = '') {
  return String(value).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'evento';
}

function casetaColor(id = '') {
  return casetaPalette[stableHash(id) % casetaPalette.length];
}

function normalizeCasetaDetails(details) {
  if (!details || typeof details !== 'object') return null;
  return {
    ...details,
    menuSections: normalizeCasetaMenuSections(details.menuSections)
  };
}

function normalizeCasetaMenuSections(sections) {
  if (!Array.isArray(sections)) return [];
  const ids = new Set();
  return sections.map((section) => {
    const isObject = section && typeof section === 'object' && !Array.isArray(section);
    const votable = isObject && section.votable === true;
    const items = Array.isArray(section?.items)
      ? section.items
        .map((item) => normalizeCasetaMenuItem(item, votable))
        .filter(Boolean)
        .map((item) => {
          if (item.id && ids.has(item.id)) throw new Error(`El ID de plato de caseta "${item.id}" está duplicado.`);
          if (item.id) ids.add(item.id);
          return item;
        })
        .sort((left, right) => casetaMenuCollator.compare(left.name, right.name))
      : [];
    return {
      ...(isObject ? section : {}),
      votable,
      items
    };
  });
}

function normalizeCasetaMenuItem(item, votable = false) {
  const isObject = item && typeof item === 'object' && !Array.isArray(item);
  const id = String(isObject ? item.id || '' : '').trim().toLowerCase();
  const name = String(isObject ? item.name || '' : item || '').trim();
  if (!name) return null;
  if (votable && !id) throw new Error(`El plato de caseta "${name}" necesita un ID estable.`);
  if (id && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    throw new Error(`El plato de caseta "${name}" tiene un ID inválido.`);
  }
  const dietary = String(isObject ? item.dietary || '' : '').trim().toLowerCase();
  if (dietary && !casetaDietaryLabels.has(dietary)) {
    throw new Error(`El plato "${name}" tiene una clasificación dietética no válida.`);
  }
  const description = String(isObject ? item.description || '' : '').trim();
  const price = String(isObject ? item.price || '' : '').trim();
  const glutenFree = isObject && item.glutenFree === true;
  if (isObject && item.glutenFree != null && typeof item.glutenFree !== 'boolean') {
    throw new Error(`El plato "${name}" tiene un valor glutenFree no válido.`);
  }
  return {
    ...(id ? { id } : {}),
    name,
    ...(description ? { description } : {}),
    ...(price ? { price } : {}),
    ...(dietary ? { dietary } : {}),
    ...(glutenFree ? { glutenFree: true } : {})
  };
}

function fiestas2026Icon(type = '') {
  const icons = {
    danza: 'fa-person-dress', deporte: 'fa-person-running', exposicion: 'fa-image', folklore: 'fa-guitar',
    'fuegos-artificiales': 'fa-wand-sparkles', gastronomia: 'fa-utensils', 'infantil-y-familiar': 'fa-children',
    magia: 'fa-hat-wizard', musica: 'fa-music', 'humor-y-monologos': 'fa-masks-theater', otros: 'fa-star', penas: 'fa-people-group',
    religioso: 'fa-place-of-worship', talleres: 'fa-screwdriver-wrench', teatro: 'fa-masks-theater', toros: 'fa-circle-dot'
  };
  return icons[slugify(type)] || 'fa-calendar-day';
}

function socialCategorySlug(type = '') {
  const slug = slugify(type);
  return slug === 'humor-y-monologos' ? 'teatro' : slug;
}

async function communityPlanSocial(communityPlan) {
  const relativePath = `/assets/social/plans/${communityPlan.id}.jpg`;
  await fs.access(path.join(root, 'src', relativePath));
  return {
    image: publicBaseUrl + relativePath,
    imageAlt: `${communityPlan.name}, creado por ${communityPlan.author}`,
    imageWidth: 1200,
    imageHeight: 630,
    imageType: 'image/jpeg'
  };
}

async function writeFile(relPath, content) {
  const filePath = path.join(dist, relPath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);
}

function contentVersion(seed) {
  const hash = createHash('sha256');
  for (const [relPath, content] of seed) {
    hash.update(relPath).update('\0').update(content).update('\0');
  }
  return hash.digest('hex').slice(0, 12);
}

async function compileCss(cssVersionSeed) {
  const input = path.join(root, 'src', 'styles', 'fiestas-2026.css');
  const icons = await fs.readFile(path.join(root, 'src', 'styles', 'fontawesome-subset.css'), 'utf8');
  const base = await fs.readFile(path.join(root, 'src', 'styles', 'base.css'), 'utf8');
  const page = await fs.readFile(input, 'utf8');
  const result = await postcss([
    tailwindcss({ config: path.join(root, 'tailwind.config.js') }),
    autoprefixer()
  ]).process(icons + '\n' + base + '\n' + page, { from: input, to: path.join(dist, 'assets', 'css', 'fiestas-2026.css') });
  const { code } = await esbuildTransform(result.css, { loader: 'css', minify: true, charset: 'utf8' });
  cssVersionSeed.push(['assets/css/fiestas-2026.css', code]);
  return code;
}

async function copyJs(jsVersionSeed) {
  const files = ['analytics.js', 'plan-storage.js', 'plan-export.js', 'plans-page.js', 'community-plans.js', 'community-prompt.js', 'popular-page.js', 'popular-dishes-page.js', 'weather.js', 'fiestas-2026.js', 'casetas-page.js', 'casetas-navigation.js', 'search-text.js', 'casetas-favorites.js', 'caseta-dish-likes.js', 'menu-drawer.js', 'pwa.js', 'scroll-top.js', 'subscribe.js', 'theme.js', 'chatbot.js', 'visit-tracker.js', 'events-data.js'];
  const contents = new Map();
  for (const file of files) {
    const source = await fs.readFile(path.join(root, 'src', 'scripts', file), 'utf8');
    const { code } = await esbuildTransform(source, { loader: 'js', minify: true, charset: 'utf8' });
    contents.set(file, code);
    jsVersionSeed.push(['assets/js/' + file, code]);
  }
  return contents;
}

async function writeVersionedJs(contents, jsVersion) {
  const jsDir = path.join(dist, 'assets', 'js');
  await fs.mkdir(jsDir, { recursive: true });
  for (const [file, content] of contents) {
    const versioned = content.replace(/(['"])\.\/([A-Za-z0-9_-]+)\.js\1/g, '$1./$2.' + jsVersion + '.js$1');
    const versionedFile = file.replace(/\.js$/, '.' + jsVersion + '.js');
    await fs.writeFile(path.join(jsDir, versionedFile), versioned);
  }
}

async function writeVersionedCss(cssVersion, css) {
  const cssDir = path.join(dist, 'assets', 'css');
  await fs.mkdir(cssDir, { recursive: true });
  await fs.writeFile(path.join(cssDir, 'fiestas-2026.' + cssVersion + '.css'), css);
}

async function loadPwaFiles() {
  const pwaDir = path.join(root, 'src', 'pwa');
  return {
    serviceWorker: await fs.readFile(path.join(pwaDir, 'sw.js'), 'utf8'),
    offlinePage: await fs.readFile(path.join(pwaDir, 'offline.html'), 'utf8')
  };
}

async function writePwaFiles({ serviceWorker, offlinePage }, { appVersion, cssVersion, jsVersion, eventsDataUrl }) {
  const renderedServiceWorker = serviceWorker
    .replaceAll('__APP_VERSION__', appVersion)
    .replaceAll('__CSS_VERSION__', cssVersion)
    .replaceAll('__JS_VERSION__', jsVersion)
    .replaceAll('__EVENTS_DATA_URL__', eventsDataUrl);
  await writeFile('sw.js', renderedServiceWorker);
  await writeFile('offline.html', offlinePage);
}

async function assertIconSubsetIsFresh() {
  const manifest = await readManifest();
  const available = new Set(manifest.icons);
  const missing = (await scanUsedIcons()).filter((name) => !available.has(name));
  if (missing.length) {
    throw new Error('Iconos sin glifo en el subset de Font Awesome: ' + missing.join(', ') + '. Ejecuta `npm run icons`; si siguen faltando es que no existen en FA Free: usa otro icono.');
  }
}

async function copyStaticAssets(assetVersionSeed) {
  const sourceDir = path.join(root, 'src', 'assets');
  try {
    await copyAssetDir(sourceDir, sourceDir, assetVersionSeed);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function copyCommunityPlansData(assetVersionSeed) {
  const sourcePath = path.join(root, 'src', 'data', 'community-plans.json');
  const raw = await fs.readFile(sourcePath, 'utf8');
  const value = JSON.parse(raw);
  if (value?.schemaVersion !== 1 || value?.festival !== 'valladolid-2026' || !Array.isArray(value?.plans)) {
    throw new Error('The community plans catalog must use schemaVersion 1 and festival valladolid-2026.');
  }
  const ids = new Set();
  const plans = await Promise.all(value.plans.map(async (entry, index) => {
    if (!entry || typeof entry !== 'object') throw new Error(`Community plan ${index + 1} must be an object.`);
    const id = String(entry.id || '').trim();
    const name = String(entry.name || '').trim();
    const author = String(entry.author || '').trim();
    const iconValue = String(entry.icon || 'layers').trim().toLowerCase();
    const icon = communityPlanIcons.has(iconValue) ? iconValue : 'layers';
    const url = normalizeCommunityPlanUrl(entry.url);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error(`Community plan ${index + 1} has an invalid stable id.`);
    if (ids.has(id)) throw new Error(`Community plan id "${id}" is duplicated.`);
    if (!name || name.length > 80) throw new Error(`Community plan "${id}" must have a name between 1 and 80 characters.`);
    if (!author || author.length > 80) throw new Error(`Community plan "${id}" must have an author between 1 and 80 characters.`);
    if (!url) throw new Error(`Community plan "${id}" must have a valid JSON url.`);
    ids.add(id);
    const metadata = await readCommunityPlanMetadata(url, id);
    return { id, name, author, icon, url, ...metadata };
  }));
  const content = JSON.stringify({
    schemaVersion: 1,
    festival: 'valladolid-2026',
    ...(value.updatedAt ? { updatedAt: String(value.updatedAt) } : {}),
    plans
  }, null, 2) + '\n';
  await writeFile('data/planes.json', content);
  assetVersionSeed.push(['data/planes.json', createHash('sha256').update(content).digest('hex')]);
  return plans;
}

async function readCommunityPlanMetadata(url, id) {
  const parsedUrl = new URL(url, publicBaseUrl);
  if (parsedUrl.origin !== new URL(publicBaseUrl).origin || !parsedUrl.pathname.startsWith('/data/community-plans/')) return {};

  const sourceDir = path.resolve(root, 'src', 'data', 'community-plans');
  const fileName = path.basename(parsedUrl.pathname);
  const sourcePath = path.resolve(sourceDir, fileName);
  if (path.dirname(sourcePath) !== sourceDir) throw new Error(`Community plan "${id}" points outside the local data directory.`);

  const raw = await fs.readFile(sourcePath, 'utf8');
  const value = JSON.parse(raw);
  if (value?.schemaVersion !== 1 || value?.festival !== 'valladolid-2026' || !Array.isArray(value?.plans)) {
    throw new Error(`Community plan "${id}" has an invalid export.`);
  }

  const activityIds = new Set();
  for (const sourcePlan of value.plans) {
    if (!sourcePlan || typeof sourcePlan !== 'object' || !Array.isArray(sourcePlan.activityIds)) continue;
    for (const activityId of sourcePlan.activityIds) {
      const normalizedId = String(activityId).trim();
      if (normalizedId) activityIds.add(normalizedId);
    }
  }

  const activityCount = activityIds.size;
  return {
    activityCount,
    summary: `${activityCount} ${activityCount === 1 ? 'actividad' : 'actividades'}`
  };
}

function normalizeCommunityPlanUrl(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.startsWith('/') && !text.startsWith('/data/')) return '';
  try {
    const url = new URL(text, publicBaseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || !url.pathname.toLowerCase().endsWith('.fiestas-plan.json')) return '';
    return text.startsWith('/') ? url.pathname + url.search : url.href;
  } catch (_) {
    return '';
  }
}

function communityPlanIconClass(icon = '') {
  const icons = {
    stars: 'fa-star',
    music: 'fa-music',
    microphone: 'fa-microphone',
    cocktail: 'fa-wine-glass',
    beer: 'fa-beer-mug-empty',
    food: 'fa-utensils',
    dance: 'fa-person-dress',
    theater: 'fa-masks-theater',
    masks: 'fa-mask-face',
    fireworks: 'fa-wand-sparkles',
    parade: 'fa-drum',
    family: 'fa-people-roof',
    children: 'fa-child-reaching',
    sports: 'fa-person-running',
    religious: 'fa-place-of-worship',
    camera: 'fa-camera',
    art: 'fa-palette',
    culture: 'fa-book-open',
    map: 'fa-map-location-dot',
    calendar: 'fa-calendar-days',
    heart: 'fa-heart',
    layers: 'fa-layer-group'
  };
  return icons[icon] || icons.layers;
}

async function loadCommunityPlanMemberships(communityPlans) {
  const sourceDir = path.join(root, 'src', 'data', 'community-plans');
  const memberships = new Map();

  for (const communityPlan of communityPlans) {
    const fileName = path.basename(new URL(communityPlan.url, publicBaseUrl).pathname);
    const raw = await fs.readFile(path.join(sourceDir, fileName), 'utf8');
    const value = JSON.parse(raw);
    if (value?.schemaVersion !== 1 || value?.festival !== 'valladolid-2026' || !Array.isArray(value?.plans)) {
      throw new Error(`Community plan "${communityPlan.id}" has an invalid export.`);
    }

    const activityIds = new Set();
    for (const sourcePlan of value.plans) {
      if (!sourcePlan || typeof sourcePlan !== 'object' || !Array.isArray(sourcePlan.activityIds)) continue;
      for (const activityId of sourcePlan.activityIds) activityIds.add(String(activityId).trim());
    }

    for (const activityId of activityIds) {
      if (!activityId) continue;
      const plansForEvent = memberships.get(activityId) || [];
      plansForEvent.push({
        id: communityPlan.id,
        name: communityPlan.name,
        author: communityPlan.author,
        iconClass: communityPlanIconClass(communityPlan.icon),
        pageUrl: `/planes/${communityPlan.id}/`
      });
      memberships.set(activityId, plansForEvent);
    }
  }

  return memberships;
}

async function copyCommunityPlanFiles(assetVersionSeed) {
  const sourceDir = path.join(root, 'src', 'data', 'community-plans');
  try {
    const entries = await fs.readdir(sourceDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const sourcePath = path.join(sourceDir, entry.name);
      const content = await fs.readFile(sourcePath);
      const relPath = 'data/community-plans/' + entry.name;
      await writeFile(relPath, content);
      assetVersionSeed.push([relPath, createHash('sha256').update(content).digest('hex')]);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function copyCasetasData(casetas, assetVersionSeed) {
  const content = JSON.stringify({
    schemaVersion: 1,
    festival: 'valladolid-2026',
    updatedAt: '2026-08-25',
    casetas
  }, null, 2) + '\n';
  await writeFile('data/casetas.json', content);
  assetVersionSeed.push(['data/casetas.json', createHash('sha256').update(content).digest('hex')]);
}

async function verifyCasetaQrPosters(casetas) {
  const sourceDir = path.join(root, 'src', 'assets', 'qr', 'casetas');
  for (const caseta of casetas) {
    const pngPath = path.join(sourceDir, `${caseta.id}.png`);
    try {
      await fs.access(pngPath);
    } catch (_) {
      throw new Error(`Falta el cartel QR de ${caseta.id}. Ejecuta npm run casetas:qr.`);
    }
  }
}

async function copyAssetDir(sourceDir, currentDir, assetVersionSeed) {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      await copyAssetDir(sourceDir, sourcePath, assetVersionSeed);
      continue;
    }
    if (!entry.isFile()) continue;
    const relPath = path.relative(sourceDir, sourcePath).split(path.sep).join('/');
    const content = await fs.readFile(sourcePath);
    for (const output of await processAssetImage(relPath, content)) {
      const targetPath = path.join(dist, 'assets', output.rel);
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, output.content);
      assetVersionSeed.push(['assets/' + output.rel, createHash('sha256').update(output.content).digest('hex')]);
    }
  }
}

const imageCacheDir = path.join(root, 'node_modules', '.cache', 'fiestas-images');
// Súbelo al cambiar cualquier parámetro de sharp o las reglas de derivados:
// la caché se indexa también por esta versión para no servir salidas obsoletas.
const imagePipelineVersion = '3';

// Optimiza imágenes en el build: recomprime las pesadas manteniendo nombre y formato,
// y genera derivados (miniaturas de eventos, hero/confetti en WebP, favicon 128px).
async function processAssetImage(relPath, content) {
  const ext = path.extname(relPath).toLowerCase();
  if (!['.png', '.jpg', '.jpeg'].includes(ext)) return [{ rel: relPath, content }];

  const cacheKey = createHash('sha256').update(imagePipelineVersion).update('\0').update(relPath).update('\0').update(content).digest('hex').slice(0, 24);
  const cached = await readImageCache(cacheKey);
  if (cached) return cached;

  const outputs = [];
  let main = content;
  if (content.length > 150_000) {
    try {
      const image = sharp(content).rotate();
      const candidate = ext === '.png'
        ? await image.png({ palette: true, quality: 90, compressionLevel: 9 }).toBuffer()
        : await image.resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
      if (candidate.length < main.length) main = candidate;
    } catch (_) {
      // Formato no soportado por sharp: se publica el original tal cual.
    }
  }
  outputs.push({ rel: relPath, content: main });

  if (relPath.startsWith('events/')) {
    const base = path.basename(relPath).replace(/\.(?:png|jpe?g)$/i, '');
    // 256px cubre la tarjeta de 84px CSS a DPR 3.
    const thumb = await sharp(content).rotate().resize(256, 256, { fit: 'cover' }).webp({ quality: 70 }).toBuffer();
    outputs.push({ rel: 'events/thumbs/' + base + '.webp', content: thumb });
    // Hero de la ficha de detalle (el original queda para lightbox y og:image).
    const hero = await sharp(content).rotate().resize({ width: 800, withoutEnlargement: true }).webp({ quality: 75 }).toBuffer();
    outputs.push({ rel: 'events/hero/' + base + '.webp', content: hero });
  }
  if (relPath === 'hero-fireworks.png') {
    outputs.push({ rel: 'hero-fireworks.webp', content: await sharp(content).resize({ width: 320 }).webp({ quality: 80 }).toBuffer() });
  }
  if (relPath === 'plan-confetti.png') {
    outputs.push({ rel: 'plan-confetti.webp', content: await sharp(content).resize({ width: 192 }).webp({ quality: 80 }).toBuffer() });
  }
  if (relPath === 'favicon.png') {
    // 128px: el uso más grande como logo es ~51px CSS → nítido hasta DPR 2.5.
    outputs.push({ rel: 'favicon-128.png', content: await sharp(content).resize(128, 128).png().toBuffer() });
  }

  await writeImageCache(cacheKey, outputs);
  return outputs;
}

async function readImageCache(cacheKey) {
  try {
    const meta = JSON.parse(await fs.readFile(path.join(imageCacheDir, cacheKey + '.json'), 'utf8'));
    return await Promise.all(meta.map(async (rel, index) => ({
      rel,
      content: await fs.readFile(path.join(imageCacheDir, cacheKey + '.' + index))
    })));
  } catch (_) {
    return null;
  }
}

async function writeImageCache(cacheKey, outputs) {
  await fs.mkdir(imageCacheDir, { recursive: true });
  await Promise.all(outputs.map((output, index) => fs.writeFile(path.join(imageCacheDir, cacheKey + '.' + index), output.content)));
  await fs.writeFile(path.join(imageCacheDir, cacheKey + '.json'), JSON.stringify(outputs.map((output) => output.rel)));
}

async function loadVallabusStops() {
  if (typeof fetch !== 'function') {
    console.warn('No se pudo cargar VallaBus: fetch no está disponible en Node.');
    return [];
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), vallabusStopsTimeoutMs);
  try {
    const response = await fetch(vallabusStopsUrl, {
      headers: { accept: 'application/json' },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const stops = normalizeVallabusStops(payload);
    if (!stops.length) throw new Error('la respuesta no contiene paradas válidas');
    console.log(`Loaded ${stops.length} VallaBus stops.`);
    return stops;
  } catch (error) {
    console.warn(`No se pudieron cargar las paradas de VallaBus: ${error.message}. Se generarán las fichas sin transporte local.`);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeVallabusStops(payload) {
  if (!Array.isArray(payload)) return [];
  const unique = new Map();
  for (const entry of payload) {
    const number = String(entry?.parada?.numero || '').trim();
    const name = String(entry?.parada?.nombre || '').trim();
    const lat = Number(entry?.ubicacion?.y);
    const lng = Number(entry?.ubicacion?.x);
    const lines = Array.isArray(entry?.lineas?.ordinarias)
      ? [...new Set(entry.lineas.ordinarias.map((line) => String(line).trim()).filter(Boolean))]
        .sort((left, right) => transitLineCollator.compare(left, right))
      : [];
    if (!number || !name || !Number.isFinite(lat) || !Number.isFinite(lng) || !lines.length) continue;
    if (!unique.has(number)) unique.set(number, { number, name, lat, lng, lines });
  }
  return [...unique.values()];
}

function nearbyVallabusStops(coordinates, stops) {
  if (!hasCoordinates(coordinates) || !stops.length) return [];
  const ranked = stops
    .map((stop) => ({
      ...stop,
      distanceMeters: Math.round(distanceInMetres(coordinates, { lat: stop.lat, lng: stop.lng }))
    }))
    .sort((left, right) => left.distanceMeters - right.distanceMeters || transitLineCollator.compare(left.name, right.name));
  const withinRadius = ranked.filter((stop) => stop.distanceMeters <= vallabusNearbyRadiusMeters);
  const selected = (withinRadius.length ? withinRadius : ranked.filter((stop) => stop.distanceMeters <= vallabusNearbyFallbackRadiusMeters))
    .slice(0, vallabusNearbyStopLimit);
  return selected.map(({ number, name, lat, lng, lines, distanceMeters }) => ({
    number,
    name,
    lat,
    lng,
    lines,
    distanceMeters
  }));
}

function distanceInMetres(left, right) {
  const earthRadius = 6371000;
  const toRadians = Math.PI / 180;
  const latitudeDelta = (right.lat - left.lat) * toRadians;
  const longitudeDelta = (right.lng - left.lng) * toRadians;
  const latitude1 = left.lat * toRadians;
  const latitude2 = right.lat * toRadians;
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(haversine));
}

function nearbyVallabusLines(stops) {
  return [...new Set(stops.flatMap((stop) => stop.lines))].sort((left, right) => transitLineCollator.compare(left, right));
}

async function loadEvents(vallabusStops = []) {
  const raw = await fs.readFile(path.join(root, 'src', 'data', 'fiestas-2026', 'events.json'), 'utf8');
  const sourceEvents = JSON.parse(raw);
  const ids = sourceEvents.map((event) => event.id);
  if (sourceEvents.some((event) => !Number.isInteger(event.id) || event.id < 1) || new Set(ids).size !== ids.length) {
    throw new Error('Each event must have a unique positive numeric id.');
  }
  return sourceEvents.map((event) => {
    const ticket = event.ticket && typeof event.ticket === 'object'
      ? {
          required: Boolean(event.ticket.required),
          status: String(event.ticket.status || ''),
          label: String(event.ticket.label || ''),
          url: event.ticket.url ? String(event.ticket.url) : '',
          note: String(event.ticket.note || '')
        }
      : null;
    const coordinates = hasCoordinates(event.coordinates)
      ? normalizeCoordinates(event.coordinates)
      : null;
    const nearbyStops = nearbyVallabusStops(coordinates, vallabusStops);
    const images = normalizeEventImages(event);
    return {
    id: String(event.id || ''),
    date: String(event.date || ''),
    dateLabel: String(event.dateLabel || event.date || ''),
    startTime: String(event.startTime || ''),
    endTime: String(event.endTime || ''),
    realStartDate: event.realStartDate ? String(event.realStartDate) : null,
    realEndDate: event.realEndDate ? String(event.realEndDate) : null,
    title: String(event.title || 'Evento'),
    slug: event.slug ? slugify(event.slug) : '',
    image: images[0] || '',
    ...(images.length > 1 ? { images } : {}),
    imageAlt: String(event.imageAlt || event.title || 'Imagen de la actividad'),
    imageSource: event.imageSource ? String(event.imageSource) : '',
    imageCredit: event.imageCredit ? String(event.imageCredit) : '',
    imageLicense: event.imageLicense ? String(event.imageLicense) : '',
    location: String(event.location || ''),
    zone: String(event.zone || ''),
    neighborhood: inferNeighborhood(event),
    type: String(event.type || 'Evento'),
    tags: normalizeTags(event.tags, event.type),
    description: String(event.description || ''),
    summary: String(event.summary || ''),
    accessibility: normalizeEventAccessibility(event.accessibility),
    performances: Array.isArray(event.performances) ? event.performances.map(String) : [],
    organizers: Array.isArray(event.organizers) ? event.organizers.map(String) : [],
    collaborators: Array.isArray(event.collaborators) ? event.collaborators.map(String) : [],
    coordinates,
    nearbyStops,
    nearbyLines: nearbyVallabusLines(nearbyStops),
    ticket,
    ticketKind: ticketKind(ticket)
    };
  }).filter((event) => event.id && event.date)
    .sort((a, b) => a.date.localeCompare(b.date) || sortMinutes(a.startTime) - sortMinutes(b.startTime) || a.title.localeCompare(b.title, 'es'))
    .map((event) => {
      const slug = slugify(event.slug || event.title);
      return {
        ...event,
        slug,
        detailImage: detailImageUrl(event.image),
        icon: fiestas2026Icon(event.type),
        socialImagePath: '/assets/social/categories/' + socialCategorySlug(event.type) + '.jpg',
        socialImageAlt: 'Icono morado de la categoría ' + event.type + ' sobre fondo blanco',
        socialImageWidth: 512,
        socialImageHeight: 512,
        urlPath: '/e/' + event.id + '/' + slug + '/',
        canonicalUrl: publicBaseUrl + '/e/' + event.id + '/' + slug + '/',
        shareText: shareText(event),
        ticketLabel: ticketKindLabel(event.ticketKind),
        ticketDetail: ticketDetail(event.ticketKind, event.ticket),
        mapUrl: '/mapa/?event=' + encodeURIComponent(event.id),
        osmUrl: event.coordinates ? 'https://www.openstreetmap.org/?mlat=' + event.coordinates.lat + '&mlon=' + event.coordinates.lng + '#map=17/' + event.coordinates.lat + '/' + event.coordinates.lng : '',
        directionsUrl: event.coordinates ? 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(event.coordinates.lat + ',' + event.coordinates.lng) : ''
      };
    });
}

function normalizeEventAccessibility(value) {
  if (!value || typeof value !== 'object') return null;
  const label = String(value.label || '').trim();
  const note = String(value.note || '').trim();
  return label && note ? { label, note } : null;
}

function normalizeEventImages(event) {
  const images = [];
  const add = (value) => {
    if (Array.isArray(value)) {
      value.forEach(add);
      return;
    }
    const image = String(value || '').trim();
    if (image && !images.includes(image)) images.push(image);
  };
  add(event.image);
  add(event.images);
  return images;
}

function hasCoordinates(coordinates) {
  return coordinates && Number.isFinite(coordinates.lat) && Number.isFinite(coordinates.lng);
}

// El hero de la ficha de detalle usa un derivado WebP de 800px para los
// carteles locales (generado en processAssetImage); los externos van tal cual.
function detailImageUrl(image = '') {
  const match = /^\/assets\/events\/([^/]+)\.(?:png|jpe?g)$/i.exec(image);
  return match ? '/assets/events/hero/' + match[1] + '.webp' : image;
}

// Versión reducida de cada evento para el JSON que consume el navegador: sin los
// campos que solo usan las plantillas (share/social/canonical) y con coordenadas
// y entrada limitadas a lo que leen los scripts del cliente.
function clientEvent(event) {
  const {
    shareText, osmUrl, directionsUrl, canonicalUrl, mapUrl, ticketDetail, detailImage,
    socialImagePath, socialImageAlt, socialImageWidth, socialImageHeight,
    ...rest
  } = event;
  return {
    ...rest,
    coordinates: event.coordinates ? { lat: event.coordinates.lat, lng: event.coordinates.lng } : null,
    ticket: event.ticket
      ? {
          required: event.ticket.required,
          label: event.ticket.label,
          url: event.ticket.url,
          note: event.ticket.note
        }
      : null
  };
}

async function loadCasetas(vallabusStops = []) {
  const sourcePath = path.join(root, 'src', 'data', 'fiestas-2026', 'casetas.json');
  const raw = await fs.readFile(sourcePath, 'utf8');
  const source = JSON.parse(raw);
  if (source?.schemaVersion !== 1 || source?.festival !== 'valladolid-2026' || !Array.isArray(source?.casetas)) {
    throw new Error('The casetas catalog must use schemaVersion 1 and festival valladolid-2026.');
  }

  const ids = new Set();
  const publicSlugs = new Set();
  const normalized = source.casetas.map((caseta, index) => {
    if (!caseta || typeof caseta !== 'object') throw new Error(`Caseta ${index + 1} must be an object.`);
    const id = String(caseta.id || '').trim();
    const name = String(caseta.name || '').trim();
    const zone = String(caseta.zone || '').trim();
    const location = String(caseta.location || '').trim();
    const addressQuery = String(caseta.addressQuery || location).trim();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error(`Caseta ${index + 1} has an invalid stable id.`);
    if (ids.has(id)) throw new Error(`Caseta id "${id}" is duplicated.`);
    if (!name || !zone || !location || !addressQuery) throw new Error(`Caseta "${id}" is missing name, zone, location or addressQuery.`);
    ids.add(id);
    const publicSlug = getCasetaPublicSlug(caseta);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(publicSlug)) {
      throw new Error(`Caseta "${id}" has an invalid publicSlug.`);
    }
    if (publicSlugs.has(publicSlug)) throw new Error(`Caseta publicSlug "${publicSlug}" is duplicated.`);
    publicSlugs.add(publicSlug);
    const legacySlugs = Array.isArray(caseta.legacySlugs)
      ? [...new Set(caseta.legacySlugs.map((slug) => String(slug || '').trim()).filter(Boolean))]
      : [];
    if (legacySlugs.some((slug) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))) {
      throw new Error(`Caseta "${id}" has an invalid legacySlug.`);
    }
    const coordinates = hasCoordinates(caseta.coordinates)
      ? normalizeCasetaCoordinates(caseta.coordinates)
      : null;
    return {
      id,
      name,
      slug: publicSlug,
      publicSlug,
      legacySlugs,
      zone,
      location,
      placement: String(caseta.placement || '').trim(),
      image: String(caseta.image || '').trim(),
      imageAlt: String(caseta.imageAlt || '').trim(),
      imageSource: String(caseta.imageSource || '').trim(),
      imageCredit: String(caseta.imageCredit || '').trim(),
      imageLicense: String(caseta.imageLicense || '').trim(),
      acecaleCollaborator: caseta.acecaleCollaborator === true,
      addressQuery,
      coordinates,
      details: normalizeCasetaDetails(caseta.details),
      color: casetaColor(id),
      urlPath: casetaDetailPath(publicSlug),
      canonicalUrl: publicBaseUrl + casetaDetailPath(publicSlug),
      mapUrl: `/casetas/?caseta=${encodeURIComponent(id)}`
    };
  });
  const zoneFallbacks = buildCasetaZoneFallbacks(normalized);
  return normalized.map((caseta) => ({
    ...caseta,
    coordinates: isNearCasetaCity(caseta.coordinates)
      ? caseta.coordinates
      : createCasetaZoneFallback(caseta.zone, zoneFallbacks.get(caseta.zone) || casetaCityCenter)
  })).map((caseta) => {
    const nearbyStops = nearbyVallabusStops(caseta.coordinates, vallabusStops);
    return {
      ...caseta,
      nearbyStops,
      nearbyLines: nearbyVallabusLines(nearbyStops)
    };
  });
}

function buildCasetaZoneFallbacks(casetas) {
  const grouped = new Map();
  for (const caseta of casetas) {
    if (!isNearCasetaCity(caseta.coordinates)) continue;
    if (!grouped.has(caseta.zone)) grouped.set(caseta.zone, []);
    grouped.get(caseta.zone).push(caseta.coordinates);
  }
  return new Map([...new Set(casetas.map((caseta) => caseta.zone))].map((zone) => {
    const coordinates = grouped.get(zone) || [];
    return [zone, coordinates.length ? {
      lat: median(coordinates.map((item) => item.lat)),
      lng: median(coordinates.map((item) => item.lng))
    } : casetaCityCenter];
  }));
}

function createCasetaZoneFallback(zone, coordinates) {
  return {
    lat: coordinates.lat,
    lng: coordinates.lng,
    source: 'zone-fallback',
    displayName: `${zone}, Valladolid, España`,
    query: `${zone}, Valladolid, España`
  };
}

function isNearCasetaCity(coordinates) {
  return hasCoordinates(coordinates) && distanceInKilometres(casetaCityCenter, coordinates) <= casetaCityRadiusKm;
}

function distanceInKilometres(from, to) {
  const earthRadius = 6371;
  const latDelta = (to.lat - from.lat) * Math.PI / 180;
  const lngDelta = (to.lng - from.lng) * Math.PI / 180;
  const fromLatitude = from.lat * Math.PI / 180;
  const toLatitude = to.lat * Math.PI / 180;
  const a = Math.sin(latDelta / 2) ** 2
    + Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(lngDelta / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function normalizeCasetaCoordinates(coordinates) {
  return Object.fromEntries(Object.entries({
    lat: Number(coordinates.lat),
    lng: Number(coordinates.lng),
    source: coordinates.source,
    osmType: coordinates.osmType,
    osmId: coordinates.osmId,
    displayName: coordinates.displayName,
    query: coordinates.query,
    accuracy: coordinates.accuracy,
    geocodedAt: coordinates.geocodedAt
  }).filter(([, value]) => value !== undefined && value !== null && value !== ''));
}

function normalizeCoordinates(coordinates) {
  return Object.fromEntries(Object.entries({
    lat: coordinates.lat,
    lng: coordinates.lng,
    source: coordinates.source,
    osmType: coordinates.osmType,
    osmId: coordinates.osmId,
    query: coordinates.query,
    accuracy: coordinates.accuracy,
    geocodedAt: coordinates.geocodedAt
  }).filter(([, value]) => value !== undefined && value !== null && value !== ''));
}

function shareText(event) {
  return [
    event.title,
    [event.dateLabel, [event.startTime, event.endTime].filter(Boolean).join(' - ')].filter(Boolean).join(' · '),
    event.location
  ].filter(Boolean).join('\n');
}

function eventDateTime(date, time) {
  return time && /^\d{2}:\d{2}$/.test(time) ? date + 'T' + time + ':00+02:00' : date;
}

function eventEndDate(date, startTime, endTime) {
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  if (startMinutes === null || endMinutes === null || endMinutes >= startMinutes) return date;

  const nextDate = new Date(date + 'T00:00:00Z');
  if (Number.isNaN(nextDate.getTime())) return date;
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  return nextDate.toISOString().slice(0, 10);
}

function timeToMinutes(value) {
  const match = String(value || '').match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function eventImageUrl(event) {
  if (!event.image) return publicBaseUrl + event.socialImagePath;
  return /^https?:\/\//i.test(event.image) ? event.image : publicBaseUrl + event.image;
}

function eventStructuredData(event) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    description: event.summary || event.description || event.dateLabel,
    startDate: eventDateTime(event.date, event.startTime),
    url: event.canonicalUrl,
    image: [eventImageUrl(event)],
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place',
      name: event.location || event.zone || 'Valladolid',
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Valladolid',
        addressCountry: 'ES'
      }
    },
    organizer: {
      '@type': 'Organization',
      name: 'Aldea Pucela',
      url: 'https://aldeapucela.org'
    }
  };
  if (event.endTime) data.endDate = eventDateTime(eventEndDate(event.date, event.startTime, event.endTime), event.endTime);
  if (event.coordinates) {
    data.location.geo = {
      '@type': 'GeoCoordinates',
      latitude: event.coordinates.lat,
      longitude: event.coordinates.lng
    };
  }
  return data;
}

function ticketKindLabel(kind) {
  const labels = {
    free: 'Gratis',
    paid: 'De pago',
    registration: 'Inscripción'
  };
  return labels[kind] || 'Entrada no indicada';
}

function ticketDetail(kind, ticket) {
  const genericText = normalizeForMatch([
    'Entrada no indicada',
    'Sin entrada indicada',
    'El programa no indica venta de entradas para este evento.',
    'No consta venta de entradas en el programa para este evento.'
  ].join(' '));
  const label = ticket?.label || '';
  const note = ticket?.note || '';
  if (label && label !== ticketKindLabel(kind) && !genericText.includes(normalizeForMatch(label))) return label;
  if (kind !== 'free' && note && !genericText.includes(normalizeForMatch(note))) return note;
  return '';
}

function buildSummary(events) {
  const dates = [...new Map(events.map((event) => [event.date, {
    date: event.date,
    label: event.dateLabel,
    shortLabel: event.dateLabel.split(' ').slice(0, 2).join(' '),
    weekday: event.dateLabel.split(' ')[0]?.replace(',', '').slice(0, 3).toUpperCase() || '',
    dayNumber: event.date.split('-')[2]?.replace(/^0/, '') || '',
    monthLabel: monthLabel(event.date)
  }])).values()];
  const types = [...new Set(events.flatMap((event) => event.tags?.length ? event.tags : [event.type || 'Evento']))].sort((a, b) => a.localeCompare(b, 'es'));
  const areas = [...new Set(events.map((event) => event.neighborhood || event.zone).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  return { dates, types, areas };
}

function monthLabel(date = '') {
  const months = { '01': 'ENE', '02': 'FEB', '03': 'MAR', '04': 'ABR', '05': 'MAY', '06': 'JUN', '07': 'JUL', '08': 'AGO', '09': 'SEP', '10': 'OCT', '11': 'NOV', '12': 'DIC' };
  return months[String(date).split('-')[1]] || '';
}

function sortMinutes(time = '') {
  if (!time) return 99 * 60;
  const [hour, minute] = String(time).split(':').map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 99 * 60;
  const minutes = hour * 60 + minute;
  return hour < 6 ? minutes + 24 * 60 : minutes;
}

function ticketKind(ticket) {
  if (!ticket?.required) return 'free';
  const text = normalizeForMatch([ticket.label, ticket.url, ticket.note].filter(Boolean).join(' '));
  if (text.includes('espaciosjovenesvalladolid')) return 'registration';
  return 'paid';
}

function inferNeighborhood(event = {}) {
  const text = normalizeForMatch([event.zone, event.location].filter(Boolean).join(' '));
  const rules = [
    ['Arturo Eyries', /\barturo eyries\b/],
    ['Barrio España', /\bbarrio espana\b/],
    ['Belén - Pilarica', /\b(belen|pilarica|santos pilarica|padre ventura)\b/],
    ['Buenos Aires', /\bbuenos aires\b/],
    ['Caño Argales', /\b(estacion de ariza|cano hondo)\b/],
    ['Centro', /\b(plaza mayor|fuente dorada|portugalete|recoletos|campo grande|academia de caballeria|san lorenzo|catedral|san pablo|san nicolas|plaza espana|plaza del salvador|plaza de la universidad|pza de la universidad|calderon|zorrilla|carrion|cervantes|sala borja|museo patio herreriano|constitucion|teresa gil|regalado|rinconada|marques del duero|cantarranas|chancilleria|cadenas de san gregorio|casa del sol|plaza poniente|plaza del rosarillo|dos de mayo|marquesina|zona centro|hospital)\b/],
    ['Circular - Vadillos - San Juan', /\b(circular|vadillos|san juan|batallas|santa lucia|calle gerona)\b/],
    ['Covaresa', /\bcovaresa\b/],
    ['Delicias', /\b(delicias|parque de la paz|arca real|bombberos|bomberos|gutierrez semprun|beneficencia|camino cementerio|cno cementerio)\b/],
    ['El Peral - Santa Ana - Las Villas', /\b(el peral|santa ana|las villas|villaverde de medina|villavaquerin)\b/],
    ['Fuente Berrocal', /\bfuente berrocal\b/],
    ['Girón', /\bgiron\b/],
    ['Huerta del Rey', /\b(huerta del rey|cupula del milenio|milenio|feria de valladolid|auditorio feria|pabellon feria|calle de las mieses|mieses|pio del rio hortega|rastrojo|cebada)\b/],
    ['La Overuela', /\boveruela\b/],
    ['La Rubia', /\b(la rubia|lava|farola|4 de marzo|espanta)\b/],
    ['La Victoria', /\b(la victoria|puente jardin|fuente el sol|obregon|san sebastian)\b/],
    ['Las Flores', /\b(las flores|plaza mayo)\b/],
    ['Moreras', /\bmoreras\b/],
    ['Nuevo Hospital', /\b(nuevo hospital|pifano)\b/],
    ['Pajarillos - San Isidro', /\b(pajarillos|san isidro|biologo jose antonio valverde|ciguena)\b/],
    ['Parque Alameda', /\b(parque alameda|canada|paula lopez|andres de laorden)\b/],
    ['Parquesol', /\b(parquesol|marcos fernandez|manuel silvela|enrique cubero|amadeo arias|jose luis bellido|feria de folklore|cardenal marcelo|contiendas)\b/],
    ['Pinar de Antequera', /\bpinar de antequera\b/],
    ['Pinar de Jalón', /\bpinar de jalon|everest\b/],
    ['Plaza de Toros', /\bplaza de toros\b/],
    ['Puente Duero', /\bpuente duero\b/],
    ['Puente Colgante', /\bpuente colgante\b/],
    ['Rondilla', /\b(rondilla|ribera de castilla|cardenal torquemada|alberto fernandez|rio esgueva|encuentro de los pueblos)\b/],
    ['Valparaíso', /\b(valparaiso|quinto centenario|nuevo mundo)\b/],
    ['Villa del Prado', /\b(villa del prado|juan pablo ii)\b/],
    ['Zona Sur', /\b(zona sur|paseo zorrilla|ctra rueda|rueda 64|residencia asistida|caamano|santa marta|juana jugan)\b/],
    ['Pajarillos - San Isidro', /\b(fernando ferreiro|andres de la orden)\b/],
    ['Belén - Pilarica', /\b(paseo del cauce|cauce 50)\b/],
    ['La Rubia', /\balbacete\b/]
  ];
  return rules.find(([, pattern]) => pattern.test(text))?.[0] || '';
}

function normalizeForMatch(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeTags(tags, type) {
  const primary = String(type || 'Evento');
  const values = Array.isArray(tags) ? tags.map(String) : [];
  return [...new Set([primary, ...values].map((tag) => tag.trim()).filter(Boolean))];
}

function pageContext({ assetVersion, cssVersion, jsVersion, eventAliases = {}, eventAliasVersion = '' }) {
  return {
    activeNav: 'fiestas-2026',
    pageCss: 'fiestas-2026.' + cssVersion + '.css',
    pageJs: 'fiestas-2026.' + jsVersion + '.js',
    // modulepreload de los imports estáticos de fiestas-2026.js: sin esto el
    // navegador los descubre en cascada, módulo a módulo.
    modulePreloads: ['menu-drawer', 'subscribe', 'theme', 'analytics', 'plan-storage', 'plan-export', 'plans-page', 'community-plans', 'community-prompt', 'popular-page', 'weather', 'events-data', 'search-text', 'casetas-navigation']
      .map((name) => '/assets/js/' + name + '.' + jsVersion + '.js'),
    communityPlansUrl: '/data/planes.json',
    assetVersion,
    cssVersion,
    jsVersion,
    eventAliases,
    eventAliasVersion,
    communityPromptCampaign,
    // Integración externa aprobada: el modal de suscripción usa el calendario/RSS global de Aldea Pucela Eventos.
    categoryFeeds: [],
    publicBaseUrl,
    analyticsConfig
  };
}

function render(template, context) {
  return env.render(template, context);
}

async function build() {
  await assertIconSubsetIsFresh();
  await fs.rm(dist, { recursive: true, force: true });
  const cssVersionSeed = [];
  const jsVersionSeed = [];
  const assetVersionSeed = [];
  const css = await compileCss(cssVersionSeed);
  const jsContents = await copyJs(jsVersionSeed);
  await copyStaticAssets(assetVersionSeed);
  const communityPlans = await copyCommunityPlansData(assetVersionSeed);
  await copyCommunityPlanFiles(assetVersionSeed);
  const vallabusStops = await loadVallabusStops();
  const casetas = await loadCasetas(vallabusStops);
  await copyCasetasData(casetas, assetVersionSeed);
  await verifyCasetaQrPosters(casetas);
  const communityPlanMemberships = await loadCommunityPlanMemberships(communityPlans);
  const pwaFiles = await loadPwaFiles();
  const events = await loadEvents(vallabusStops);
  const eventImportRegistry = normalizeImportRegistry(JSON.parse(await fs.readFile(eventImportRegistryPath, 'utf8')));
  assertRegistryIntegrity(eventImportRegistry, events);
  const eventAliases = Object.fromEntries(Object.entries(eventImportRegistry.localAliases).map(([id, alias]) => [id, alias.targetEventId]));
  const eventAliasVersion = createHash('sha256').update(JSON.stringify(eventAliases)).digest('hex').slice(0, 12);
  const clientEventsJson = JSON.stringify(events.map(clientEvent));
  const eventsDataVersion = contentVersion([['assets/data/events.json', clientEventsJson]]);
  const eventsDataUrl = '/assets/data/events.' + eventsDataVersion + '.json';
  await writeFile('assets/data/events.' + eventsDataVersion + '.json', clientEventsJson);
  assetVersionSeed.push(['assets/data/events.json', clientEventsJson]);
  const cssVersion = contentVersion(cssVersionSeed);
  const jsVersion = contentVersion(jsVersionSeed);
  await writeVersionedCss(cssVersion, css);
  await writeVersionedJs(jsContents, jsVersion);
  const assetVersion = contentVersion([...cssVersionSeed, ...jsVersionSeed, ...assetVersionSeed]);
  const appVersion = contentVersion([
    ...cssVersionSeed,
    ...jsVersionSeed,
    ...assetVersionSeed,
    ['pwa/sw.js', pwaFiles.serviceWorker],
    ['pwa/offline.html', pwaFiles.offlinePage]
  ]);
  await writePwaFiles(pwaFiles, { appVersion, cssVersion, jsVersion, eventsDataUrl });
  const versions = { assetVersion, cssVersion, jsVersion, eventAliases, eventAliasVersion };
  const summary = buildSummary(events);
  const socialImage = publicBaseUrl + '/assets/social/fiestas-valladolid-2026.jpg';
  const casetasSocialImage = publicBaseUrl + '/assets/social/casetas-feria-de-dia.jpg';
  const popularDishesSocialImage = publicBaseUrl + '/assets/social/pinchos-populares.jpg';

  const homeContext = {
    ...pageContext(versions),
    title: 'Fiestas Valladolid 2026 | Aldea Pucela',
    meta: { description: 'Agenda de las Fiestas de Valladolid 2026 por días, horarios, espacios, categorías y mapa.' },
    canonicalUrl: publicBaseUrl + '/',
    social: {
      type: 'website', title: 'Fiestas Valladolid 2026 | Aldea Pucela',
      description: 'Agenda de las Fiestas de Valladolid 2026 por días, horarios, espacios, categorías y mapa.',
      image: socialImage, imageAlt: 'Fiestas de Valladolid 2026 | Aldea Pucela',
      imageWidth: 1200, imageHeight: 630, imageType: 'image/jpeg', url: publicBaseUrl + '/'
    },
    eventsDataUrl,
    fiestasDates: summary.dates,
    fiestasTypes: summary.types,
    fiestasAreas: summary.areas,
    communityPlans
  };

  await writeFile('index.html', render('fiestas-2026.njk', homeContext));
  await writeFile('mapa/index.html', render('fiestas-2026.njk', {
    ...homeContext,
    mapPage: true,
    title: 'Mapa de Fiestas Valladolid 2026 | Aldea Pucela',
    canonicalUrl: publicBaseUrl + '/mapa/',
    social: {
      ...homeContext.social,
      title: 'Mapa de Fiestas Valladolid 2026 | Aldea Pucela',
      url: publicBaseUrl + '/mapa/'
    }
  }));

  await writeFile('casetas/index.html', render('fiestas-2026-casetas.njk', {
    ...pageContext(versions),
    title: 'Casetas Feria de Día - Fiestas Valladolid 2026',
    meta: { description: 'Mapa de las casetas de las Fiestas de Valladolid 2026, con ubicaciones por zonas.' },
    canonicalUrl: publicBaseUrl + '/casetas/',
    social: {
      ...homeContext.social,
      title: 'Casetas Feria de Día - Fiestas Valladolid 2026',
      description: 'Mapa de las casetas de las Fiestas de Valladolid 2026, con ubicaciones por zonas.',
      image: casetasSocialImage,
      imageAlt: 'Casetas feria de día | Fiestas Valladolid 2026',
      imageWidth: 1731,
      imageHeight: 909,
      imageType: 'image/jpeg',
      url: publicBaseUrl + '/casetas/'
    },
    fiestasCasetasJson: jsonForScript(casetas),
    fiestasCasetasZones: [...new Set(casetas.map((caseta) => caseta.zone))]
  }));

  await writeFile('populares/index.html', render('fiestas-2026-popular.njk', {
    ...homeContext,
    title: 'Actividades populares | Fiestas Valladolid 2026',
    meta: { description: 'Estas son las actividades más guardadas por los vecinos y vecinas.' },
    canonicalUrl: publicBaseUrl + '/populares/',
    social: {
      ...homeContext.social,
      title: 'Actividades populares | Fiestas Valladolid 2026',
      description: 'Estas son las actividades más guardadas por los vecinos y vecinas.',
      imageAlt: 'Actividades populares de las Fiestas Valladolid 2026',
      url: publicBaseUrl + '/populares/'
    }
  }));

  await writeFile('pinchos-populares/index.html', render('fiestas-2026-popular-dishes.njk', {
    ...pageContext(versions),
    title: 'Pinchos populares | Fiestas Valladolid 2026',
    meta: { description: 'Descubre los pinchos más gustados de las casetas de las Fiestas de Valladolid 2026.' },
    canonicalUrl: publicBaseUrl + '/pinchos-populares/',
    social: {
      ...homeContext.social,
      title: 'Pinchos populares | Fiestas Valladolid 2026',
      description: 'Descubre los pinchos más gustados de las casetas de las Fiestas de Valladolid 2026.',
      image: popularDishesSocialImage,
      imageAlt: 'Pinchos populares de las casetas de las Fiestas Valladolid 2026',
      imageWidth: 1731,
      imageHeight: 909,
      imageType: 'image/jpeg',
      url: publicBaseUrl + '/pinchos-populares/'
    },
    fiestasCasetasJson: jsonForScript(casetas)
  }));

  await writeFile('plan/index.html', render('fiestas-2026-plan.njk', {
    ...homeContext,
    title: 'Mi plan | Fiestas Valladolid 2026',
    robotsMeta: 'noindex,follow',
    canonicalUrl: publicBaseUrl + '/plan/',
    social: {
      ...homeContext.social,
      title: 'Mi plan | Fiestas Valladolid 2026',
      url: publicBaseUrl + '/plan/'
    }
  }));

  await writeFile('plan/importar/index.html', render('fiestas-2026-plan-import.njk', {
    ...homeContext,
    title: 'Importar plan | Fiestas Valladolid 2026',
    canonicalUrl: publicBaseUrl + '/plan/importar/',
    robotsMeta: 'noindex,follow',
    social: {
      ...homeContext.social,
      title: 'Importar plan | Fiestas Valladolid 2026',
      url: publicBaseUrl + '/plan/importar/'
    }
  }));

  await writeFile('planes/index.html', render('fiestas-2026-community-plans.njk', {
    ...homeContext,
    title: 'Planes vecinales | Fiestas Valladolid 2026',
    canonicalUrl: publicBaseUrl + '/planes/',
    social: {
      ...homeContext.social,
      title: 'Planes vecinales | Fiestas Valladolid 2026',
      description: 'Descubre colecciones de actividades creadas por vecinos para las Fiestas de Valladolid 2026.',
      image: publicBaseUrl + '/assets/social/planes.jpg',
      imageAlt: 'Los mejores planes para las Fiestas de Valladolid 2026',
      imageWidth: 1200,
      imageHeight: 630,
      imageType: 'image/jpeg',
      url: publicBaseUrl + '/planes/'
    }
  }));

  await writeFile('colaboradores/index.html', render('fiestas-2026-collaborators.njk', {
    ...pageContext(versions),
    title: 'Colaboradores | Fiestas Valladolid 2026',
    meta: { description: 'Entidades y personas que ayudan a difundir las Fiestas Valladolid 2026 de Aldea Pucela.' },
    canonicalUrl: publicBaseUrl + '/colaboradores/',
    social: {
      ...homeContext.social,
      title: 'Colaboradores | Fiestas Valladolid 2026',
      description: 'Entidades y personas que ayudan a difundir las Fiestas Valladolid 2026 de Aldea Pucela.',
      url: publicBaseUrl + '/colaboradores/'
    }
  }));

  for (const communityPlan of communityPlans) {
    const planPath = `/planes/${communityPlan.id}/`;
    const planTitle = `${communityPlan.name} | Planes vecinales | Fiestas Valladolid 2026`;
    const planDescription = `${communityPlan.name}, creado por ${communityPlan.author}, para disfrutar las Fiestas de Valladolid 2026.`;
    const planSocial = await communityPlanSocial(communityPlan);
    await writeFile(`planes/${communityPlan.id}/index.html`, render('fiestas-2026-community-plan.njk', {
      ...homeContext,
      title: planTitle,
      meta: { description: planDescription },
      canonicalUrl: publicBaseUrl + planPath,
      social: {
        ...homeContext.social,
        title: planTitle,
        description: planDescription,
        ...planSocial,
        url: publicBaseUrl + planPath
      },
      communityPlan: {
        ...communityPlan,
        pageUrl: publicBaseUrl + planPath
      }
    }));
  }

  const casetaNameSlugCounts = new Map();
  for (const caseta of casetas) {
    const nameSlug = slugifyCaseta(caseta.name);
    casetaNameSlugCounts.set(nameSlug, (casetaNameSlugCounts.get(nameSlug) || 0) + 1);
  }

  for (const caseta of casetas) {
    const casetaSocialImage = caseta.image
      ? publicBaseUrl + caseta.image
      : casetasSocialImage;
    await writeFile(`c/${caseta.publicSlug}/index.html`, render('fiestas-2026-caseta-detail.njk', {
      ...pageContext(versions),
      title: `${caseta.name} | Casetas de Valladolid 2026`,
      meta: { description: `${caseta.name}, caseta de las Fiestas de Valladolid 2026 en ${caseta.location}.` },
      canonicalUrl: publicBaseUrl + caseta.urlPath,
      social: {
        ...homeContext.social,
        type: 'article',
        title: `${caseta.name} | Casetas de Valladolid 2026`,
        description: `${caseta.name}, caseta de las Fiestas de Valladolid 2026 en ${caseta.location}.`,
        image: casetaSocialImage,
        imageAlt: caseta.imageAlt || 'Casetas feria de día | Fiestas Valladolid 2026',
        imageWidth: caseta.image ? 1280 : 1731,
        imageHeight: caseta.image ? 964 : 909,
        imageType: caseta.image?.toLowerCase().endsWith('.png') ? 'image/png' : caseta.image ? 'image/jpeg' : 'image/png',
        url: publicBaseUrl + caseta.urlPath
      },
      caseta,
      relatedCasetas: casetas.filter((related) => related.zone === caseta.zone && related.id !== caseta.id)
    }));
    await writeFile(`c/${caseta.publicSlug}/qr/index.html`, render('fiestas-2026-caseta-qr.njk', {
      ...pageContext(versions),
      caseta
    }));
    const nameSlug = slugifyCaseta(caseta.name);
    for (const legacy of casetaLegacyPaths(caseta, {
      includeNameSlug: casetaNameSlugCounts.get(nameSlug) === 1
    })) {
      if (legacy.detail !== caseta.urlPath) {
        await writeFile(legacy.detail.slice(1) + 'index.html', render('fiestas-2026-caseta-redirect.njk', {
          ...pageContext(versions),
          redirectPath: caseta.urlPath
        }));
      }
      const canonicalQrPath = casetaQrPath(caseta.publicSlug);
      if (legacy.qr !== canonicalQrPath) {
        await writeFile(legacy.qr.slice(1) + 'index.html', render('fiestas-2026-caseta-redirect.njk', {
          ...pageContext(versions),
          redirectPath: canonicalQrPath
        }));
      }
    }
  }

  for (const event of events) {
    await writeFile('e/' + event.id + '/' + event.slug + '/index.html', render('fiestas-2026-detail.njk', {
      ...pageContext(versions),
      title: event.title + ' | Fiestas Valladolid 2026',
      meta: { description: event.summary || event.description || event.dateLabel },
      canonicalUrl: publicBaseUrl + event.urlPath,
      social: {
        type: 'article', title: event.title + ' | Fiestas Valladolid 2026',
        description: event.summary || event.description || event.dateLabel,
        image: eventImageUrl(event),
        imageAlt: event.image ? event.title : event.socialImageAlt,
        imageWidth: event.image ? 1200 : event.socialImageWidth,
        imageHeight: event.image ? 630 : event.socialImageHeight,
        imageType: 'image/jpeg', url: publicBaseUrl + event.urlPath
      },
      event,
      structuredData: eventStructuredData(event),
      relatedEvents: getRelatedEvents(events, event),
      communityPlansForEvent: communityPlanMemberships.get(event.id) || [],
      hideDrawerFilters: true
    }));
  }

  for (const [oldId, alias] of Object.entries(eventImportRegistry.localAliases)) {
    const oldSlugs = Array.isArray(alias.oldSlugs) ? alias.oldSlugs : [];
    const target = alias.targetEventId == null
      ? null
      : events.find((event) => String(event.id) === String(alias.targetEventId));
    for (const oldSlug of oldSlugs) {
      const legacyPath = `e/${oldId}/${oldSlug}/index.html`;
      if (target) {
        await writeFile(legacyPath, render('fiestas-2026-event-redirect.njk', {
          ...pageContext(versions),
          redirectPath: target.urlPath
        }));
      } else {
        await writeFile(legacyPath, render('fiestas-2026-event-unavailable.njk', {
          ...pageContext(versions)
        }));
      }
    }
  }

  const urls = ['/', '/mapa/', '/casetas/', '/populares/', '/pinchos-populares/', '/planes/', '/colaboradores/', ...communityPlans.map((plan) => `/planes/${plan.id}/`), ...casetas.flatMap((caseta) => [caseta.urlPath, casetaQrPath(caseta.publicSlug)]), ...events.map((event) => event.urlPath)];
  const sitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((url) => '  <url><loc>' + publicBaseUrl + url + '</loc></url>'),
    '</urlset>',
    ''
  ].join('\n');
  await writeFile('sitemap.xml', sitemap);
  await writeFile('robots.txt', ['User-agent: *', 'Allow: /', 'Sitemap: ' + publicBaseUrl + '/sitemap.xml', ''].join('\n'));
  console.log('Built fiestas repo with ' + events.length + ' events.');
}

function getRelatedEvents(events, event, limit = 3) {
  return events
    .filter((candidate) => candidate.id !== event.id && candidate.type === event.type)
    .map((candidate) => ({
      event: candidate,
      score: stableHash(event.id + ':' + candidate.id)
    }))
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map(({ event: candidate }) => candidate);
}

function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
