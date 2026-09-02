import { eventFingerprint } from './event-duplicate-detection.mjs';

export function buildImportGuard(decisions = {}) {
  const blockedRemoteIds = new Map(
    Object.entries(decisions.blockedRemoteIds || {})
      .map(([remoteId, decision]) => [Number(remoteId), normalizeDecision(decision)])
  );
  const duplicateRemoteToLocal = new Map(
    Object.entries(decisions.duplicateRemoteToLocal || {})
      .map(([remoteId, decision]) => [Number(remoteId), normalizeDuplicateDecision(decision)])
  );
  const blockedEventFingerprints = new Map(
    (decisions.blockedEventFingerprints || [])
      .map((decision) => [eventFingerprint(decision), normalizeDecision(decision)])
  );

  return {
    blockedRemoteEntries() {
      return [...blockedRemoteIds.entries()].map(([id, decision]) => ({ id, ...decision }));
    },
    duplicateRemoteEntries() {
      return [...duplicateRemoteToLocal.entries()].map(([remoteId, decision]) => ({ remoteId, ...decision }));
    },
    getBlockedRemote(remoteId) {
      return blockedRemoteIds.get(Number(remoteId)) || null;
    },
    getDuplicateLocal(remoteId) {
      return duplicateRemoteToLocal.get(Number(remoteId)) || null;
    },
    getBlockedEvent(event) {
      return blockedEventFingerprints.get(eventFingerprint(event)) || null;
    }
  };
}

function normalizeDecision(decision) {
  if (typeof decision === 'string') return { reason: decision };
  return { ...decision };
}

function normalizeDuplicateDecision(decision) {
  if (typeof decision === 'number') return { localId: decision, reason: 'Evento remoto marcado como duplicado.' };
  return { ...decision };
}
