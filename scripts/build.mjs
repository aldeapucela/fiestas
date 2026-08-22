import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import nunjucks from 'nunjucks';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const publicBaseUrl = 'https://fiestas.aldeapucela.org';
const analyticsConfig = {
  enabled: parseBooleanEnv(process.env.FIESTAS_ANALYTICS_ENABLED),
  trackerUrl: process.env.FIESTAS_MATOMO_URL || 'https://stats.aldeapucela.org/',
  siteId: process.env.FIESTAS_MATOMO_SITE_ID || '29'
};
const env = nunjucks.configure(path.join(root, 'src', 'templates'), { autoescape: true, noCache: true });

env.addFilter('urlencode', (value) => encodeURIComponent(String(value || '')));
env.addFilter('dump', (value) => JSON.stringify(value));

function parseBooleanEnv(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

function slugify(value = '') {
  return String(value).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'evento';
}

function fiestas2026Icon(type = '') {
  const icons = {
    danza: 'fa-person-dress', deporte: 'fa-person-running', exposicion: 'fa-image', folklore: 'fa-guitar',
    'fuegos-artificiales': 'fa-wand-sparkles', gastronomia: 'fa-utensils', 'infantil-y-familiar': 'fa-children',
    magia: 'fa-hat-wizard', musica: 'fa-music', otros: 'fa-star', penas: 'fa-people-group',
    religioso: 'fa-place-of-worship', talleres: 'fa-screwdriver-wrench', teatro: 'fa-masks-theater', toros: 'fa-circle-dot'
  };
  return icons[slugify(type)] || 'fa-calendar-day';
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
  const cssDir = path.join(dist, 'assets', 'css');
  await fs.mkdir(cssDir, { recursive: true });
  const input = path.join(root, 'src', 'styles', 'fiestas-2026.css');
  const base = await fs.readFile(path.join(root, 'src', 'styles', 'base.css'), 'utf8');
  const page = await fs.readFile(input, 'utf8');
  const result = await postcss([
    tailwindcss({ config: path.join(root, 'tailwind.config.js') }),
    autoprefixer()
  ]).process(base + '\n' + page, { from: input, to: path.join(cssDir, 'fiestas-2026.css') });
  await fs.writeFile(path.join(cssDir, 'fiestas-2026.css'), result.css);
  cssVersionSeed.push(['assets/css/fiestas-2026.css', result.css]);
}

async function copyJs(jsVersionSeed) {
  const jsDir = path.join(dist, 'assets', 'js');
  await fs.mkdir(jsDir, { recursive: true });
  const files = ['analytics.js', 'plan-storage.js', 'plan-export.js', 'plans-page.js', 'fiestas-2026.js', 'menu-drawer.js', 'pwa.js', 'subscribe.js', 'theme.js'];
  for (const file of files) {
    const content = await fs.readFile(path.join(root, 'src', 'scripts', file), 'utf8');
    await fs.writeFile(path.join(jsDir, file), content);
    jsVersionSeed.push(['assets/js/' + file, content]);
  }
  return files;
}

async function writeVersionedJs(files, jsVersion) {
  const contents = new Map();
  for (const file of files) {
    const filePath = path.join(dist, 'assets', 'js', file);
    contents.set(file, await fs.readFile(filePath, 'utf8'));
  }
  for (const file of files) {
    const content = contents.get(file);
    const versioned = content.replace(/(['"])\.\/([A-Za-z0-9_-]+)\.js\1/g, '$1./$2.' + jsVersion + '.js$1');
    const versionedFile = file.replace(/\.js$/, '.' + jsVersion + '.js');
    await fs.writeFile(path.join(dist, 'assets', 'js', versionedFile), versioned);
  }
}

async function writeVersionedCss(cssVersion) {
  const source = path.join(dist, 'assets', 'css', 'fiestas-2026.css');
  const target = path.join(dist, 'assets', 'css', 'fiestas-2026.' + cssVersion + '.css');
  await fs.copyFile(source, target);
}

async function loadPwaFiles() {
  const pwaDir = path.join(root, 'src', 'pwa');
  return {
    serviceWorker: await fs.readFile(path.join(pwaDir, 'sw.js'), 'utf8'),
    offlinePage: await fs.readFile(path.join(pwaDir, 'offline.html'), 'utf8')
  };
}

async function writePwaFiles({ serviceWorker, offlinePage }, { appVersion, cssVersion, jsVersion }) {
  const renderedServiceWorker = serviceWorker
    .replaceAll('__APP_VERSION__', appVersion)
    .replaceAll('__CSS_VERSION__', cssVersion)
    .replaceAll('__JS_VERSION__', jsVersion);
  await writeFile('sw.js', renderedServiceWorker);
  await writeFile('offline.html', offlinePage);
}

async function copyStaticAssets(assetVersionSeed) {
  const sourceDir = path.join(root, 'src', 'assets');
  try {
    await copyAssetDir(sourceDir, sourceDir, assetVersionSeed);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
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
    const relPath = path.relative(sourceDir, sourcePath);
    const targetPath = path.join(dist, 'assets', relPath);
    const content = await fs.readFile(sourcePath);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, content);
    assetVersionSeed.push(['assets/' + relPath, createHash('sha256').update(content).digest('hex')]);
  }
}

async function loadEvents() {
  const raw = await fs.readFile(path.join(root, 'src', 'data', 'fiestas-2026', 'events.json'), 'utf8');
  return JSON.parse(raw).map((event) => {
    const ticket = event.ticket && typeof event.ticket === 'object'
      ? {
          required: Boolean(event.ticket.required),
          status: String(event.ticket.status || ''),
          label: String(event.ticket.label || ''),
          url: event.ticket.url ? String(event.ticket.url) : '',
          note: String(event.ticket.note || '')
        }
      : null;
    return {
    id: String(event.id || ''),
    date: String(event.date || ''),
    dateLabel: String(event.dateLabel || event.date || ''),
    startTime: String(event.startTime || ''),
    endTime: String(event.endTime || ''),
    title: String(event.title || 'Evento'),
    image: event.image ? String(event.image) : '',
    location: String(event.location || ''),
    zone: String(event.zone || ''),
    neighborhood: inferNeighborhood(event),
    type: String(event.type || 'Evento'),
    tags: normalizeTags(event.tags, event.type),
    description: String(event.description || ''),
    summary: String(event.summary || ''),
    performances: Array.isArray(event.performances) ? event.performances.map(String) : [],
    organizers: Array.isArray(event.organizers) ? event.organizers.map(String) : [],
    collaborators: Array.isArray(event.collaborators) ? event.collaborators.map(String) : [],
    coordinates: hasCoordinates(event.coordinates)
      ? normalizeCoordinates(event.coordinates)
      : null,
    ticket,
    ticketKind: ticketKind(ticket)
    };
  }).filter((event) => event.id && event.date)
    .sort((a, b) => a.date.localeCompare(b.date) || sortMinutes(a.startTime) - sortMinutes(b.startTime) || a.title.localeCompare(b.title, 'es'))
    .map((event) => ({
      ...event,
      icon: fiestas2026Icon(event.type),
      socialImagePath: '/assets/social/categories/' + slugify(event.type) + '.jpg',
      socialImageAlt: 'Icono morado de la categoría ' + event.type + ' sobre fondo blanco',
      socialImageWidth: 512,
      socialImageHeight: 512,
      urlPath: '/e/' + event.id + '/',
      canonicalUrl: publicBaseUrl + '/e/' + event.id + '/',
      shareText: shareText(event),
      ticketLabel: ticketKindLabel(event.ticketKind),
      ticketDetail: ticketDetail(event.ticketKind, event.ticket),
      mapUrl: '/mapa/?event=' + encodeURIComponent(event.id),
      osmUrl: event.coordinates ? 'https://www.openstreetmap.org/?mlat=' + event.coordinates.lat + '&mlon=' + event.coordinates.lng + '#map=17/' + event.coordinates.lat + '/' + event.coordinates.lng : '',
      directionsUrl: event.coordinates ? 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(event.coordinates.lat + ',' + event.coordinates.lng) : ''
    }));
}

function hasCoordinates(coordinates) {
  return coordinates && Number.isFinite(coordinates.lat) && Number.isFinite(coordinates.lng);
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

function pageContext({ assetVersion, cssVersion, jsVersion }) {
  return {
    activeNav: 'fiestas-2026',
    pageCss: 'fiestas-2026.' + cssVersion + '.css',
    pageJs: 'fiestas-2026.' + jsVersion + '.js',
    assetVersion,
    cssVersion,
    jsVersion,
    categoryFeeds: [],
    publicBaseUrl,
    analyticsConfig
  };
}

function render(template, context) {
  return env.render(template, context);
}

async function build() {
  await fs.rm(dist, { recursive: true, force: true });
  const cssVersionSeed = [];
  const jsVersionSeed = [];
  const assetVersionSeed = [];
  await compileCss(cssVersionSeed);
  const jsFiles = await copyJs(jsVersionSeed);
  await copyStaticAssets(assetVersionSeed);
  const pwaFiles = await loadPwaFiles();
  const cssVersion = contentVersion(cssVersionSeed);
  const jsVersion = contentVersion(jsVersionSeed);
  await writeVersionedCss(cssVersion);
  await writeVersionedJs(jsFiles, jsVersion);
  const assetVersion = contentVersion([...cssVersionSeed, ...jsVersionSeed, ...assetVersionSeed]);
  const appVersion = contentVersion([
    ...cssVersionSeed,
    ...jsVersionSeed,
    ...assetVersionSeed,
    ['pwa/sw.js', pwaFiles.serviceWorker],
    ['pwa/offline.html', pwaFiles.offlinePage]
  ]);
  await writePwaFiles(pwaFiles, { appVersion, cssVersion, jsVersion });
  const versions = { assetVersion, cssVersion, jsVersion };
  const events = await loadEvents();
  const summary = buildSummary(events);
  const socialImage = publicBaseUrl + '/assets/social/fiestas-valladolid-2026.jpg';

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
    fiestasEvents: events,
    fiestasEventsJson: JSON.stringify(events),
    fiestasDates: summary.dates,
    fiestasTypes: summary.types,
    fiestasAreas: summary.areas
  };

  await writeFile('index.html', render('fiestas-2026.njk', homeContext));
  await writeFile('mapa/index.html', render('fiestas-2026.njk', {
    ...homeContext,
    title: 'Mapa de Fiestas Valladolid 2026 | Aldea Pucela',
    canonicalUrl: publicBaseUrl + '/mapa/',
    social: {
      ...homeContext.social,
      title: 'Mapa de Fiestas Valladolid 2026 | Aldea Pucela',
      url: publicBaseUrl + '/mapa/'
    }
  }));

  await writeFile('plan/index.html', render('fiestas-2026-plan.njk', {
    ...homeContext,
    title: 'Mi plan | Fiestas Valladolid 2026',
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

  for (const event of events) {
    await writeFile('e/' + event.id + '/index.html', render('fiestas-2026-detail.njk', {
      ...pageContext(versions),
      title: event.title + ' | Fiestas Valladolid 2026',
      meta: { description: event.summary || event.description || event.dateLabel },
      canonicalUrl: publicBaseUrl + event.urlPath,
      social: {
        type: 'article', title: event.title + ' | Fiestas Valladolid 2026',
        description: event.summary || event.description || event.dateLabel,
        image: publicBaseUrl + event.socialImagePath,
        imageAlt: event.socialImageAlt,
        imageWidth: event.socialImageWidth, imageHeight: event.socialImageHeight,
        imageType: 'image/jpeg', url: publicBaseUrl + event.urlPath
      },
      event,
      relatedEvents: getRelatedEvents(events, event),
      hideDrawerFilters: true
    }));
  }

  const urls = ['/', '/mapa/', '/plan/', '/plan/importar/', ...events.map((event) => event.urlPath)];
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
