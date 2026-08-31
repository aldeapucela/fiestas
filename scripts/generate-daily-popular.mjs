import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import {
  DAILY_POPULAR_END_DATE,
  DAILY_POPULAR_MAX_ITEMS,
  DAILY_POPULAR_START_DATE,
  POST_HEIGHT,
  POST_MAX_ITEMS,
  POST_WIDTH,
  STORY_CONTENT_BOTTOM,
  STORY_HEIGHT,
  STORY_SAFE_BOTTOM,
  STORY_SAFE_TOP,
  STORY_WIDTH,
  dailyPopularDates,
  formatStoryDate,
  isDailyPopularDate,
  rankDailyPopularEvents,
} from '../src/scripts/daily-popular.js';

const root = process.cwd();
const defaultMetricsUrl = 'https://api.aldeapucela.org/fiestas/saves';
const defaultBaseUrl = 'https://fiestas.aldeapucela.org';

function parseArgs(argv) {
  const options = { date: null, all: false, metricsFile: null, metricsUrl: defaultMetricsUrl, outputDir: 'dist/daily-popular', baseUrl: defaultBaseUrl };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--date') options.date = argv[++index];
    if (argument === '--all') options.all = true;
    if (argument === '--metrics-file') options.metricsFile = argv[++index];
    if (argument === '--metrics-url') options.metricsUrl = argv[++index];
    if (argument === '--output-dir') options.outputDir = argv[++index];
    if (argument === '--base-url') options.baseUrl = argv[++index];
  }
  if (options.date && !isDailyPopularDate(options.date)) {
    throw new Error(`La fecha debe estar entre ${DAILY_POPULAR_START_DATE} y ${DAILY_POPULAR_END_DATE}`);
  }
  return options;
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function slugify(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'evento';
}

