const DEFAULT_SOURCE_BASE_URL = 'https://eventos.aldeapucela.org';

export function attachEventSourcePages(events, registry, canonicalTargets = {}, sourceBaseUrl = DEFAULT_SOURCE_BASE_URL) {
  const localIds = new Set(events.map((event) => String(event.id)));
  const sourceTargetsByLocalId = new Map();

  for (const [remoteId, remoteEvent] of Object.entries(registry?.remoteEvents || {})) {
    const urlPath = validRemoteEventPath(remoteId, remoteEvent?.urlPath);
    const normalizedRemoteId = String(Number(remoteId));

    for (const occurrence of Object.values(remoteEvent.occurrences || {})) {
      if (occurrence?.status !== 'linked') continue;
      const localEventId = String(occurrence.localEventId || '');
      if (!localIds.has(localEventId)) continue;
      if (!sourceTargetsByLocalId.has(localEventId)) sourceTargetsByLocalId.set(localEventId, new Map());
      sourceTargetsByLocalId.get(localEventId).set(normalizedRemoteId, urlPath);
    }
  }

  const normalizedCanonicalTargets = new Map(
    Object.entries(canonicalTargets || {}).map(([localId, remoteId]) => [String(localId), String(Number(remoteId))])
  );
  for (const [localEventId, remoteId] of normalizedCanonicalTargets) {
    const targets = sourceTargetsByLocalId.get(localEventId);
    if (!localIds.has(localEventId) || targets?.size !== 1 || !targets.get(remoteId)) {
      throw new Error(`Canonical SEO inválido para la ficha local ${localEventId} y la ficha remota ${remoteId}.`);
    }
  }

  const baseUrl = String(sourceBaseUrl || DEFAULT_SOURCE_BASE_URL).replace(/\/+$/, '');
  return events.map((event) => {
    const localEventId = String(event.id);
    const targets = sourceTargetsByLocalId.get(localEventId);
    if (targets?.size !== 1) return event;

    const [[remoteId, urlPath]] = targets.entries();
    if (!urlPath) return event;
    const sourceEventUrl = baseUrl + urlPath;
    return {
      ...event,
      sourceEventUrl,
      ...(normalizedCanonicalTargets.get(localEventId) === remoteId
        ? { seoCanonicalUrl: sourceEventUrl }
        : {})
    };
  });
}

function validRemoteEventPath(remoteId, value) {
  const urlPath = String(value || '').trim();
  const match = /^\/e\/(\d+)\/[a-z0-9-]+\/$/.exec(urlPath);
  return match && String(Number(match[1])) === String(Number(remoteId)) ? urlPath : null;
}
