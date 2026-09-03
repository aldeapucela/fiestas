import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { buildImportGuard } from './event-import-guard.mjs';
import { findLikelyDuplicateEvent } from './event-duplicate-detection.mjs';
import { isDailySeries, occurrencesFor } from './import-eventos-ferias-dates.mjs';
import {
  assertRegistryIntegrity,
  emptyImportRegistry,
  getRegisteredOccurrence,
  normalizeImportRegistry,
  occurrenceRegistryKey,
  registerOccurrence
} from './event-import-registry.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const eventsPath = path.join(root, 'src', 'data', 'fiestas-2026', 'events.json');
const verifiedOccurrencesPath = path.join(root, 'src', 'data', 'fiestas-2026', 'verified-event-occurrences.json');
const importDecisionsPath = path.join(root, 'src', 'data', 'fiestas-2026', 'import-event-decisions.json');
const importRegistryPath = path.join(root, 'src', 'data', 'fiestas-2026', 'event-import-registry.json');
const cachePath = path.join(root, '.cache', 'fiestas', 'nominatim-location-cache.json');
const reportsDir = path.join(root, '.cache', 'fiestas', 'reports');
const snapshotsDir = path.join(root, '.cache', 'fiestas', 'import-snapshots');
const lockPath = path.join(root, '.cache', 'fiestas', 'event-import.lock');
const sourceUrl = 'https://eventos.aldeapucela.org/site-data.json';
const userAgent = 'AldeaPucelaFiestas/1.0 (contacto@aldeapucela.org)';
const args = parseArgs(process.argv.slice(2));
const execFile = promisify(execFileCallback);

await acquireImportLock();
process.on('exit', () => {
  try { fsSync.rmSync(lockPath, { recursive: true, force: true }); } catch (_) { /* best effort */ }
});

if (args.applyPlan) {
  await applyPreparedPlan(args.applyPlan);
  process.exit(0);
}

const events = JSON.parse(await fs.readFile(eventsPath, 'utf8'));
const source = await fetchJson(sourceUrl);
const sourceEvents = new Map(source.events.map((event) => [Number(event.id), event]));
const verifiedOccurrences = await readJson(verifiedOccurrencesPath, {});
const importDecisions = await readJson(importDecisionsPath, {});
const importGuard = buildImportGuard(importDecisions);
const registry = normalizeImportRegistry(await readJson(importRegistryPath, emptyImportRegistry()));
const cache = await readJson(cachePath, {});
const initialHashes = {
  gitHead: await gitHead(),
  events: hashJson(events),
  verifiedOccurrences: hashJson(verifiedOccurrences),
  registry: hashJson(registry)
};
let sourceSnapshotPath = null;
if (args.prepare) {
  sourceSnapshotPath = path.join(snapshotsDir, `source-${stamp()}.json`);
  await fs.mkdir(snapshotsDir, { recursive: true });
  await fs.writeFile(sourceSnapshotPath, `${JSON.stringify(source, null, 2)}\n`);
}
const report = {
  mode: args.prepare ? 'prepare' : args.apply ? 'apply' : 'dry-run',
  sourceUrl,
  generatedAt: new Date().toISOString(),
  dateWindow: ['2026-09-04', '2026-09-13'],
  totals: { sourceInWindow: 0, sourceOutsideValladolid: 0, sourceUnavailable: 0, enriched: 0, imagesAdded: 0, added: 0, skipped: 0, blocked: 0, unresolved: 0, conflicts: 0 },
  excluded: importGuard.blockedRemoteEntries(),
  sourceUnavailable: [],
  enriched: [],
  imagesAdded: [],
  added: [],
  skipped: [],
  blocked: [],
  unresolved: [],
  conflicts: []
};

const windowEvents = source.events.filter((event) => isInDateWindow(event.startsAt));
report.totals.sourceInWindow = windowEvents.length;
report.totals.sourceOutsideValladolid = windowEvents.filter((event) => !isValladolid(event)).length;

const localById = new Map(events.map((event) => [event.id, event]));
const matchedRemoteToLocal = buildMatchedRemoteToLocal(events);
const imageRemoteToLocal = {
  2162: [5],
  2317: [24],
  2186: [11],
  2164: [19],
  1885: [55],
  2185: [60],
  2149: [73, 165, 254, 319, 367],
  2193: [76],
  1888: [90, 111],
  2167: [155],
  2133: [160],
  1298: [162],
  2192: [227],
  1730: [235],
  2182: [277],
  1903: [315],
  2157: [317],
  1884: [395],
  1980: [825]
};

registerKnownMatches(matchedRemoteToLocal, sourceEvents, localById, registry);
registerKnownMatches(imageRemoteToLocal, sourceEvents, localById, registry);

for (const [remoteIdText, localIds] of Object.entries(matchedRemoteToLocal)) {
  const remoteId = Number(remoteIdText);
  const remote = sourceEvents.get(remoteId);
  if (!remote) {
    report.totals.sourceUnavailable += 1;
    report.sourceUnavailable.push({ remoteId, reason: 'El evento ya no está publicado en la fuente remota.' });
    continue;
  }
  for (const localId of localIds) {
    const local = localById.get(localId);
    if (!local) throw new Error(`El evento local ${localId} no existe.`);
    const changed = enrichExistingEvent(local, remote);
    if (changed) {
      report.totals.enriched += 1;
      report.enriched.push({ localId, remoteId, title: local.title });
    }
  }
}

for (const [remoteIdText, localIds] of Object.entries(imageRemoteToLocal)) {
  const remoteId = Number(remoteIdText);
  const remote = sourceEvents.get(remoteId);
  if (!remote) {
    report.totals.sourceUnavailable += 1;
    report.sourceUnavailable.push({ remoteId, reason: 'El evento ya no está publicado en la fuente remota.' });
    continue;
  }
  for (const localId of localIds) {
    const local = localById.get(localId);
    if (!local) throw new Error(`El evento local ${localId} no existe.`);
    if (!local.image && remote.image) {
      local.image = remote.image;
      report.totals.imagesAdded += 1;
      report.imagesAdded.push({ localId, remoteId, image: remote.image });
    }
  }
}

