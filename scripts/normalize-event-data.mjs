import fs from 'node:fs/promises';

const eventsPath = 'src/data/fiestas-2026/events.json';
const reportPath = 'docs/event-normalization-comparison.md';
const infoMarker = 'Información ampliada:';

const events = JSON.parse(await fs.readFile(eventsPath, 'utf8'));
const changes = {
  zones: 0,
  lists: 0,
  images: 0,
  tags: 0,
  repeatedInfoBlocks: []
};

for (const event of events) {
  if (event.zone === 'Zona centro') {
    event.zone = 'Zona Centro';
    changes.zones += 1;
  }

  for (const field of ['performances', 'organizers', 'collaborators', 'tags']) {
    if (!Array.isArray(event[field])) continue;
    const normalized = uniqueStrings(event[field]);
    if (JSON.stringify(normalized) !== JSON.stringify(event[field])) {
      event[field] = normalized;
      changes.lists += 1;
    }
  }

  if (Array.isArray(event.images)) {
    const normalized = uniqueStrings([event.image, ...event.images].filter(Boolean));
    if (normalized.length > 1) {
      if (event.image !== normalized[0]) {
        event.image = normalized[0];
        changes.images += 1;
      }
      if (JSON.stringify(event.images) !== JSON.stringify(normalized)) {
        event.images = normalized;
        changes.images += 1;
      }
    } else {
      delete event.images;
      changes.images += 1;
    }
  }

  if (event.type && Array.isArray(event.tags) && !event.tags.includes(event.type)) {
    event.tags = [event.type, ...event.tags];
    changes.tags += 1;
  }

  for (const field of ['description', 'summary']) {
    if (typeof event[field] !== 'string') continue;
    const normalized = dedupeInfoBlocks(event[field]);
    if (normalized === event[field]) continue;
    changes.repeatedInfoBlocks.push({
      id: event.id,
      field,
      before: countInfoBlocks(event[field]),
      after: countInfoBlocks(normalized)
    });
    event[field] = normalized;
  }
}

await fs.writeFile(eventsPath, `${JSON.stringify(events, null, 2)}\n`);
await appendReport(changes);

console.log(JSON.stringify({
  events: events.length,
  zones: changes.zones,
  lists: changes.lists,
  images: changes.images,
  tags: changes.tags,
  repeatedInfoBlocks: changes.repeatedInfoBlocks.length
}, null, 2));

function uniqueStrings(values) {
  const seen = new Set();
  const result = [];
  for (const raw of values) {
    if (typeof raw !== 'string') continue;
    const value = cleanText(raw);
    if (!value) continue;
    const key = simplify(value);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function dedupeInfoBlocks(text) {
  const parts = String(text).split(infoMarker);
  if (parts.length <= 2) return cleanText(text);

  const base = cleanText(parts.shift());
  const blocks = [];
  const keys = [];

  for (const raw of parts) {
    const block = cleanText(raw);
    if (!block) continue;

    const key = simplify(block);
    const existingIndex = keys.findIndex((existing) => sameMeaning(existing, key));
    if (existingIndex >= 0) {
      if (blockScore(block) > blockScore(blocks[existingIndex])) {
        blocks[existingIndex] = block;
      }
      continue;
    }

    keys.push(key);
    blocks.push(block);
  }

  return cleanText([
    base,
    blocks.length ? `${infoMarker} ${blocks.join(' Además, ')}` : ''
  ].filter(Boolean).join(' '));
}

function cleanText(value) {
  return String(value)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}

function simplify(value) {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-ES')
    .replace(/[‘’“”"'´]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function sameMeaning(left, right) {
  return left === right || left.includes(right) || right.includes(left);
}

function blockScore(value) {
  return (/^[A-ZÁÉÍÓÚÜÑ]/u.test(value) ? 1000 : 0) + value.length;
}

function countInfoBlocks(value) {
  return (String(value).match(new RegExp(infoMarker, 'g')) || []).length;
}

async function appendReport(result) {
  const extraRows = result.repeatedInfoBlocks;
  const lines = [
    '',
    '## Normalización adicional',
    '',
    `Zonas canónicas corregidas: ${result.zones}`,
    `Listas compactadas: ${result.lists}`,
    `Galerías normalizadas: ${result.images}`,
    `Tags alineados con type: ${result.tags}`,
    `Campos con bloques repetidos de Información ampliada limpiados: ${extraRows.length}`
  ];

  if (extraRows.length) {
    lines.push(
      '',
      '| ID | Campo | Antes | Después |',
      '| ---: | --- | ---: | ---: |',
      ...extraRows.map((row) => `| ${row.id} | ${row.field} | ${row.before} | ${row.after} |`)
    );
  }

  await fs.appendFile(reportPath, `${lines.join('\n')}\n`);
}
