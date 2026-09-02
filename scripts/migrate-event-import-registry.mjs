import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { emptyImportRegistry, occurrenceRegistryKey, registerOccurrence } from './event-import-registry.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const eventsPath = path.join(root, 'src', 'data', 'fiestas-2026', 'events.json');
const registryPath = path.join(root, 'src', 'data', 'fiestas-2026', 'event-import-registry.json');
const reportsDir = path.join(root, '.cache', 'fiestas', 'reports');
const communityPlansDir = path.join(root, 'src', 'data', 'community-plans');
const sourceUrl = 'https://eventos.aldeapucela.org/site-data.json';

const events = JSON.parse(await fs.readFile(eventsPath, 'utf8'));
const source = await fetch(sourceUrl).then((response) => {
  if (!response.ok) throw new Error(`La fuente remota respondió ${response.status}.`);
  return response.json();
});
const sourceById = new Map(source.events.map((event) => [Number(event.id), event]));
const currentIds = new Set(events.map((event) => String(event.id)));
const historicalRows = await readHistoricalRows();

// Relaciones demostradas por la normalización del issue 66. No se infieren
// aliases por similitud: los casos no demostrados quedan pendientes.
const knownAliases = {
  '583': '783',
  '617': '437',
  '619': '704',
  '648': '427',
  '667': '403',
  '705': '516',
  '706': '432',
  '711': '622',
  '713': '415',
  '758': '703',
  '768': '566',
  '770': '690',
  '533': null,
  '543': null,
  '544': null,
  '742': null,
  '743': null,
  '744': null,
  '745': null,
  '746': null,
  '747': null,
  '748': null,
  '749': null,
  '750': null,
  '751': null,
  '757': null,
  '759': null,
  '760': null,
  '761': null,
  '771': null,
  '772': null
};

const registry = emptyImportRegistry();
const observationsByOccurrence = new Map();
const migrationRows = [];

for (const row of historicalRows) {
  const remote = sourceById.get(row.remoteId);
  const occurrence = {
    date: row.date,
    startTime: row.startTime,
    endTime: row.endTime,
    location: row.location
  };
  const key = occurrenceRegistryKey(remote || { id: row.remoteId, startsAt: row.date, endsAt: row.date }, occurrence);
  const groupKey = `${row.remoteId}:${key}`;
  if (!observationsByOccurrence.has(groupKey)) observationsByOccurrence.set(groupKey, []);
  observationsByOccurrence.get(groupKey).push({ ...row, key });
}

for (const [groupKey, rows] of observationsByOccurrence) {
  const [remoteId, ...keyParts] = groupKey.split(':');
  const key = keyParts.join(':');
  const representativeIds = [...new Set(rows.map((row) => {
    const alias = Object.prototype.hasOwnProperty.call(knownAliases, String(row.localId))
      ? knownAliases[String(row.localId)]
      : String(row.localId);
    return alias == null ? null : String(alias);
  }).filter((id) => id && currentIds.has(id)))];

  if (representativeIds.length === 1) {
    registerOccurrence(registry, remoteId, key, {
      status: 'linked',
      localEventId: representativeIds[0],
      reason: 'Censo histórico de informes de importación.'
    });
    migrationRows.push({ remoteId: Number(remoteId), occurrenceKey: key, localIds: rows.map((row) => row.localId), disposition: 'linked', targetLocalId: representativeIds[0] });
  } else {
    const reason = representativeIds.length > 1
      ? `Hay varias fichas locales para la misma ocurrencia: ${representativeIds.join(', ')}.`
      : 'Las fichas históricas de esta ocurrencia ya no existen y no se ha demostrado un sustituto.';
    registerOccurrence(registry, remoteId, key, {
      status: 'pending_review',
      reason
    });
    migrationRows.push({ remoteId: Number(remoteId), occurrenceKey: key, localIds: rows.map((row) => row.localId), disposition: 'pending_review', reason });
  }
}

for (const [localId, targetEventId] of Object.entries(knownAliases)) {
  const oldSlugs = [...new Set(historicalRows
    .filter((row) => row.localId === localId && row.title)
    .map((row) => slugify(row.title)))];
  registry.localAliases[localId] = {
    targetEventId,
    reason: targetEventId === null
      ? 'Evento eliminado durante la normalización; se conserva como tombstone para impedir su recreación.'
      : 'Evento fusionado durante la normalización del issue 66.',
    oldSlugs
  };
}

await fs.writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
await updateCommunityPlans(registry.localAliases);

const reportPath = path.join(root, '.cache', 'fiestas', `event-import-registry-migration-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  historicalRows: historicalRows.length,
  distinctHistoricalLocalIds: new Set(historicalRows.map((row) => String(row.localId))).size,
  registryOccurrences: migrationRows.length,
  linkedOccurrences: migrationRows.filter((row) => row.disposition === 'linked').length,
  pendingOccurrences: migrationRows.filter((row) => row.disposition === 'pending_review').length,
  knownAliases,
  rows: migrationRows
}, null, 2)}\n`);

console.log(JSON.stringify({
  registryPath: path.relative(root, registryPath),
  reportPath: path.relative(root, reportPath),
  historicalRows: historicalRows.length,
  distinctHistoricalLocalIds: new Set(historicalRows.map((row) => String(row.localId))).size,
  linkedOccurrences: migrationRows.filter((row) => row.disposition === 'linked').length,
  pendingOccurrences: migrationRows.filter((row) => row.disposition === 'pending_review').length,
  aliases: Object.keys(knownAliases).length
}, null, 2));

async function readHistoricalRows() {
  const files = (await fs.readdir(reportsDir)).filter((file) => file.endsWith('.json')).sort();
  const rows = [];
  for (const file of files) {
    const report = JSON.parse(await fs.readFile(path.join(reportsDir, file), 'utf8'));
    if (!Array.isArray(report.added)) continue;
    for (const row of report.added) {
      const localId = String(row.localId || '').trim();
      const remoteId = Number(row.remoteId);
      if (!localId || !Number.isInteger(remoteId)) continue;
      rows.push({
        report: file,
        localId,
        remoteId,
        date: String(row.date || '').slice(0, 10),
        startTime: row.startTime || null,
        endTime: row.endTime || null,
        location: String(row.location || '').trim(),
        title: String(row.title || '').trim()
      });
    }
  }
  return rows;
}

async function updateCommunityPlans(aliases) {
  const files = (await fs.readdir(communityPlansDir)).filter((file) => file.endsWith('.json'));
  for (const file of files) {
    const filePath = path.join(communityPlansDir, file);
    const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
    let changed = false;
    for (const plan of data.plans || []) {
      const nextIds = [...new Set((plan.activityIds || []).map((id) => {
        const alias = aliases[String(id)];
        if (!alias) return String(id);
        changed = true;
        return alias.targetEventId;
      }).filter(Boolean))];
      if (JSON.stringify(nextIds) !== JSON.stringify(plan.activityIds)) {
        plan.activityIds = nextIds;
        changed = true;
      }
    }
    if (changed) await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
  }
}

async function fetch(url) {
  return globalThis.fetch(url, { headers: { 'User-Agent': 'AldeaPucelaFiestas/1.0 (contacto@aldeapucela.org)' } });
}

function slugify(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'evento';
}
