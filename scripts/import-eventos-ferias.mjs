import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const eventsPath = path.join(root, 'src', 'data', 'fiestas-2026', 'events.json');
const cachePath = path.join(root, '.cache', 'fiestas', 'nominatim-location-cache.json');
const reportsDir = path.join(root, '.cache', 'fiestas', 'reports');
const sourceUrl = 'https://eventos.aldeapucela.org/site-data.json';
const userAgent = 'AldeaPucelaFiestas/1.0 (contacto@aldeapucela.org)';
const args = parseArgs(process.argv.slice(2));

const events = JSON.parse(await fs.readFile(eventsPath, 'utf8'));
const source = await fetchJson(sourceUrl);
const sourceEvents = new Map(source.events.map((event) => [Number(event.id), event]));
const cache = await readJson(cachePath, {});
const report = {
  mode: args.apply ? 'apply' : 'dry-run',
  sourceUrl,
  generatedAt: new Date().toISOString(),
  dateWindow: ['2026-09-04', '2026-09-13'],
  totals: { sourceInWindow: 0, sourceOutsideValladolid: 0, sourceUnavailable: 0, enriched: 0, imagesAdded: 0, added: 0, skipped: 0, unresolved: 0 },
  excluded: [{ id: 2148, reason: 'Ubicación ambigua en Las Moreras; no se fuerza el cruce.' }],
  sourceUnavailable: [],
  enriched: [],
  imagesAdded: [],
  added: [],
  skipped: [],
  unresolved: []
};

const windowEvents = source.events.filter((event) => isInDateWindow(event.startsAt));
report.totals.sourceInWindow = windowEvents.length;
report.totals.sourceOutsideValladolid = windowEvents.filter((event) => !isValladolid(event)).length;

const localById = new Map(events.map((event) => [event.id, event]));
const matchedRemoteToLocal = buildMatchedRemoteToLocal(events);
const imageRemoteToLocal = {
  2162: [5],
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
  1980: [403]
};

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

const excludedRemoteIds = new Set([2148]);
const duplicateRemoteToLocal = new Map([[1999, 474]]);
const knownMatchedRemoteIds = new Set(Object.keys(matchedRemoteToLocal).map(Number));
const candidateEvents = windowEvents.filter((remote) => {
  const remoteId = Number(remote.id);
  return isValladolid(remote)
    && !knownMatchedRemoteIds.has(remoteId)
    && !duplicateRemoteToLocal.has(remoteId)
    && !excludedRemoteIds.has(remoteId);
});
let nextId = Math.max(...events.map((event) => Number(event.id))) + 1;
for (const [remoteId, localId] of duplicateRemoteToLocal) {
  const remote = sourceEvents.get(remoteId);
  if (!remote || !isInDateWindow(remote.startsAt)) continue;
  report.totals.skipped += 1;
  report.skipped.push({
    remoteId,
    localId,
    date: remote.startsAt.slice(0, 10),
    reason: 'Registro remoto duplicado de un evento ya importado con horario actualizado.'
  });
}
for (const remote of candidateEvents) {
  const remoteId = Number(remote.id);
  const occurrenceDates = occurrenceDatesFor(remote);
  const pendingDates = [];
  for (const date of occurrenceDates) {
    const existing = findExistingLocal(remote, events, date);
    if (!existing) {
      pendingDates.push(date);
      continue;
    }
    const changed = enrichExistingEvent(existing, remote);
    if (changed) {
      report.totals.enriched += 1;
      report.enriched.push({ localId: existing.id, remoteId, date, title: existing.title });
    }
    addImageIfMissing(existing, remote, report);
    report.totals.skipped += 1;
    report.skipped.push({ remoteId, localId: existing.id, date, reason: 'Coincidencia por fecha, hora, título y lugar.' });
  }
  if (!pendingDates.length) continue;

  const location = locationFor(remote);
  if (!isConcreteLocation(location)) {
    report.totals.unresolved += 1;
    report.unresolved.push({ remoteId, title: remote.title, reason: 'La fuente no proporciona un lugar concreto.', location });
    continue;
  }

  let coordinates;
  try {
    coordinates = await resolveCoordinates(remote, location, events);
  } catch (error) {
    report.totals.unresolved += 1;
    report.unresolved.push({ remoteId, title: remote.title, reason: error.message, location });
    continue;
  }

  for (const date of pendingDates) {
    if (localById.has(nextId)) {
      throw new Error(`El ID nuevo ${nextId} ya está ocupado.`);
    }
    const local = await createLocalEvent(remote, nextId, events, date, coordinates);
    nextId += 1;
    events.push(local);
    localById.set(local.id, local);
    report.totals.added += 1;
    report.added.push({ localId: local.id, remoteId, date, title: local.title });
  }
}