const knownMatchedRemoteIds = new Set(Object.keys(matchedRemoteToLocal).map(Number));
for (const { remoteId, localId } of importGuard.duplicateRemoteEntries()) {
  registerKnownMatches({ [remoteId]: [localId] }, sourceEvents, localById, registry);
}

const candidateEvents = windowEvents.filter((remote) => {
  const remoteId = Number(remote.id);
  return isValladolid(remote)
    && !knownMatchedRemoteIds.has(remoteId)
    && !importGuard.getDuplicateLocal(remoteId)
    && !importGuard.getBlockedRemote(remoteId);
});
let nextId = Math.max(...events.map((event) => Number(event.id))) + 1;
for (const { remoteId, localId, reason } of importGuard.duplicateRemoteEntries()) {
  const remote = sourceEvents.get(remoteId);
  if (!remote || !isInDateWindow(remote.startsAt)) continue;
  report.totals.skipped += 1;
  report.skipped.push({
    remoteId,
    localId,
    date: remote.startsAt.slice(0, 10),
    reason
  });
}
for (const { id, reason } of importGuard.blockedRemoteEntries()) {
  const remote = sourceEvents.get(id);
  if (!remote || !isInDateWindow(remote.startsAt)) continue;
  report.totals.blocked += 1;
  report.blocked.push({
    remoteId: id,
    date: remote.startsAt.slice(0, 10),
    title: remote.title,
    reason
  });
}
for (const remote of candidateEvents) {
  const remoteId = Number(remote.id);
  const occurrenceResolution = occurrencesFor(remote, verifiedOccurrences, { maxDate: '2026-09-13' });
  const pendingOccurrences = [];
  for (const [occurrenceIndex, occurrence] of occurrenceResolution.occurrences.entries()) {
    const registryKey = occurrenceRegistryKey(remote, occurrence, occurrenceIndex);
    const blockedEvent = importGuard.getBlockedEvent(remoteOccurrenceCandidate(remote, occurrence));
    if (blockedEvent) {
      report.totals.blocked += 1;
      report.blocked.push({
        remoteId,
        deletedLocalId: blockedEvent.deletedLocalId,
        date: occurrence.date,
        title: remote.title,
        reason: blockedEvent.reason
      });
      continue;
    }
    const registered = getRegisteredOccurrence(registry, remoteId, registryKey);
    if (registered) {
      if (registered.status === 'linked' && !localById.has(Number(registered.localEventId))) {
        throw new Error(`El registro ${remoteId}:${registryKey} apunta al evento local inexistente ${registered.localEventId}.`);
      }
      report.totals.skipped += 1;
      report.skipped.push({
        remoteId,
        localId: registered.localEventId,
        date: occurrence.date,
        reason: registered.status === 'linked'
          ? 'Ocurrencia registrada; no se vuelve a importar.'
          : `Ocurrencia marcada como ${registered.status}.`
      });
      continue;
    }
    const existingMatch = findExistingLocal(remote, events, occurrence);
    const existing = existingMatch?.event || null;
    if (!existing) {
      const possibleMatches = findPossibleLocals(remote, events, occurrence);
      if (possibleMatches.length) {
        report.totals.conflicts += 1;
        report.conflicts.push({
          remoteId,
          date: occurrence.date,
          title: remote.title,
          possibleLocalIds: possibleMatches.map((event) => event.id),
          reason: 'Coincidencia aproximada; requiere revisión y no se crea automáticamente.'
        });
        continue;
      }
      pendingOccurrences.push({ ...occurrence, registryKey });
      continue;
    }
    const changed = enrichExistingEvent(existing, remote);
    if (changed) {
      report.totals.enriched += 1;
      report.enriched.push({ localId: existing.id, remoteId, date: occurrence.date, title: existing.title });
    }
    addImageIfMissing(existing, remote, report);
    report.totals.skipped += 1;
    registerOccurrence(registry, remoteId, registryKey, {
      status: 'linked',
      localEventId: existing.id,
      reason: existingMatch.reason
    });
    report.skipped.push({ remoteId, localId: existing.id, date: occurrence.date, reason: existingMatch.reason });
  }
  if (!pendingOccurrences.length) continue;

  if (!occurrenceResolution.verified) {
    report.totals.unresolved += 1;
    report.unresolved.push({
      remoteId,
      title: remote.title,
      reason: occurrenceResolution.reason,
      dateRange: [remote.startsAt?.slice(0, 10), remote.endsAt?.slice(0, 10)],
      candidateDates: pendingOccurrences.map((occurrence) => occurrence.date)
    });
    continue;
  }

  const coordinatesByLocation = new Map();
  try {
    for (const occurrence of pendingOccurrences) {
      const location = locationFor(remote, occurrence);
      if (!isConcreteLocation(location)) {
        throw new Error(`La fuente no proporciona un lugar concreto para ${occurrence.date}.`);
      }
      const locationKey = simplifyTitle(location);
      if (!coordinatesByLocation.has(locationKey)) {
        coordinatesByLocation.set(locationKey, await resolveCoordinates(remote, location, events));
      }
    }
  } catch (error) {
    report.totals.unresolved += 1;
    report.unresolved.push({
      remoteId,
      title: remote.title,
      reason: error.message,
      locations: [...new Set(pendingOccurrences.map((occurrence) => locationFor(remote, occurrence)))]
    });
    continue;
  }

  for (const occurrence of pendingOccurrences) {
    if (localById.has(nextId)) {
      throw new Error(`El ID nuevo ${nextId} ya está ocupado.`);
    }
    const location = locationFor(remote, occurrence);
    const local = await createLocalEvent(
      remote,
      nextId,
      events,
      occurrence,
      coordinatesByLocation.get(simplifyTitle(location))
    );
    nextId += 1;
    events.push(local);
    localById.set(local.id, local);
    registerOccurrence(registry, remoteId, occurrence.registryKey, {
      status: 'linked',
      localEventId: local.id,
      reason: 'Nueva ocurrencia importada con identidad registrada.'
    });
    report.totals.added += 1;
    report.added.push({
      localId: local.id,
      remoteId,
      date: occurrence.date,
      startTime: local.startTime,
      endTime: local.endTime,
      location: local.location,
      title: local.title
    });
  }
}

