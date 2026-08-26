import assert from 'node:assert/strict';
import test from 'node:test';

const STORAGE_KEY = 'fiestasPucela:visit-tracker';

function installStorage(initialValue = null) {
  const values = new Map();
  if (initialValue !== null) values.set(STORAGE_KEY, JSON.stringify(initialValue));

  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value)
    }
  };

  return values;
}

async function loadTracker() {
  return import(`./visit-tracker.js?test=${Date.now()}-${Math.random()}`);
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

test('records the first visit and exposes the number of visited days', async () => {
  const values = installStorage();
  const tracker = await loadTracker();
  const stats = tracker.recordVisit(new Date());

  assert.equal(stats.visitedDays, 1);
  assert.equal(stats.lastVisitDate, localDateKey(new Date()));
  assert.equal(tracker.getVisitedDays(), 1);
  assert.deepEqual(JSON.parse(values.get(STORAGE_KEY)), stats);
});

test('does not count another visit on the same local day', async () => {
  const date = new Date(2026, 7, 26, 23, 59);
  const values = installStorage();
  const tracker = await loadTracker();
  values.set(STORAGE_KEY, JSON.stringify({
    schemaVersion: 1,
    visitedDays: 4,
    lastVisitDate: localDateKey(date)
  }));

  const stats = tracker.recordVisit(new Date(2026, 7, 26, 8));

  assert.equal(stats.visitedDays, 4);
  assert.equal(stats.lastVisitDate, localDateKey(date));
  assert.deepEqual(JSON.parse(values.get(STORAGE_KEY)), stats);
});

test('increments once on every new local calendar day, including after a gap', async () => {
  const values = installStorage();
  const tracker = await loadTracker();
  values.set(STORAGE_KEY, JSON.stringify({
    schemaVersion: 1,
    visitedDays: 4,
    lastVisitDate: '2026-08-20'
  }));

  const stats = tracker.recordVisit(new Date(2026, 7, 26, 0, 1));

  assert.equal(stats.visitedDays, 5);
  assert.equal(stats.lastVisitDate, '2026-08-26');
  assert.deepEqual(JSON.parse(values.get(STORAGE_KEY)), stats);
});

test('recovers from malformed or unsupported stored data', async () => {
  const values = installStorage();
  const tracker = await loadTracker();
  values.set(STORAGE_KEY, JSON.stringify({ schemaVersion: 99, visitedDays: 'many', lastVisitDate: 'today' }));

  const stats = tracker.recordVisit(new Date(2026, 7, 26, 12));

  assert.deepEqual(stats, {
    schemaVersion: 1,
    visitedDays: 1,
    lastVisitDate: '2026-08-26'
  });
  assert.deepEqual(JSON.parse(values.get(STORAGE_KEY)), stats);
});

test('does not break when localStorage is unavailable', async () => {
  globalThis.window = {
    localStorage: {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); }
    }
  };
  const tracker = await loadTracker();

  assert.doesNotThrow(() => tracker.recordVisit(new Date(2026, 7, 26, 12)));
  assert.equal(tracker.getVisitedDays(), 0);
});