function wrapText(value, maxCharacters) {
  const words = String(value || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && candidate.length > maxCharacters) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function readJson(filePath) {
  return fs.readFile(filePath, 'utf8').then((content) => JSON.parse(content));
}

async function loadMetrics(options) {
  if (options.metricsFile) return readJson(path.resolve(root, options.metricsFile));
  const response = await fetch(options.metricsUrl, { headers: { 'cache-control': 'no-cache' } });
  if (!response.ok) throw new Error(`No se pudieron leer las métricas (${response.status})`);
  const payload = await response.json();
  if (!payload?.ok || !Array.isArray(payload.activities)) throw new Error('La respuesta de métricas no tiene el formato esperado');
  return payload;
}

function metricsActivities(payload) {
  return Array.isArray(payload) ? payload : payload?.activities;
}

function eventUrl(baseUrl, event) {
  return `${baseUrl}/e/${encodeURIComponent(String(event.id))}/${slugify(event.title)}/`;
}

function imageUrl(baseUrl, image) {
  if (!image) return null;
  return /^https?:\/\//i.test(image) ? image : `${baseUrl}${image}`;
}

function buildManifest({ baseUrl, date, events, rankedEvents, imagePath, postImagePath, metricsPayload }) {
  const agendaUrl = `${baseUrl}/?date=${encodeURIComponent(date)}`;
  return {
    ok: true,
    schemaVersion: 2,
    festival: 'valladolid-2026',
    date,
    dateLabel: formatStoryDate(date),
    generatedAt: new Date().toISOString(),
    ranking: {
      source: 'fiestas-saves',
      period: '2026',
      weights: { saves: 0.6, visits: 0.4 },
      totalSaves: Number(metricsPayload?.totalSaves) || null,
      totalVisits: Number(metricsPayload?.totalVisits) || null
    },
    agendaUrl,
    imageUrl: `${baseUrl}${imagePath}`,
    storyImageUrl: `${baseUrl}${imagePath}`,
    postImageUrl: `${baseUrl}${postImagePath}`,
    imageWidth: STORY_WIDTH,
    imageHeight: STORY_HEIGHT,
    postImageWidth: POST_WIDTH,
    postImageHeight: POST_HEIGHT,
    safeArea: { top: STORY_SAFE_TOP, bottom: STORY_SAFE_BOTTOM },
    items: rankedEvents.map((event, index) => ({
      rank: index + 1,
      eventId: String(event.id),
      title: event.title,
      date: event.date,
      startTime: event.startTime || null,
      endTime: event.endTime || null,
      location: event.location || null,
      url: eventUrl(baseUrl, event),
      imageUrl: imageUrl(baseUrl, event.image),
      imageSource: event.imageSource || null,
      imageCredit: event.imageCredit || null,
      imageLicense: event.imageLicense || null,
      saveCount: event.saveCount,
      visitCount: event.visitCount,
      popularityScore: event.popularityScore
    })),
    availableEvents: events.length
  };
}

function splitStoryDate(date) {
  const parts = formatStoryDate(date).split(' ');
  return {
    weekday: String(parts[0] || '').toUpperCase(),
    day: String(parts[1] || ''),
    month: parts.slice(3).join(' ').toUpperCase()
  };
}

function fallbackPosterSvg(event, index, x, y) {
  const palettes = [
    ['#0b9e95', '#073f4a'],
    ['#ed614d', '#5b203d'],
    ['#67508e', '#211631'],
    ['#e3a83b', '#7c3d28'],
    ['#3d7381', '#172436'],
    ['#bd5b88', '#41213e']
  ];
  const [accent, background] = palettes[index % palettes.length];
  const titleLines = wrapText(event.title.toUpperCase(), 25).slice(0, 3);
  const titleFontSize = titleLines.length > 2 || titleLines.some((line) => line.length > 22) ? 22 : 27;
  const titleStartY = titleLines.length === 1 ? 347 : titleLines.length === 2 ? 326 : 316;
  const titleMarkup = titleLines.map((line, lineIndex) => (
    `<text x="${x + 28}" y="${y + titleStartY + lineIndex * 26}" font-family="Arial, sans-serif" font-size="${titleFontSize}" font-weight="700" fill="#ffffff">${escapeXml(line)}</text>`
  )).join('');
  return `<rect x="${x + 5}" y="${y + 5}" width="390" height="280" fill="${background}"/>
    <path d="M${x + 245} ${y + 5} H${x + 395} V${y + 165} Z" fill="${accent}" fill-opacity="0.3"/>
    <path d="M${x + 5} ${y + 112} L${x + 155} ${y + 5} H${x + 245} L${x + 5} ${y + 196} Z" fill="#ffffff" fill-opacity="0.06"/>
    <path d="M${x + 5} ${y + 225} C${x + 120} ${y + 180} ${x + 255} ${y + 300} ${x + 395} ${y + 205} V${y + 285} H${x + 5}Z" fill="${accent}" fill-opacity="0.84"/>
    <text x="${x + 28}" y="${y + 42}" font-family="Arial, sans-serif" font-size="14" font-weight="700" letter-spacing="1" fill="#ffffff" fill-opacity="0.9">FIESTAS VALLADOLID 2026</text>
    <rect x="${x + 5}" y="${y + 285}" width="390" height="100" fill="#211631"/>
    <rect x="${x + 5}" y="${y + 285}" width="390" height="7" fill="${accent}"/>
    ${titleMarkup}`;
}

function floatingPosterSvg(event, index, imageData, x, y) {
  const angle = [-3, 3, 2, -2, 3, -2][index] || 0;
  const titleLines = wrapText(event.title.toUpperCase(), 25).slice(0, 3);
  const titleFontSize = titleLines.length > 2 || titleLines.some((line) => line.length > 22) ? 22 : 27;
  const titleStartY = titleLines.length === 1 ? 347 : titleLines.length === 2 ? 326 : 316;
  const titleMarkup = titleLines.map((line, lineIndex) => (
    `<text x="${x + 28}" y="${y + titleStartY + lineIndex * 26}" font-family="Arial, sans-serif" font-size="${titleFontSize}" font-weight="700" fill="#ffffff">${escapeXml(line)}</text>`
  )).join('');
  const titleBand = `<rect x="${x + 5}" y="${y + 285}" width="390" height="100" fill="#211631"/>
    <rect x="${x + 5}" y="${y + 285}" width="390" height="7" fill="${index % 2 ? '#0b9e95' : '#ed614d'}"/>
    ${titleMarkup}`;
  const posterContents = imageData
    ? `<image href="data:image/jpeg;base64,${imageData}" x="${x + 5}" y="${y + 5}" width="390" height="280" preserveAspectRatio="xMidYMid slice"/>${titleBand}`
    : fallbackPosterSvg(event, index, x, y);
  return `<g transform="rotate(${angle} ${x + 200} ${y + 195})">
      <rect x="${x}" y="${y}" width="400" height="390" fill="#ffffff" stroke="#ffffff" stroke-width="8" filter="url(#poster-shadow)"/>
      ${posterContents}
    </g>`;
}

function buildStorySvg({ date, rankedEvents, posterImages, logoData }) {
  const { weekday, day, month } = splitStoryDate(date);
  const posterXs = [105, 575];
  const posterYs = [590, 980, 1370];
  const posters = posterImages.map((entry, index) => floatingPosterSvg(
    entry.event,
    index,
    entry.imageData,
    posterXs[index % 2],
    posterYs[Math.floor(index / 2)]
  )).join('');
  const fallback = posterImages.length ? '' : `<text x="540" y="980" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="30" font-weight="700" fill="#ffffff">Consulta todas las actividades en la web</text>`;
  const footerY = 1822;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${STORY_WIDTH}" height="${STORY_HEIGHT}" viewBox="0 0 ${STORY_WIDTH} ${STORY_HEIGHT}">
  <defs>
    <filter id="poster-shadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="9" stdDeviation="8" flood-color="#070611" flood-opacity="0.38"/>
    </filter>
  </defs>
  <rect width="${STORY_WIDTH}" height="${STORY_HEIGHT}" fill="#211631"/>
  <path d="M0 0 H1080 V635 C800 590 620 594 420 625 C245 655 108 650 0 610 Z" fill="#fcfaf8"/>
  <circle cx="1130" cy="-35" r="260" fill="#211631"/>
  <circle cx="1135" cy="650" r="300" fill="#0b9e95"/>
  <circle cx="1135" cy="650" r="300" fill="none" stroke="#b9eee8" stroke-width="8" stroke-opacity="0.28"/>
  <circle cx="70" cy="1780" r="300" fill="#0b9e95" fill-opacity="0.38"/>
  <circle cx="1010" cy="1710" r="320" fill="#36234f" fill-opacity="0.9"/>

  <image href="data:image/png;base64,${logoData}" x="500" y="55" width="80" height="80" preserveAspectRatio="xMidYMid meet"/>
  <text x="540" y="180" text-anchor="middle" font-family="Arial, sans-serif" font-size="27" font-weight="700" letter-spacing="3" fill="#67508e">FIESTAS DE VALLADOLID 2026</text>
  <text x="540" y="410" text-anchor="middle" font-family="DIN Condensed, Arial Narrow, sans-serif" font-weight="700" letter-spacing="-2" fill="#211631"><tspan font-size="${weekday.length > 8 ? 160 : 180}">${escapeXml(weekday)}</tspan><tspan dx="20" font-size="${day.length > 1 ? 210 : 265}">${escapeXml(day)}</tspan></text>
  <text x="540" y="485" text-anchor="middle" font-family="DIN Condensed, Arial Narrow, sans-serif" font-size="48" font-weight="700" letter-spacing="5" fill="#67508e">DE ${escapeXml(month)}</text>
  <rect x="248" y="510" width="584" height="66" fill="#0b9e95"/>
  <text x="540" y="555" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="700" letter-spacing="1.5" fill="#ffffff">ACTIVIDADES POPULARES</text>
  <path d="M505 588 C610 575 712 575 812 585" fill="none" stroke="#ed614d" stroke-width="7"/>

  <g>${posters || fallback}</g>

  <text x="540" y="${footerY}" text-anchor="middle" font-family="Arial, sans-serif" font-size="19" font-weight="700" letter-spacing="2" fill="#ffffff">VER TODAS</text>
  <text x="540" y="${footerY + 49}" text-anchor="middle" font-family="Arial, sans-serif" font-size="38" font-weight="700" letter-spacing="0.2" fill="#ffffff">fiestas.aldeapucela.org</text>
  <path d="M315 ${footerY + 70} C455 ${footerY + 54} 625 ${footerY + 54} 765 ${footerY + 70}" fill="none" stroke="#0b9e95" stroke-width="8"/>
</svg>`;
}

function buildPostSvg({ date, posterImages, logoData }) {
  const { weekday, day, month } = splitStoryDate(date);
  const posterXs = [105, 575];
  const posterYs = [445, 835];
  const posters = posterImages.slice(0, POST_MAX_ITEMS).map((entry, index) => floatingPosterSvg(
    entry.event,
    index,
    entry.imageData,
    posterXs[index % 2],
    posterYs[Math.floor(index / 2)]
  )).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${POST_WIDTH}" height="${POST_HEIGHT}" viewBox="0 0 ${POST_WIDTH} ${POST_HEIGHT}">
  <defs>
    <filter id="poster-shadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="9" stdDeviation="8" flood-color="#070611" flood-opacity="0.38"/>
    </filter>
  </defs>
  <rect width="${POST_WIDTH}" height="${POST_HEIGHT}" fill="#211631"/>
  <path d="M0 0 H1080 V470 C820 430 625 432 420 458 C240 482 105 480 0 450 Z" fill="#fcfaf8"/>
  <circle cx="1130" cy="-40" r="250" fill="#211631"/>
  <circle cx="1135" cy="500" r="275" fill="#0b9e95"/>
  <circle cx="1135" cy="500" r="275" fill="none" stroke="#b9eee8" stroke-width="8" stroke-opacity="0.28"/>
  <circle cx="75" cy="1390" r="245" fill="#0b9e95" fill-opacity="0.34"/>
  <circle cx="1015" cy="1350" r="265" fill="#36234f" fill-opacity="0.9"/>

  <image href="data:image/png;base64,${logoData}" x="510" y="28" width="60" height="60" preserveAspectRatio="xMidYMid meet"/>
  <text x="540" y="125" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="700" letter-spacing="2.8" fill="#67508e">FIESTAS DE VALLADOLID 2026</text>
  <text x="540" y="290" text-anchor="middle" font-family="DIN Condensed, Arial Narrow, sans-serif" font-weight="700" letter-spacing="-2" fill="#211631"><tspan font-size="${weekday.length > 8 ? 116 : 132}">${escapeXml(weekday)}</tspan><tspan dx="18" font-size="${day.length > 1 ? 150 : 185}">${escapeXml(day)}</tspan></text>
  <text x="540" y="350" text-anchor="middle" font-family="DIN Condensed, Arial Narrow, sans-serif" font-size="40" font-weight="700" letter-spacing="4" fill="#67508e">DE ${escapeXml(month)}</text>
  <rect x="260" y="370" width="560" height="58" fill="#0b9e95"/>
  <text x="540" y="410" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="700" letter-spacing="1.4" fill="#ffffff">ACTIVIDADES POPULARES</text>
  <path d="M510 438 C610 427 710 427 805 436" fill="none" stroke="#ed614d" stroke-width="7"/>

  <g>${posters}</g>

  <text x="540" y="1302" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" font-weight="700" letter-spacing="2" fill="#ffffff">VER TODAS</text>
  <text x="540" y="1357" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" font-weight="700" letter-spacing="0.1" fill="#ffffff">fiestas.aldeapucela.org</text>
  <path d="M300 1380 C450 1363 630 1363 780 1380" fill="none" stroke="#0b9e95" stroke-width="9"/>
</svg>`;
}

async function preparePosterImage(event) {
  const sourcePath = path.join(root, 'src', event.image.replace(/^\//, ''));
  const content = await fs.readFile(sourcePath);
  return sharp(content)
    .rotate()
    .resize(390, 280, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 88 })
    .toBuffer();
}

function storyVisualEvents(rankedEvents) {
  const usedImages = new Set();
  return rankedEvents.slice(0, DAILY_POPULAR_MAX_ITEMS).map((event) => {
    const image = typeof event.image === 'string' && event.image.startsWith('/assets/') && !usedImages.has(event.image)
      ? event.image
      : null;
    if (image) usedImages.add(image);
    return { event, image };
  });
}

async function prepareLogo() {
  const content = await fs.readFile(path.join(root, 'src', 'assets', 'favicon.png'));
  return sharp(content).resize(70, 70, { fit: 'contain' }).png().toBuffer();
}

async function generateDailyImages({ date, posterEvents, storyOutputPath, postOutputPath }) {
  const posterImages = [];
  for (const { event, image: imagePath } of posterEvents) {
    const image = imagePath ? await preparePosterImage({ ...event, image: imagePath }) : null;
    posterImages.push({ event, imageData: image?.toString('base64') || null });
  }
  const logo = await prepareLogo();
  const logoData = logo.toString('base64');
  const storySvg = buildStorySvg({ date, posterImages, logoData });
  const postSvg = buildPostSvg({ date, posterImages, logoData });
  await Promise.all([
    sharp(Buffer.from(storySvg)).jpeg({ quality: 90, chromaSubsampling: '4:4:4' }).toFile(storyOutputPath),
    sharp(Buffer.from(postSvg)).jpeg({ quality: 90, chromaSubsampling: '4:4:4' }).toFile(postOutputPath)
  ]);
}

export async function generateDailyPopular({ date, events, metricsPayload, outputDir, baseUrl = defaultBaseUrl }) {
  if (!isDailyPopularDate(date)) throw new Error(`Fecha no válida: ${date}`);
  const dayEvents = events.filter((event) => String(event.date) === date);
  if (!dayEvents.length) throw new Error(`No hay eventos para ${date}`);
  const rankedAllEvents = rankDailyPopularEvents(dayEvents, metricsActivities(metricsPayload), dayEvents.length)
    .map((event, index) => ({ ...event, popularityRank: index + 1 }));
  const rankedEvents = rankedAllEvents.slice(0, DAILY_POPULAR_MAX_ITEMS);
  const posterEvents = storyVisualEvents(rankedEvents);
  await fs.mkdir(outputDir, { recursive: true });
  const imagePath = `/daily-popular/${date}.jpg`;
  const postImagePath = `/daily-popular/${date}-post.jpg`;
  const outputImagePath = path.join(outputDir, `${date}.jpg`);
  const outputPostImagePath = path.join(outputDir, `${date}-post.jpg`);
  await generateDailyImages({ date, posterEvents, storyOutputPath: outputImagePath, postOutputPath: outputPostImagePath });
  const manifest = buildManifest({ baseUrl, date, events: dayEvents, rankedEvents, imagePath, postImagePath, metricsPayload });
  const content = `${JSON.stringify(manifest, null, 2)}\n`;
  await fs.writeFile(path.join(outputDir, `${date}.json`), content, 'utf8');
  const hash = createHash('sha256').update(content).digest('hex');
  return { date, outputImagePath, outputPostImagePath, manifestPath: path.join(outputDir, `${date}.json`), manifest, manifestSha256: hash };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const events = await readJson(path.join(root, 'src/data/fiestas-2026/events.json'));
  const metricsPayload = await loadMetrics(options);
  const dates = options.all || !options.date ? dailyPopularDates() : [options.date];
  const outputDir = path.resolve(root, options.outputDir);
  await fs.mkdir(outputDir, { recursive: true });
  for (const date of dates) {
    await generateDailyPopular({ date, events, metricsPayload, outputDir, baseUrl: options.baseUrl });
    console.log(`Cartel diario generado: ${date}`);
  }
}

if (process.argv[1] && new URL(import.meta.url).pathname === path.resolve(process.argv[1])) await main();
