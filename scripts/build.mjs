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
const env = nunjucks.configure(path.join(root, 'src', 'templates'), { autoescape: true, noCache: true });

env.addFilter('urlencode', (value) => encodeURIComponent(String(value || '')));
env.addFilter('dump', (value) => JSON.stringify(value));

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

async function compileCss(assetVersionSeed) {
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
  assetVersionSeed.push(result.css);
}

async function copyJs(assetVersionSeed) {
  const jsDir = path.join(dist, 'assets', 'js');
  await fs.mkdir(jsDir, { recursive: true });
  for (const file of ['fiestas-2026.js', 'menu-drawer.js', 'subscribe.js', 'theme.js']) {
    const content = await fs.readFile(path.join(root, 'src', 'scripts', file), 'utf8');
    await fs.writeFile(path.join(jsDir, file), content);
    assetVersionSeed.push(content);
  }
}

async function loadEvents() {
  const raw = await fs.readFile(path.join(root, 'src', 'data', 'fiestas-2026', 'events.json'), 'utf8');
  return JSON.parse(raw).map((event) => ({
    id: String(event.id || ''),
    date: String(event.date || ''),
    dateLabel: String(event.dateLabel || event.date || ''),
    startTime: String(event.startTime || ''),
    endTime: String(event.endTime || ''),
    title: String(event.title || 'Evento'),
    location: String(event.location || ''),
    zone: String(event.zone || ''),
    type: String(event.type || 'Evento'),
    tags: normalizeTags(event.tags, event.type),
    description: String(event.description || ''),
    summary: String(event.summary || ''),
    performances: Array.isArray(event.performances) ? event.performances.map(String) : [],
    organizers: Array.isArray(event.organizers) ? event.organizers.map(String) : [],
    collaborators: Array.isArray(event.collaborators) ? event.collaborators.map(String) : [],
    coordinates: event.coordinates && Number.isFinite(event.coordinates.lat) && Number.isFinite(event.coordinates.lng)
      ? { lat: event.coordinates.lat, lng: event.coordinates.lng }
      : null,
    ticket: event.ticket && typeof event.ticket === 'object'
      ? {
          required: Boolean(event.ticket.required),
          status: String(event.ticket.status || ''),
          label: String(event.ticket.label || ''),
          url: event.ticket.url ? String(event.ticket.url) : '',
          note: String(event.ticket.note || '')
        }
      : null
  })).filter((event) => event.id && event.date && event.startTime)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.title.localeCompare(b.title, 'es'))
    .map((event) => ({
      ...event,
      icon: fiestas2026Icon(event.type),
      urlPath: '/e/' + event.id + '/',
      mapUrl: event.coordinates ? 'https://www.openstreetmap.org/?mlat=' + event.coordinates.lat + '&mlon=' + event.coordinates.lng + '#map=17/' + event.coordinates.lat + '/' + event.coordinates.lng : '',
      directionsUrl: event.coordinates ? 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(event.coordinates.lat + ',' + event.coordinates.lng) : ''
    }));
}

function buildSummary(events) {
  const dates = [...new Map(events.map((event) => [event.date, {
    date: event.date,
    label: event.dateLabel,
    shortLabel: event.dateLabel.split(' ').slice(0, 2).join(' ')
  }])).values()];
  const types = [...new Set(events.flatMap((event) => event.tags?.length ? event.tags : [event.type || 'Evento']))].sort((a, b) => a.localeCompare(b, 'es'));
  return { dates, types };
}

function normalizeTags(tags, type) {
  const primary = String(type || 'Evento');
  const values = Array.isArray(tags) ? tags.map(String) : [];
  return [...new Set([primary, ...values].map((tag) => tag.trim()).filter(Boolean))];
}

function pageContext(assetVersion) {
  return {
    activeNav: 'fiestas-2026',
    pageCss: 'fiestas-2026.css',
    pageJs: 'fiestas-2026.js',
    assetVersion,
    categoryFeeds: [],
    publicBaseUrl
  };
}

function render(template, context) {
  return env.render(template, context);
}

async function build() {
  await fs.rm(dist, { recursive: true, force: true });
  const assetVersionSeed = [];
  await compileCss(assetVersionSeed);
  await copyJs(assetVersionSeed);
  const assetVersion = createHash('sha256').update(assetVersionSeed.join('\\n')).digest('hex').slice(0, 10);
  const events = await loadEvents();
  const summary = buildSummary(events);
  const socialImage = publicBaseUrl + '/assets/social-preview.jpg';

  await writeFile('index.html', render('fiestas-2026.njk', {
    ...pageContext(assetVersion),
    title: 'Fiestas Valladolid 2026 | Aldea Pucela',
    meta: { description: 'Agenda de las Fiestas de Valladolid 2026 por días, horarios, espacios, categorías y mapa.' },
    canonicalUrl: publicBaseUrl + '/',
    social: {
      type: 'website', title: 'Fiestas Valladolid 2026 | Aldea Pucela',
      description: 'Agenda de las Fiestas de Valladolid 2026 por días, horarios, espacios, categorías y mapa.',
      image: socialImage, url: publicBaseUrl + '/'
    },
    fiestasEvents: events,
    fiestasEventsJson: JSON.stringify(events),
    fiestasDates: summary.dates,
    fiestasTypes: summary.types
  }));

  for (const event of events) {
    await writeFile('e/' + event.id + '/index.html', render('fiestas-2026-detail.njk', {
      ...pageContext(assetVersion),
      title: event.title + ' | Fiestas Valladolid 2026',
      meta: { description: event.summary || event.description || event.dateLabel },
      canonicalUrl: publicBaseUrl + event.urlPath,
      social: {
        type: 'article', title: event.title + ' | Fiestas Valladolid 2026',
        description: event.summary || event.description || event.dateLabel,
        image: socialImage, url: publicBaseUrl + event.urlPath
      },
      event,
      hideDrawerFilters: true
    }));
  }

  const urls = ['/', ...events.map((event) => event.urlPath)];
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

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
