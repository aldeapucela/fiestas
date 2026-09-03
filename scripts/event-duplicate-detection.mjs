const GENERIC_TITLE_TOKENS = new Set([
  'actividad',
  'actividades',
  'actuacion',
  'actuaciones',
  'ciclo',
  'concierto',
  'conciertos',
  'evento',
  'eventos',
  'feria',
  'ferias',
  'fiesta',
  'fiestas',
  'programacion',
  'sesion',
  'sesiones',
  'virgen',
  'san',
  'lorenzo',
  '2026'
]);

export function findLikelyDuplicateEvent(candidate, currentEvents = []) {
  const normalizedCandidate = normalizeEventCandidate(candidate);
  const candidates = currentEvents
    .filter((event) => sameDate(event, normalizedCandidate))
    .filter((event) => compatibleTime(event, normalizedCandidate))
    .map((event) => scoreDuplicate(normalizeEventCandidate(event), normalizedCandidate, event))
    .filter((match) => match.score >= 0.82)
    .sort((left, right) => right.score - left.score || Number(left.event.id) - Number(right.event.id));

  return candidates[0] || null;
}

export function findPotentialDuplicatePairs(events = []) {
  const pairs = [];
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const duplicate = findLikelyDuplicateEvent(event, events.slice(index + 1));
    if (duplicate) {
      pairs.push({
        left: event,
        right: duplicate.event,
        score: duplicate.score,
        reason: duplicate.reason
      });
    }
  }
  return pairs;
}

export function eventFingerprint(event = {}) {
  const normalized = normalizeEventCandidate(event);
  return [
    normalized.date,
    normalized.startTime,
    normalized.title,
    normalized.location
  ].join('|');
}

function scoreDuplicate(local, candidate, originalEvent) {
  const exactFingerprint = local.date === candidate.date
    && local.startTime === candidate.startTime
    && local.title === candidate.title
    && local.location === candidate.location;
  if (exactFingerprint) {
    return { event: originalEvent, score: 1, reason: 'Misma fecha, hora, título y lugar normalizados.' };
  }

  const locationScore = overlap(local.locationTokens, candidate.locationTokens);
  if (locationScore < 0.45 && !containsTokenSet(local.locationTokens, candidate.locationTokens) && !containsTokenSet(candidate.locationTokens, local.locationTokens)) {
    return { event: originalEvent, score: 0, reason: 'Lugar distinto.' };
  }

  const performanceScore = overlap(local.performanceTokens, candidate.performanceTokens);
  if (performanceScore >= 0.8) {
    return {
      event: originalEvent,
      score: Number((0.9 + Math.min(locationScore, 1) * 0.1).toFixed(3)),
      reason: 'Misma fecha, hora compatible, lugar equivalente y actuaciones coincidentes.'
    };
  }

  const titleScore = overlap(local.titleCoreTokens, candidate.titleCoreTokens);
  if (titleScore >= 0.8
    && local.startTime === candidate.startTime
    && local.titleCoreTokens.length > 1
    && candidate.titleCoreTokens.length > 1) {
    return {
      event: originalEvent,
      score: Number((0.82 + Math.min(locationScore, 1) * 0.1).toFixed(3)),
      reason: 'Misma fecha, hora compatible, lugar equivalente y título coincidente.'
    };
  }

  return { event: originalEvent, score: 0, reason: 'Sin coincidencia suficiente.' };
}

function normalizeEventCandidate(event = {}) {
  const title = simplify(event.title);
  const performances = Array.isArray(event.performances) ? event.performances : [];
  return {
    date: String(event.date || '').slice(0, 10),
    startTime: normalizeTime(event.startTime),
    endTime: normalizeTime(event.endTime),
    title,
    location: simplify(event.location),
    titleCoreTokens: significantTokens(title).filter((token) => !GENERIC_TITLE_TOKENS.has(token)),
    locationTokens: significantTokens(event.location),
    performanceTokens: significantTokens(performances.join(' '))
  };
}

function sameDate(event, normalizedCandidate) {
  return String(event.date || '').slice(0, 10) === normalizedCandidate.date;
}

function compatibleTime(event, candidate) {
  const eventStart = normalizeTime(event.startTime);
  const eventEnd = normalizeTime(event.endTime);
  if (eventStart === candidate.startTime) return true;
  if (!eventStart || !candidate.startTime) return false;
  return timeRangesOverlap(eventStart, eventEnd, candidate.startTime, candidate.endTime);
}

function timeRangesOverlap(leftStart, leftEnd, rightStart, rightEnd) {
  const leftStartMinutes = minutes(leftStart);
  const rightStartMinutes = minutes(rightStart);
  if (!Number.isFinite(leftStartMinutes) || !Number.isFinite(rightStartMinutes)) return false;
  const leftEndMinutes = Number.isFinite(minutes(leftEnd)) ? minutes(leftEnd) : leftStartMinutes;
  const rightEndMinutes = Number.isFinite(minutes(rightEnd)) ? minutes(rightEnd) : rightStartMinutes;
  return Math.max(leftStartMinutes, rightStartMinutes) <= Math.min(leftEndMinutes, rightEndMinutes) + 30;
}

function minutes(value) {
  const match = String(value || '').match(/^(\d{2}):(\d{2})$/);
  if (!match) return NaN;
  return Number(match[1]) * 60 + Number(match[2]);
}

function normalizeTime(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function overlap(leftTokens, rightTokens) {
  if (!leftTokens.length || !rightTokens.length) return 0;
  const left = new Set(leftTokens);
  const right = new Set(rightTokens);
  const matches = [...left].filter((token) => right.has(token)).length;
  return matches / Math.min(left.size, right.size);
}

function containsTokenSet(leftTokens, rightTokens) {
  if (!leftTokens.length || !rightTokens.length) return false;
  const left = new Set(leftTokens);
  return rightTokens.every((token) => left.has(token));
}

function significantTokens(value = '') {
  return simplify(value)
    .split(' ')
    .filter((token) => token.length > 2);
}

function simplify(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[“”"'`´]/g, '')
    .replace(/&/g, ' y ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
