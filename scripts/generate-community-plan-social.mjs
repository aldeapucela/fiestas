import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const execFileAsync = promisify(execFile);
const root = process.cwd();

function parseArgs(argv) {
  const options = {
    planId: null,
    maxPosters: 6,
    posterIds: null,
    backgroundPath: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--plan') options.planId = argv[++index];
    if (argument === '--max-posters') options.maxPosters = Number(argv[++index]);
    if (argument === '--poster-ids') options.posterIds = argv[++index].split(',').map((id) => id.trim()).filter(Boolean);
    if (argument === '--background') options.backgroundPath = argv[++index];
  }

  if (!options.planId) {
    throw new Error('Falta --plan <id>');
  }
  if (!Number.isInteger(options.maxPosters) || options.maxPosters < 1 || options.maxPosters > 6) {
    throw new Error('--max-posters debe ser un entero entre 1 y 6');
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

function wrapTitle(title, maxCharacters = 16) {
  const words = title.split(/\s+/).filter(Boolean);
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

function selectPosterEvents(events, plan, options) {
  const eventById = new Map(events.map((event) => [String(event.id), event]));
  const available = plan.activityIds
    .map((id) => eventById.get(String(id)))
    .filter((event) => event?.image?.startsWith('/assets/'));

  if (options.posterIds?.length) {
    const requested = options.posterIds
      .map((id) => eventById.get(String(id)))
      .filter((event) => event?.image?.startsWith('/assets/'));
    if (requested.length) return requested.slice(0, options.maxPosters);
  }

  if (available.length <= options.maxPosters) return available;
  return Array.from({ length: options.maxPosters }, (_, index) => {
    const sourceIndex = Math.round(index * (available.length - 1) / (options.maxPosters - 1));
    return available[sourceIndex];
  });
}

function posterPosition(index) {
  const positions = [
    { x: 585, y: 75, angle: -6 },
    { x: 770, y: 65, angle: 2 },
    { x: 955, y: 83, angle: 7 },
    { x: 585, y: 335, angle: 5 },
    { x: 770, y: 325, angle: -3 },
    { x: 955, y: 340, angle: -6 },
  ];
  return positions[index];
}

function buildSvg({ plan }) {
  const titleLines = wrapTitle(plan.name, 12);
  const titleMarkup = titleLines.map((line, index) => (
    `<tspan x="107" dy="${index === 0 ? 0 : 58}">${escapeXml(line)}</tspan>`
  )).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#fcfaf8" />
  <rect x="560" width="640" height="630" fill="#211631" />
  <circle cx="900" cy="104" r="290" fill="#0b9e95" />
  <circle cx="1090" cy="560" r="245" fill="#36234f" />

  <text x="133" y="86" font-family="DejaVu Sans, Arial, sans-serif" font-size="23" font-weight="700" letter-spacing="0.5" fill="#67508e">FIESTAS VALLADOLID 2026</text>

  <rect x="70" y="195" width="9" height="194" rx="4" fill="#0b9e95" />
  <text x="107" y="251" font-family="DejaVu Sans, Arial, sans-serif" font-size="56" font-weight="700" fill="#20232b">${titleMarkup}</text>
  <text x="107" y="450" font-family="DejaVu Sans, Arial, sans-serif" font-size="28" fill="#6a7285">por ${escapeXml(plan.author || 'Aldea Pucela')}</text>
</svg>`;
}

function buildIllustratedOverlaySvg({ plan }) {
  const titleLines = wrapTitle(plan.name, 12);
  const titleMarkup = titleLines.map((line, index) => (
    `<tspan x="107" dy="${index === 0 ? 0 : 58}">${escapeXml(line)}</tspan>`
  )).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <text x="133" y="86" font-family="DejaVu Sans, Arial, sans-serif" font-size="23" font-weight="700" letter-spacing="0.5" fill="#b9eee8">FIESTAS VALLADOLID 2026</text>
  <rect x="70" y="195" width="9" height="194" rx="4" fill="#4cd5c7" />
  <text x="107" y="251" font-family="DejaVu Sans, Arial, sans-serif" font-size="56" font-weight="700" fill="#ffffff">${titleMarkup}</text>
  <text x="107" y="450" font-family="DejaVu Sans, Arial, sans-serif" font-size="28" fill="#b9eee8">por ${escapeXml(plan.author || 'Aldea Pucela')}</text>
</svg>`;
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const catalog = await readJson('src/data/community-plans.json');
  const events = await readJson('src/data/fiestas-2026/events.json');
  const catalogEntry = catalog.plans.find((entry) => entry.id === options.planId);
  if (!catalogEntry) throw new Error(`No existe el plan ${options.planId} en src/data/community-plans.json`);

  const planFile = await readJson(catalogEntry.url.replace(/^\//, 'src/'));
  const plan = { ...catalogEntry, ...planFile.plans[0] };
  const backgroundPath = options.backgroundPath ? path.resolve(options.backgroundPath) : null;
  const posters = backgroundPath ? [] : selectPosterEvents(events, plan, options);
  if (!backgroundPath && !posters.length) throw new Error(`El plan ${options.planId} no tiene actividades con cartel local`);

  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'fiestas-social-plan-'));
  const svgPath = path.join(temporaryDirectory, `${options.planId}.svg`);
  const outputPath = path.join(root, 'src/assets/social/plans', `${options.planId}.jpg`);
  try {
    const posterPaths = await Promise.all(posters.map(async (event, index) => {
      const sourcePath = path.join(root, 'src', event.image.replace(/^\/assets\//, 'assets/'));
      const resizedPath = path.join(temporaryDirectory, `poster-${index}.jpg`);
      await execFileAsync('magick', [
        sourcePath,
        '-thumbnail',
        '160x220^',
        '-gravity',
        'center',
        '-extent',
        '160x220',
        resizedPath,
      ]);
      return resizedPath;
    }));
    const svg = backgroundPath ? buildIllustratedOverlaySvg({ plan }) : buildSvg({ plan });
    await writeFile(svgPath, svg, 'utf8');

    const basePath = path.join(temporaryDirectory, 'base.png');
    if (backgroundPath) {
      const overlayPath = path.join(temporaryDirectory, 'overlay.png');
      await execFileAsync('magick', [backgroundPath, '-thumbnail', '1200x630^', '-gravity', 'center', '-extent', '1200x630', basePath]);
      await execFileAsync('magick', [
        '-background',
        'none',
        svgPath,
        '-strip',
        '-define',
        'png:color-type=6',
        overlayPath,
      ]);
      await execFileAsync('magick', [basePath, overlayPath, '-composite', basePath]);
    } else {
      await execFileAsync('magick', [svgPath, '-strip', '-define', 'png:color-type=6', basePath]);
    }

    const logoPath = path.join(temporaryDirectory, 'logo.png');
    await execFileAsync('magick', [
      path.join(root, 'src/assets/favicon.png'),
      '-resize',
      '48x48',
      logoPath,
    ]);
    await execFileAsync('magick', [basePath, logoPath, '-geometry', '+70+55', '-composite', basePath]);

    let currentPath = basePath;
    for (const [index, posterPath] of posterPaths.entries()) {
      const { angle, x, y } = posterPosition(index);
      const cardPath = path.join(temporaryDirectory, `card-${index}.png`);
      const rotatedPath = path.join(temporaryDirectory, `rotated-${index}.png`);
      const nextPath = path.join(temporaryDirectory, `composited-${index}.png`);

      await execFileAsync('magick', [
        posterPath,
        '-bordercolor',
        '#ffffff',
        '-border',
        '5',
        cardPath,
      ]);
      await execFileAsync('magick', [
        cardPath,
        '-background',
        'none',
        '-rotate',
        String(angle),
        '-trim',
        '+repage',
        rotatedPath,
      ]);

      const { stdout } = await execFileAsync('magick', ['identify', '-format', '%w %h', rotatedPath]);
      const [rotatedWidth, rotatedHeight] = stdout.trim().split(/\s+/).map(Number);
      const left = Math.round(x + 80 - rotatedWidth / 2);
      const top = Math.round(y + 110 - rotatedHeight / 2);
      await execFileAsync('magick', [
        currentPath,
        rotatedPath,
        '-geometry',
        `+${left}+${top}`,
        '-composite',
        nextPath,
      ]);
      currentPath = nextPath;
    }

    await execFileAsync('magick', [
      currentPath,
      '-background',
      'white',
      '-alpha',
      'remove',
      '-alpha',
      'off',
      '-strip',
      '-interlace',
      'Plane',
      '-quality',
      '89',
      outputPath,
    ]);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }

  console.log(`Generada ${outputPath}`);
  console.log(backgroundPath
    ? `Ilustración de fondo: ${backgroundPath}`
    : `Carteles: ${posters.map((event) => `${event.id} (${event.title})`).join(', ')}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