if (args.apply) {
  await fs.writeFile(eventsPath, `${JSON.stringify(events, null, 2)}\n`);
}

await fs.mkdir(path.dirname(cachePath), { recursive: true });
await fs.writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`);
await fs.mkdir(reportsDir, { recursive: true });
const reportPath = path.join(reportsDir, `eventos-ferias-import-${stamp()}.json`);
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({
  reportPath: path.relative(root, reportPath),
  mode: report.mode,
  totals: report.totals
}, null, 2));

async function createLocalEvent(remote, id, currentEvents, dateOverride = null, coordinatesOverride = null) {
  const date = dateOverride || remote.startsAt.slice(0, 10);
  const location = locationFor(remote);
  const coordinates = coordinatesOverride || await resolveCoordinates(remote, location, currentEvents);
  const type = typeFor(remote.id, remote);
  const summary = cleanText(remote.summary || remote.title);
  const genericTime = isGenericRemoteTime(remote);
  const isMultiDay = isDailySeries(remote);
  const isOvernight = !genericTime && !isMultiDay && remote.startsAt.slice(0, 10) !== remote.endsAt.slice(0, 10);
  const sourceStartTime = genericTime ? null : timePart(remote.startsAt);
  const sourceEndTime = genericTime || isOvernight || isStartOnlySeries(remote)
    ? null
    : timePart(remote.endsAt);
  const performances = performancesFor(remote.id);
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

function occurrenceDatesFor(remote) {
  const startDate = String(remote.startsAt || '').slice(0, 10);
  if (!isDailySeries(remote)) return [startDate];
  const endDate = String(remote.endsAt || '').slice(0, 10);
  const lastDate = endDate > '2026-09-13' ? '2026-09-13' : endDate;
  const cursor = new Date(`${startDate}T00:00:00Z`);
  const last = new Date(`${lastDate}T00:00:00Z`);
  const dates = [];
  while (cursor <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function isDailySeries(remote) {
  const startDate = String(remote.startsAt || '').slice(0, 10);
  const endDate = String(remote.endsAt || '').slice(0, 10);
  if (!startDate || startDate === endDate) return false;
  const duration = Date.parse(remote.endsAt) - Date.parse(remote.startsAt);
  return !Number.isFinite(duration) || duration >= 24 * 60 * 60 * 1000;
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
    1980: [403],
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

function findExistingLocal(remote, currentEvents, dateOverride = null) {
  const date = dateOverride || remote.startsAt.slice(0, 10);
  const remoteTime = isGenericRemoteTime(remote) ? null : timePart(remote.startsAt);
  const candidates = currentEvents.filter((event) => event.date === date && (
    event.startTime === remoteTime
    || (remoteTime === null && isDailySeries(remote))
  ));
  const remoteTitle = simplifyTitle(remote.title);
  const exactTitle = candidates.filter((event) => simplifyTitle(event.title) === remoteTitle);
  if (exactTitle.length === 1) return exactTitle[0];
  if (exactTitle.length > 1) {
    const located = exactTitle.find((event) => locationMatches(event, remote));
    if (located) return located;
  }

  return candidates.find((event) => {
    const titleScore = tokenOverlap(simplifyTitle(event.title), remoteTitle);
    return titleScore >= 0.8 && locationMatches(event, remote);
  }) || null;
}

function locationMatches(local, remote) {
  const localLocation = simplifyTitle([local.location, local.zone].filter(Boolean).join(' '));
  const remoteLocation = simplifyTitle([remote.venue, remote.address, remote.location].filter(Boolean).join(' '));
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

function locationFor(remote) {
  const id = Number(remote.id);
  const overrides = {
    2218: 'Calle Ebanistería, 2 (Zona Cantarranas)',
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
    1692: 'Casa de Zorrilla, Calle Fray Luis de Granada, 1'
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
    2194: { lat: 41.656398, lng: -4.738248, source: 'Inferidas por proximidad a eventos de Feria de Valladolid' }
  };
  if (known[id]) return known[id];

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
  return { apply: values.includes('--apply') };
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
