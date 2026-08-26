export const VISIT_STATS_STORAGE_KEY = 'fiestasPucela:visit-tracker';
export const VISIT_STATS_SCHEMA_VERSION = 1;

const EMPTY_VISIT_STATS = Object.freeze({
  schemaVersion: VISIT_STATS_SCHEMA_VERSION,
  visitedDays: 0,
  lastVisitDate: ''
});

export function readVisitStats() {
  return normalizeVisitStats(readJson(VISIT_STATS_STORAGE_KEY, null)) || { ...EMPTY_VISIT_STATS };
}

export function recordVisit(now = new Date()) {
  const today = localDateKey(now);
  const current = readVisitStats();

  if (current.lastVisitDate === today) return current;

  const next = {
    schemaVersion: VISIT_STATS_SCHEMA_VERSION,
    visitedDays: current.visitedDays + 1,
    lastVisitDate: today
  };
  writeJson(VISIT_STATS_STORAGE_KEY, next);
  return next;
}

export function getVisitedDays() {
  return readVisitStats().visitedDays;
}

function normalizeVisitStats(value) {
  if (!value || typeof value !== 'object' || value.schemaVersion !== VISIT_STATS_SCHEMA_VERSION) return null;

  const visitedDays = Number(value.visitedDays);
  const lastVisitDate = String(value.lastVisitDate || '').trim();
  if (!Number.isInteger(visitedDays) || visitedDays < 0 || !isLocalDateKey(lastVisitDate)) return null;

  return {
    schemaVersion: VISIT_STATS_SCHEMA_VERSION,
    visitedDays,
    lastVisitDate
  };
}

function localDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const year = safeDate.getFullYear();
  const month = String(safeDate.getMonth() + 1).padStart(2, '0');
  const day = String(safeDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isLocalDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function readJson(key, fallback) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return fallback;
    return JSON.parse(window.localStorage.getItem(key) || 'null');
  } catch (_) {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (_) {
    // A blocked or full localStorage must not prevent the app from working.
  }
}

if (typeof window !== 'undefined') recordVisit();
