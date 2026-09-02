import { isDailySeries } from './import-eventos-ferias-dates.mjs';

export const EVENT_IMPORT_REGISTRY_VERSION = 1;
export const PENDING_REVIEW_STATUS = 'pending_review';

export function emptyImportRegistry() {
  return {
    schemaVersion: EVENT_IMPORT_REGISTRY_VERSION,
    source: 'eventos.aldeapucela.org',
    remoteEvents: {},
    localAliases: {}
  };
}

export function normalizeImportRegistry(value) {
  const registry = emptyImportRegistry();
  if (!value || typeof value !== 'object') return registry;

  const remoteEvents = value.remoteEvents && typeof value.remoteEvents === 'object'
    ? value.remoteEvents
    : {};
  for (const [remoteId, remoteValue] of Object.entries(remoteEvents)) {
    if (!/^\d+$/.test(String(remoteId)) || !remoteValue || typeof remoteValue !== 'object') continue;
    const occurrences = remoteValue.occurrences && typeof remoteValue.occurrences === 'object'
      ? remoteValue.occurrences
      : {};
    registry.remoteEvents[String(Number(remoteId))] = { occurrences: {} };
    for (const [key, occurrenceValue] of Object.entries(occurrences)) {
      const occurrence = normalizeRegistryOccurrence(occurrenceValue);
      if (occurrence) registry.remoteEvents[String(Number(remoteId))].occurrences[key] = occurrence;
    }
  }

  const localAliases = value.localAliases && typeof value.localAliases === 'object'
    ? value.localAliases
    : {};
  for (const [localId, aliasValue] of Object.entries(localAliases)) {
    if (!/^\d+$/.test(String(localId)) || !aliasValue || typeof aliasValue !== 'object') continue;
    const targetEventId = aliasValue.targetEventId == null
      ? null
      : String(aliasValue.targetEventId).trim();
    if (targetEventId !== null && !/^\d+$/.test(targetEventId)) continue;
    registry.localAliases[String(Number(localId))] = {
      targetEventId,
      reason: String(aliasValue.reason || '').trim() || 'Alias de evento histórico',
      oldSlugs: Array.isArray(aliasValue.oldSlugs)
        ? [...new Set(aliasValue.oldSlugs.map((slug) => String(slug).trim()).filter(Boolean))]
        : []
    };
  }
  return registry;
}

function normalizeRegistryOccurrence(value) {
  if (!value || typeof value !== 'object') return null;
  const status = String(value.status || '').trim();
  if (!['linked', 'ignored', PENDING_REVIEW_STATUS].includes(status)) return null;
  if (status === 'linked' && !/^\d+$/.test(String(value.localEventId || ''))) return null;
  return {
    status,
    ...(status === 'linked' ? { localEventId: String(Number(value.localEventId)) } : {}),
    reason: String(value.reason || '').trim() || undefined
  };
}

export function occurrenceRegistryKey(remote, occurrence, index = 0) {
  const explicitKey = String(occurrence?.key || '').trim();
  if (explicitKey) return explicitKey;
  if (!isDailySeries(remote)) return 'single';
  const date = String(occurrence?.date || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return `day-${date}`;
  return `occ-${String(index + 1).padStart(3, '0')}`;
}

export function remoteOccurrenceRegistryKey(remoteId, occurrenceKey) {
  return `${Number(remoteId)}:${String(occurrenceKey || '').trim()}`;
}

export function getRegisteredOccurrence(registry, remoteId, occurrenceKey) {
  return registry?.remoteEvents?.[String(Number(remoteId))]?.occurrences?.[occurrenceKey] || null;
}

export function registerOccurrence(registry, remoteId, occurrenceKey, value) {
  const normalized = normalizeRegistryOccurrence(value);
  if (!normalized) throw new Error(`Registro de ocurrencia inválido: ${remoteId}:${occurrenceKey}`);
  const id = String(Number(remoteId));
  if (!registry.remoteEvents[id]) registry.remoteEvents[id] = { occurrences: {} };
  registry.remoteEvents[id].occurrences[String(occurrenceKey)] = normalized;
  return normalized;
}

export function resolveLocalEventId(localId, aliases = {}) {
  let current = String(localId || '').trim();
  const visited = new Set();
  while (current && aliases[current]?.targetEventId !== null && aliases[current]?.targetEventId !== undefined) {
    if (visited.has(current)) throw new Error(`Ciclo de aliases de eventos en ${current}`);
    visited.add(current);
    current = String(aliases[current].targetEventId);
  }
  return current || null;
}

export function aliasMapFromRegistry(registry) {
  return Object.fromEntries(Object.entries(registry?.localAliases || {}).map(([id, value]) => [id, value?.targetEventId ?? null]));
}

export function assertRegistryIntegrity(registry, events) {
  const localIds = new Set((Array.isArray(events) ? events : []).map((event) => String(event.id)));
  for (const [remoteId, remoteValue] of Object.entries(registry.remoteEvents || {})) {
    for (const [occurrenceKey, occurrence] of Object.entries(remoteValue.occurrences || {})) {
      if (occurrence.status === 'linked' && !localIds.has(String(occurrence.localEventId))) {
        throw new Error(`El registro ${remoteId}:${occurrenceKey} apunta al evento local inexistente ${occurrence.localEventId}.`);
      }
    }
  }
  for (const [localId, alias] of Object.entries(registry.localAliases || {})) {
    if (alias.targetEventId !== null && !localIds.has(String(alias.targetEventId))) {
      throw new Error(`El alias local ${localId} apunta al evento inexistente ${alias.targetEventId}.`);
    }
    resolveLocalEventId(localId, registry.localAliases);
  }
  return true;
}