if (args.apply && (report.unresolved.length || report.conflicts.length)) {
  throw new Error(`La importación tiene ${report.unresolved.length} pendientes y ${report.conflicts.length} conflictos; prepara y revisa antes de aplicar.`);
}

if (args.apply) {
  assertRegistryIntegrity(registry, events);
  await writeAtomic(eventsPath, `${JSON.stringify(events, null, 2)}\n`);
  await writeAtomic(importRegistryPath, `${JSON.stringify(registry, null, 2)}\n`);
}

if (args.prepare) {
  assertRegistryIntegrity(registry, events);
  const planPath = path.join(root, '.cache', 'fiestas', `eventos-ferias-import-plan-${stamp()}.json`);
  await fs.writeFile(planPath, `${JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceUrl,
    sourceSnapshotPath: path.relative(root, sourceSnapshotPath),
    sourceSnapshotSha256: hashJson(source),
    initialHashes,
    result: {
      events,
      registry
    },
    report
  }, null, 2)}\n`);
  report.planPath = path.relative(root, planPath);
}

await fs.mkdir(path.dirname(cachePath), { recursive: true });
await fs.writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`);
await fs.mkdir(reportsDir, { recursive: true });
const reportPath = path.join(reportsDir, `eventos-ferias-import-${stamp()}.json`);
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({
  reportPath: path.relative(root, reportPath),
  ...(report.planPath ? { planPath: report.planPath } : {}),
  mode: report.mode,
  totals: report.totals
}, null, 2));

async function createLocalEvent(remote, id, currentEvents, occurrence = null, coordinatesOverride = null) {
  const date = occurrence?.date || remote.startsAt.slice(0, 10);
  const location = locationFor(remote, occurrence);
  const coordinates = coordinatesOverride || await resolveCoordinates(remote, location, currentEvents);
  const type = typeFor(remote.id, remote);
  const summary = cleanText(remote.summary || remote.title);
  const genericTime = isGenericRemoteTime(remote);
  const isMultiDay = isDailySeries(remote);
  const isOvernight = !genericTime && !isMultiDay && remote.startsAt.slice(0, 10) !== remote.endsAt.slice(0, 10);
  const sourceStartTime = occurrence && Object.prototype.hasOwnProperty.call(occurrence, 'startTime')
    ? occurrence.startTime
    : genericTime ? null : timePart(remote.startsAt);
  const sourceEndTime = occurrence && Object.prototype.hasOwnProperty.call(occurrence, 'endTime')
    ? occurrence.endTime
    : genericTime || isOvernight || isStartOnlySeries(remote)
      ? null
      : timePart(remote.endsAt);
  const performances = occurrence?.performances || performancesFor(remote.id);
  const description = Number(remote.id) === 2183
    ? `${summary} El evento se celebra del 9 al 13 de septiembre de 2026.`
    : summary;

  return {
    id,
    date,
    dateLabel: dateLabel(date),
    startTime: sourceStartTime,
    endTime: sourceEndTime,
    title: cleanText(remote.title),
    image: remote.image || null,
    location,
    zone: zoneFor(remote.id, location),
    description,
    summary,
    performances,
    organizers: remote.organizer ? [cleanText(remote.organizer)] : [],
    collaborators: [],
    coordinates,
    type,
    ticket: ticketFor(remote),
    tags: [type]
  };
}

function isStartOnlySeries(remote) {
  return Number(remote.id) === 2218
    && isDailySeries(remote)
    && timePart(remote.startsAt) === '23:59'
    && timePart(remote.endsAt) === '23:59';
}

function buildMatchedRemoteToLocal(currentEvents) {
  const idsByTitle = (needle) => currentEvents
    .filter((event) => normalizeText(event.title).includes(normalizeText(needle)))
    .map((event) => event.id);
  return {
    1312: idsByTitle('La historia interminable'),
    1562: [20],
    1428: [17],
    2011: idsByTitle('Lo de ferias'),
    2162: [5],
    1889: [6],
    1983: [9],
    2186: [11],
    1966: [18],
    2164: [19],
    2149: idsByTitle('Lorencito festival'),
    2098: [32],
    1904: [34, 92, 134, 178, 213, 251, 290, 333, 390],
    1981: [54],
    1885: [55],
    1744: [66],
    2185: [60],
    1307: [58],
    2099: [67],
    1938: [70, 75],
    2193: [76],
    2101: [84],
    1888: [90, 111],
    1306: [97],
    1982: [118],
    1939: [125, 130],
    2046: [123],
    2049: [149],
    1975: [152],
    2167: [155],
    1940: [164],
    2133: [160],
    1298: [162],
    1426: [196],
    1976: [192],
    1917: [199],
    1941: [204],
    2047: [214],
    2192: [227],
    1942: [244],
    1974: [232],
    2102: [236],
    1730: [235],
    1728: [240],
    1310: [281],
    2317: [24],
    2184: [253],
    1977: [269],
    1971: [272],
    2103: [278],
    2182: [277],
    2043: [282],
    1903: [315],
    2157: [317],
    1943: [321],
    1804: [345],
    1979: [349],
    1427: [351],
    2097: [352],
    1886: [361],
    1944: [362, 371],
    2187: [382],
    1884: [395],
    1759: [398],
    2096: [409],
    1980: [825],
    1945: [412]
  };
}

function enrichExistingEvent(local, remote) {
  const remoteSummary = cleanText(remote.summary);
  if (!remoteSummary) return false;
  let changed = false;
  if (!containsText(local.description, remoteSummary)) {
    const base = cleanText(local.description || local.title);
    local.description = `${base}\n\nInformación ampliada: ${remoteSummary}`;
    changed = true;
  }
  if (!local.summary || local.summary === local.title) {
    local.summary = remoteSummary;
    changed = true;
  }
  return changed;
}

function addImageIfMissing(local, remote, currentReport) {
  if (local.image || !remote.image) return false;
  local.image = remote.image;
  currentReport.totals.imagesAdded += 1;
  currentReport.imagesAdded.push({ localId: local.id, remoteId: Number(remote.id), image: remote.image });
  return true;
}

function findExistingLocal(remote, currentEvents, occurrence = null) {
  const candidate = remoteOccurrenceCandidate(remote, occurrence);
  const { date, startTime: remoteTime } = candidate;
  const duplicate = findLikelyDuplicateEvent(candidate, currentEvents);
  if (duplicate) return duplicate;

  const candidates = currentEvents.filter((event) => event.date === date && (
    event.startTime === remoteTime
    || (remoteTime === null && isDailySeries(remote))
  ));
  const remoteTitle = simplifyTitle(remote.title);
  const exactTitle = candidates.filter((event) => simplifyTitle(event.title) === remoteTitle);
  if (exactTitle.length === 1) return { event: exactTitle[0], reason: 'Coincidencia por fecha, hora y título exacto normalizado.' };
  if (exactTitle.length > 1) {
    const located = exactTitle.find((event) => locationMatches(event, remote, occurrence));
    if (located) return { event: located, reason: 'Coincidencia por fecha, hora, título y lugar.' };
  }

  const fuzzyMatch = candidates.find((event) => {
    const titleScore = tokenOverlap(simplifyTitle(event.title), remoteTitle);
    return titleScore >= 0.8 && locationMatches(event, remote, occurrence);
  });
  return fuzzyMatch ? { event: fuzzyMatch, reason: 'Coincidencia por fecha, hora, título parecido y lugar.' } : null;
}

function remoteOccurrenceCandidate(remote, occurrence = null) {
  return {
    date: occurrence?.date || remote.startsAt.slice(0, 10),
    startTime: occurrence && Object.prototype.hasOwnProperty.call(occurrence, 'startTime')
      ? occurrence.startTime
      : isGenericRemoteTime(remote) ? null : timePart(remote.startsAt),
    endTime: occurrence && Object.prototype.hasOwnProperty.call(occurrence, 'endTime')
      ? occurrence.endTime
      : isGenericRemoteTime(remote) ? null : timePart(remote.endsAt),
    title: cleanText(remote.title),
    location: locationFor(remote, occurrence),
    performances: occurrence?.performances || performancesFor(remote.id)
  };
}

function findPossibleLocals(remote, currentEvents, occurrence = null) {
  const date = occurrence?.date || remote.startsAt.slice(0, 10);
  const remoteTime = occurrence && Object.prototype.hasOwnProperty.call(occurrence, 'startTime')
    ? occurrence.startTime
    : isGenericRemoteTime(remote) ? null : timePart(remote.startsAt);
  const candidates = currentEvents.filter((event) => event.date === date && (
    event.startTime === remoteTime
    || (remoteTime === null && isDailySeries(remote))
  ));
  const remoteTitle = simplifyTitle(remote.title);
  return candidates.filter((event) => {
    const titleScore = tokenOverlap(simplifyTitle(event.title), remoteTitle);
    return titleScore >= 0.8 && locationMatches(event, remote, occurrence);
  });
}

function locationMatches(local, remote, occurrence = null) {
  const localLocation = simplifyTitle([local.location, local.zone].filter(Boolean).join(' '));
  const remoteLocation = simplifyTitle(occurrence?.location || [remote.venue, remote.address, remote.location].filter(Boolean).join(' '));
  return tokenOverlap(localLocation, remoteLocation) >= 0.3
    || localLocation.includes(remoteLocation)
    || remoteLocation.includes(localLocation);
}

function tokenOverlap(left, right) {
  const leftTokens = new Set(left.split(' ').filter((token) => token.length > 3));
  const rightTokens = new Set(right.split(' ').filter((token) => token.length > 3));
  if (!leftTokens.size || !rightTokens.size) return 0;
  const matches = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return matches / Math.min(leftTokens.size, rightTokens.size);
}

function simplifyTitle(value = '') {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function locationFor(remote, occurrence = null) {
  if (occurrence?.location) return cleanText(occurrence.location);
  const id = Number(remote.id);
  const overrides = {
    2317: 'Acera de Recoletos',
    2337: 'Orbital Club, Plaza de la Rinconada',
    2310: 'Calle Calixto Fernández de la Torre, esquina con C. Reina',
    2316: 'Calle Cascajares (zona de El Farolito, La Taberna del Farolito y La Cárcava)',
    2215: 'Bar ZVMO, C. Reina, 1',
    2313: 'Plaza de Derecho (Facultad de Derecho, Universidad de Valladolid)',
    2265: 'Bandido Techno Room, Pl. del Pte., 4',
    2218: 'Calle Ebanistería, 2 (Zona Cantarranas)',
    2431: 'Acera de Recoletos',
    2191: 'Fantasy Discc Pub, Calle Espíritu Santo, 9',
    1999: 'Centro Comercial Vallsur, Paseo de Zorrilla, 328',
    1784: 'Sala Sinfónica Jesús López Cobos, Centro Cultural Miguel Delibes',
    1688: 'Casa de Zorrilla, Calle Fray Luis de Granada, 1',
    2159: 'A Tomar Por Culo Club, Paseo de Marcelino Martín “El Catarro”',
    2136: 'La Pera Limonera, Playa de las Moreras',
    2183: 'Feria de Valladolid',
    2194: 'Feria de Valladolid',
    1689: 'Casa de Zorrilla, Calle Fray Luis de Granada, 1',
    1690: 'Casa de Zorrilla, Calle Fray Luis de Granada, 1',
    2181: 'Orbital Club, Plaza de la Rinconada',
    1691: 'Casa de Zorrilla, Calle Fray Luis de Granada, 1',
    2088: 'Sala Porta Caeli',
    1692: 'Casa de Zorrilla, Calle Fray Luis de Granada, 1',
    2480: 'Bizarro Bar Independiente, C. Arribas, 18, 47002 Valladolid'
  };
  return overrides[id] || cleanText([remote.venue, remote.address].filter(Boolean).join(', ') || remote.location);
}

function isConcreteLocation(location) {
  const normalized = simplifyTitle(location);
  return Boolean(normalized) && normalized !== 'valladolid' && normalized !== 'valladolid espana';
}

async function resolveCoordinates(remote, location, currentEvents) {
  const id = Number(remote.id);
  const known = {
    2310: {
      lat: 41.6518356,
      lng: -4.7295367,
      source: 'Google Maps (consulta manual; coordenadas aproximadas de la intersección)',
      query: 'C. Reina & Calle Calixto Fernández de la Torre, 47001 Valladolid, España'
    },
    2316: {
      lat: 41.6521118,
      lng: -4.7241231,
      source: 'Google Maps (consulta manual; centro aproximado de tres locales contiguos)',
      query: 'El Farolito, La Taberna del Farolito y Bar La Cárcava, Valladolid, España'
    },
    2388: {
      lat: 41.6521922,
      lng: -4.7240083,
      source: 'OpenStreetMap Nominatim (Calle de Cascajares; ubicación del Escenario Cascajares)',
      osmType: 'way',
      osmId: 33821228,
      query: 'Calle Cascajares, Valladolid, España',
      accuracy: 1
    },
    2215: {
      lat: 41.6517901,
      lng: -4.7295341,
      source: 'Google Maps (consulta manual; ficha de Zvmo)',
      query: 'Zvmo, C. Reina, 1, 47001 Valladolid, España'
    },
    2313: {
      lat: 41.6519966,
      lng: -4.7215228,
      source: 'Google Maps (consulta manual; referencia aproximada de la Facultad de Derecho)',
      query: 'Facultad de Derecho, Universidad de Valladolid, Pl. de la Univ., s/n, 47002 Valladolid, España'
    },
    2265: {
      lat: 41.6525315,
      lng: -4.7307035,
      source: 'Google Maps (consulta manual; dirección aproximada del local)',
      query: 'Pl. del Pte., 4, 47003 Valladolid, España'
    },
    2218: {
      lat: 41.6530093,
      lng: -4.7251996,
      source: 'Google Maps (consulta manual)',
      query: 'Calle Ebanistería, 2, 47002 Valladolid, España'
    },
    1784: { lat: 41.6441725, lng: -4.7559683, source: 'OpenStreetMap Nominatim' },
    1688: { lat: 41.6563987, lng: -4.7235721, source: 'OpenStreetMap Nominatim' },
    1689: { lat: 41.6563987, lng: -4.7235721, source: 'OpenStreetMap Nominatim' },
    1690: { lat: 41.6563987, lng: -4.7235721, source: 'OpenStreetMap Nominatim' },
    1691: { lat: 41.6563987, lng: -4.7235721, source: 'OpenStreetMap Nominatim' },
    1692: { lat: 41.6563987, lng: -4.7235721, source: 'OpenStreetMap Nominatim' },
    2136: { lat: 41.6573, lng: -4.733252, source: 'Inferidas por proximidad a eventos de Playa de las Moreras' },
    2183: { lat: 41.656398, lng: -4.738248, source: 'Inferidas por proximidad a eventos de Feria de Valladolid' },
    2194: { lat: 41.656398, lng: -4.738248, source: 'Inferidas por proximidad a eventos de Feria de Valladolid' },
    2454: {
      lat: 41.6542815,
      lng: -4.7245378,
      source: 'Google Maps (ficha Faroles Rock coincidente en la dirección publicada)',
      query: 'Los Faroles Bar / Faroles Rock, C. Alonso Berruguete, 4, 47003 Valladolid, España'
    },
    2480: {
      lat: 41.6520776,
      lng: -4.7229442,
      source: 'Restaurant Guru / OpenStreetMap (ficha de Bizarro Bar Independiente en la dirección publicada)',
      query: 'Bizarro Bar Independiente, C. Arribas, 18, 47002 Valladolid, España'
    }
  };
  if (known[id]) return known[id];

  const locationKey = simplifyTitle(location);
  const knownLocation = [
    {
      matches: ['acera de recoletos'],
      coordinates: {
        lat: 41.646342,
        lng: -4.728046,
        source: 'Google Maps (consulta manual; centro aproximado de Acera de Recoletos)',
        query: 'C. Acera de Recoletos, Valladolid, España'
      }
    },
    {
      matches: ['orbital club'],
      coordinates: {
        lat: 41.6531507,
        lng: -4.7289254,
        source: 'OpenStreetMap Nominatim (ficha local de Orbital Club)',
        query: 'Orbital Club, Plaza de la Rinconada, Valladolid, España'
      }
    },
    {
      matches: ['bar san pio', 'san pio x'],
      coordinates: {
        lat: 41.6547129,
        lng: -4.7460191,
        source: 'OpenStreetMap Nominatim',
        osmType: 'node',
        osmId: 11963626786,
        query: 'Bar San Pío X, Valladolid, España',
        accuracy: 1
      }
    },
    {
      matches: ['la blanca', 'esperanto'],
      coordinates: {
        lat: 41.6349783,
        lng: -4.736553,
        source: 'OpenStreetMap Nominatim',
        osmType: 'node',
        osmId: 12426457236,
        query: 'La Blanca, 4, Calle del Esperanto, Valladolid, España',
        accuracy: 1
      }
    },
    {
      matches: ['universidad'],
      coordinates: {
        lat: 41.6528225,
        lng: -4.7223575,
        source: 'OpenStreetMap Nominatim',
        osmType: 'way',
        osmId: 61281999,
        query: 'Plaza de la Universidad, Valladolid, España',
        accuracy: 1
      }
    },
    {
      matches: ['santa cruz'],
      coordinates: {
        lat: 41.6513314,
        lng: -4.7201978,
        source: 'OpenStreetMap Nominatim',
        osmType: 'relation',
        osmId: 10750492,
        query: 'Plaza del Colegio de Santa Cruz, Valladolid, España',
        accuracy: 1
      }
    },
    {
      matches: ['molly malone'],
      coordinates: {
        lat: 41.6524739,
        lng: -4.7317957,
        source: 'OpenStreetMap Nominatim',
        osmType: 'node',
        osmId: 5376469221,
        query: 'Molly Malone, Plaza del Poniente, Valladolid, España',
        accuracy: 1
      }
    },
    {
      matches: ['beluga', 'cantabarnas'],
      coordinates: {
        lat: 41.65312,
        lng: -4.72633,
        source: 'OpenStreetMap (ficha de Beluga, C. Ramón Núñez)',
        osmType: 'node',
        osmId: 9594267126,
        query: 'Beluga, C. Ramón Núñez, 1, 47003 Valladolid, España',
        accuracy: 1
      }
    },
    {
      matches: ['plaza poniente', 'plaza del poniente'],
      coordinates: {
        lat: 41.6531571,
        lng: -4.7312823,
        source: 'OpenStreetMap Nominatim',
        osmType: 'way',
        osmId: 24432961,
        query: 'Plaza del Poniente, Valladolid, España',
        accuracy: 1
      }
    },
    {
      matches: ['pera limonera'],
      coordinates: {
        lat: 41.6571419,
        lng: -4.7329438,
        source: 'OpenStreetMap Nominatim',
        osmType: 'way',
        osmId: 367406151,
        query: 'La Pera Limonera, Valladolid, España',
        accuracy: 1
      }
    },
    {
      matches: ['cotorrazo', 'la cotorra', 'calle caridad 2'],
      coordinates: {
        lat: 41.6515827,
        lng: -4.7303391,
        source: 'Google Maps (consulta manual; La Cotorra, sede del Cotorrazo)',
        query: 'La Cotorra, C. Caridad, 2, 47001 Valladolid, España'
      }
    }
  ].find((candidate) => candidate.matches.some((match) => locationKey.includes(match)));
  if (knownLocation) return { ...knownLocation.coordinates };

  const queryById = {
    2198: 'Calle del Bao, Valladolid, España',
    2203: 'Sala Borja, Valladolid, España',
    2191: 'Calle Espíritu Santo, 9, Valladolid, España',
    1999: 'Centro Comercial Vallsur, Paseo de Zorrilla, 328, Valladolid, España',
    1784: 'Centro Cultural Miguel Delibes, Avenida del Real Valladolid, 2, Valladolid, España',
    1688: 'Casa de Zorrilla, Calle Fray Luis de Granada, 1, Valladolid, España',
    2159: 'Paseo de Marcelino Martín “El Catarro”, Valladolid, España',
    1689: 'Casa de Zorrilla, Calle Fray Luis de Granada, 1, Valladolid, España',
    1690: 'Casa de Zorrilla, Calle Fray Luis de Granada, 1, Valladolid, España',
    2181: 'Plaza de la Rinconada, Valladolid, España',
    1691: 'Casa de Zorrilla, Calle Fray Luis de Granada, 1, Valladolid, España',
    2088: 'Sala Porta Caeli, Valladolid, España',
    1692: 'Casa de Zorrilla, Calle Fray Luis de Granada, 1, Valladolid, España'
  };
  const query = queryById[id] || `${location}, Valladolid, España`;
  const cacheKey = normalizeText(query).toLowerCase();
  if (!cache[cacheKey]) {
    cache[cacheKey] = await searchNominatim(query);
    await wait(1100);
  }
  const result = cache[cacheKey];
  if (result && Number.isFinite(result.lat) && Number.isFinite(result.lng)) {
    return {
      lat: result.lat,
      lng: result.lng,
      source: result.source,
      osmType: result.osmType,
      osmId: result.osmId,
      query,
      accuracy: result.accuracy,
      geocodedAt: new Date().toISOString()
    };
  }

  const venue = normalizeText(remote.venue || '');
  const inferred = venue
    ? currentEvents.find((event) => normalizeText(event.location).includes(venue) && hasCoordinates(event.coordinates))
    : null;
  if (inferred) {
    return {
      ...inferred.coordinates,
      source: `Inferidas por coincidencia de lugar con el evento local ${inferred.id}`,
      query
    };
  }
  throw new Error(`No se pudo geocodificar ${remote.id}: ${query}`);
}

async function searchNominatim(query) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '3');
  url.searchParams.set('addressdetails', '1');
  const response = await fetch(url, {
    headers: { 'User-Agent': userAgent, 'Accept-Language': 'es' }
  });
  if (!response.ok) throw new Error(`Nominatim respondió ${response.status} para ${query}`);
  const results = await response.json();
  if (!Array.isArray(results) || !results.length) return null;
  const best = results.find((result) => normalizeText(result.display_name).toLowerCase().includes('valladolid')) || results[0];
  const accuracy = scoreNominatimResult(best, query);
  return {
    lat: Number(best.lat),
    lng: Number(best.lon),
    source: 'OpenStreetMap Nominatim',
    osmType: best.osm_type,
    osmId: best.osm_id,
    displayName: best.display_name,
    accuracy
  };
}

function typeFor(remoteId, remote = {}) {
  const knownType = {
    2388: 'Música',
    2191: 'Música',
    1999: 'Otros',
    1784: 'Música',
    1688: 'Humor y monólogos',
    2159: 'Música',
    2136: 'Música',
    2183: 'Otros',
    2194: 'Música',
    1689: 'Teatro',
    1690: 'Teatro',
    2181: 'Música',
    1691: 'Música',
    2088: 'Música',
    1692: 'Música'
  }[Number(remoteId)];
  if (knownType) return knownType;
  const category = simplifyTitle(remote.categoryLabel || remote.category || '');
  if (category.includes('musica')) return 'Música';
  if (category.includes('teatro')) return 'Teatro';
  if (category.includes('danza')) return 'Danza';
  if (category.includes('infantil') || category.includes('familia')) return 'Infantil y familiar';
  if (category.includes('humor') || category.includes('monologo')) return 'Humor y monólogos';
  if (category.includes('deporte')) return 'Deporte';
  if (category.includes('gastronomia')) return 'Gastronomía';
  if (category.includes('exposicion')) return 'Exposición';
  if (category.includes('relig')) return 'Religioso';
  if (category.includes('toros')) return 'Toros';
  return 'Otros';
}

function zoneFor(remoteId, location = '') {
  const knownZone = {
    2191: 'Zona Centro',
    1999: 'Zona Sur',
    1784: 'Zona Sur',
    1688: 'Zona Centro',
    2159: 'Moreras',
    2136: 'Moreras',
    2183: 'Auditorio Feria',
    2194: 'Auditorio Feria',
    1689: 'Zona Centro',
    1690: 'Zona Centro',
    2181: 'Zona Centro',
    1691: 'Zona Centro',
    2088: 'Zona Centro',
    1692: 'Zona Centro'
  }[Number(remoteId)];
  if (knownZone) return knownZone;
  const normalized = simplifyTitle(location);
  if (normalized.includes('moreras')) return 'Moreras';
  if (normalized.includes('feria de valladolid') || normalized.includes('auditorio feria') || normalized.includes('pabellon feria')) return 'Auditorio Feria';
  if (normalized.includes('vallsur') || normalized.includes('covaresa')) return 'Zona Sur';
  return 'Zona Centro';
}

function performancesFor(remoteId) {
  return {
    2191: ['Araima Amezquita', 'Milagros Valbuena', 'Pacho El Hombre de las Mil Voces', 'Dr. Isaac'],
    1784: ['Orquesta Sinfónica de Castilla y León', 'Jorge Yagüe'],
    1688: ['Asociación Cultural Rodinia'],
    1689: ['Amigos del Teatro'],
    1690: ['Pino Cardiel'],
    1691: ['Raúl Rulo'],
    1692: ['CaracolaDos']
  }[Number(remoteId)] || [];
}

function ticketFor(remote) {
  if (remote.isFree === true || /entrada libre|entrada gratuita|gratuita/i.test(remote.summary || '')) {
    return {
      required: false,
      status: 'not_required',
      label: 'Entrada libre',
      url: null,
      note: 'La fuente remota indica que la entrada es libre o gratuita.'
    };
  }
  return {
    required: false,
    status: 'unknown',
    label: 'Entrada no indicada',
    url: null,
    note: 'La fuente remota no indica venta de entradas para este evento.'
  };
}

function isInDateWindow(value) {
  const date = String(value || '').slice(0, 10);
  return date >= '2026-09-04' && date <= '2026-09-13';
}

function isValladolid(event) {
  const haystack = normalizeText([event.location, event.venue, event.address, event.summary].filter(Boolean).join(' ')).toLowerCase();
  if (/laguna de duero|simancas|arroyo de la encomienda|tordesillas/.test(haystack)) return false;
  return true;
}

function timePart(value) {
  const match = String(value || '').match(/T(\d{2}:\d{2})/);
  return match ? match[1] : null;
}

function isGenericRemoteTime(remote) {
  const startsDate = String(remote.startsAt || '').slice(0, 10);
  const endsDate = String(remote.endsAt || '').slice(0, 10);
  return timePart(remote.startsAt) === '00:00'
    && (['00:00', '01:00', null].includes(timePart(remote.endsAt)) || startsDate !== endsDate);
}

function dateLabel(date) {
  const labels = {
    '2026-09-04': 'Viernes 4 de septiembre',
    '2026-09-05': 'Sábado 5 de septiembre',
    '2026-09-06': 'Domingo 6 de septiembre',
    '2026-09-07': 'Lunes 7 de septiembre',
    '2026-09-08': 'Martes 8 de septiembre',
    '2026-09-09': 'Miércoles 9 de septiembre',
    '2026-09-10': 'Jueves 10 de septiembre',
    '2026-09-11': 'Viernes 11 de septiembre',
    '2026-09-12': 'Sábado 12 de septiembre',
    '2026-09-13': 'Domingo 13 de septiembre'
  };
  return labels[date] || date;
}

function containsText(haystack, needle) {
  return normalizeText(haystack).toLowerCase().includes(normalizeText(needle).toLowerCase());
}

function normalizeText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanText(value = '') {
  return String(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasCoordinates(coordinates) {
  return coordinates && Number.isFinite(coordinates.lat) && Number.isFinite(coordinates.lng);
}

function scoreNominatimResult(result, query) {
  const haystack = normalizeText([result.display_name, result.name, result.type, result.class].filter(Boolean).join(' ')).toLowerCase();
  const words = normalizeText(query).toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3);
  if (!words.length) return 0;
  const matches = words.filter((word) => haystack.includes(word)).length;
  const base = matches / words.length;
  const inValladolid = haystack.includes('valladolid') ? 0.2 : 0;
  return Math.min(1, Number((base + inValladolid).toFixed(2)));
}

function parseArgs(values) {
  const prepare = values.includes('--prepare');
  const apply = values.includes('--apply');
  const applyPlanIndex = values.indexOf('--apply-plan');
  const applyPlan = applyPlanIndex >= 0 ? values[applyPlanIndex + 1] : null;
  if (prepare && apply || apply && applyPlan || prepare && applyPlan || (applyPlanIndex >= 0 && !applyPlan)) {
    throw new Error('Usa exactamente uno de --prepare, --apply o --apply-plan <ruta>.');
  }
  return { apply, prepare, applyPlan };
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { 'User-Agent': userAgent } });
  if (!response.ok) throw new Error(`La fuente remota respondió ${response.status}: ${url}`);
  return response.json();
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

function hashJson(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function gitHead() {
  try {
    const result = await execFile('git', ['rev-parse', 'HEAD'], { cwd: root });
    return result.stdout.trim();
  } catch (_) {
    return null;
  }
}

async function acquireImportLock() {
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  try {
    await fs.mkdir(lockPath);
    await fs.writeFile(path.join(lockPath, 'owner.json'), `${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }, null, 2)}\n`);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    try {
      const stats = await fs.stat(lockPath);
      if (Date.now() - stats.mtimeMs > 2 * 60 * 60 * 1000) {
        await fs.rm(lockPath, { recursive: true, force: true });
        await fs.mkdir(lockPath);
        await fs.writeFile(path.join(lockPath, 'owner.json'), `${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString(), recovered: true }, null, 2)}\n`);
        return;
      }
    } catch (_) {
      // Another process may have removed the lock while it was inspected.
    }
    throw new Error('Ya hay una importación de eventos en ejecución; no se aplica este lote.');
  }
}

function registerKnownMatches(matches, sourceEvents, localById, registry) {
  for (const [remoteIdText, localIds] of Object.entries(matches)) {
    const remoteId = Number(remoteIdText);
    const remote = sourceEvents.get(remoteId);
    if (!remote) continue;
    for (const localId of localIds) {
      const local = localById.get(Number(localId));
      if (!local) continue;
      const occurrence = {
        date: local.date,
        startTime: local.startTime,
        endTime: local.endTime,
        location: local.location
      };
      const key = occurrenceRegistryKey(remote, occurrence);
      const current = getRegisteredOccurrence(registry, remoteId, key);
      if (current) continue;
      registerOccurrence(registry, remoteId, key, {
        status: 'linked',
        localEventId: local.id,
        reason: 'Relación histórica conservada por el importador.'
      });
    }
  }
}

async function applyPreparedPlan(planPathValue) {
  const planPath = path.resolve(root, String(planPathValue || ''));
  const plan = JSON.parse(await fs.readFile(planPath, 'utf8'));
  if (plan.schemaVersion !== 1 || !plan.initialHashes || !plan.result?.events || !plan.result?.registry) {
    throw new Error('El plan de importación no tiene un formato válido.');
  }
  if ((Array.isArray(plan.report?.unresolved) && plan.report.unresolved.length)
    || (Array.isArray(plan.report?.conflicts) && plan.report.conflicts.length)) {
    throw new Error(`El plan contiene ${plan.report.unresolved?.length || 0} pendientes y ${plan.report.conflicts?.length || 0} conflictos; revísalos antes de aplicar.`);
  }

  const currentEvents = JSON.parse(await fs.readFile(eventsPath, 'utf8'));
  const currentVerifiedOccurrences = await readJson(verifiedOccurrencesPath, {});
  const currentRegistry = normalizeImportRegistry(await readJson(importRegistryPath, emptyImportRegistry()));
  const currentHashes = {
    gitHead: await gitHead(),
    events: hashJson(currentEvents),
    verifiedOccurrences: hashJson(currentVerifiedOccurrences),
    registry: hashJson(currentRegistry)
  };
  for (const key of Object.keys(plan.initialHashes)) {
    if (currentHashes[key] !== plan.initialHashes[key]) {
      throw new Error(`El estado cambió desde --prepare (${key}); vuelve a preparar la importación.`);
    }
  }

  const snapshotPath = path.resolve(root, plan.sourceSnapshotPath || '');
  const snapshot = JSON.parse(await fs.readFile(snapshotPath, 'utf8'));
  if (hashJson(snapshot) !== plan.sourceSnapshotSha256) {
    throw new Error('La instantánea remota del plan está dañada o no coincide.');
  }

  const resultEvents = Array.isArray(plan.result.events) ? plan.result.events : [];
  const resultRegistry = normalizeImportRegistry(plan.result.registry);
  assertRegistryIntegrity(resultRegistry, resultEvents);
  await writeAtomic(eventsPath, `${JSON.stringify(resultEvents, null, 2)}\n`);
  await writeAtomic(importRegistryPath, `${JSON.stringify(resultRegistry, null, 2)}\n`);
  await fs.mkdir(reportsDir, { recursive: true });
  const report = {
    ...(plan.report || {}),
    mode: 'apply-plan',
    appliedAt: new Date().toISOString(),
    sourceSnapshotPath: path.relative(root, snapshotPath)
  };
  const reportPath = path.join(reportsDir, `eventos-ferias-import-${stamp()}-apply-plan.json`);
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    reportPath: path.relative(root, reportPath),
    mode: 'apply-plan',
    totals: report.totals || {}
  }, null, 2));
}

async function writeAtomic(filePath, content) {
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  try {
    await fs.writeFile(temporaryPath, content);
    await fs.rename(temporaryPath, filePath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true });
    throw error;
  }
}
