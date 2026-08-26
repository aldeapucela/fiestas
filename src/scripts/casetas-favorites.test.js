import assert from 'node:assert/strict';
import test from 'node:test';

const STORAGE_KEY = 'fiestasPucela:casetas-favorites';

function installStorage(initialValue = null) {
  const values = new Map();
  const listeners = new Map();
  if (initialValue !== null) values.set(STORAGE_KEY, JSON.stringify(initialValue));

  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value)
    },
    addEventListener: (type, callback) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(callback);
    },
    removeEventListener: (type, callback) => listeners.get(type)?.delete(callback),
    dispatchEvent: (event) => {
      listeners.get(event.type)?.forEach((callback) => callback(event));
    }
  };

  return { values, listeners };
}

async function loadFavorites() {
  return import(`./casetas-favorites.js?test=${Date.now()}-${Math.random()}`);
}

test('normalizes caseta favorite IDs in an independent storage key', async () => {
  const { values } = installStorage();
  const favorites = await loadFavorites();

  assert.deepEqual(favorites.writeCasetaFavoriteIds([' z2-07 ', 'z1-01', 'z2-07', '']), ['z2-07', 'z1-01']);
  assert.deepEqual(JSON.parse(values.get(STORAGE_KEY)), ['z2-07', 'z1-01']);
  assert.equal(values.has('fiestasPucela:favorites'), false);
});

test('recovers from malformed or unsupported stored data', async () => {
  const { values } = installStorage({ schemaVersion: 2, favorites: 'many' });
  const favorites = await loadFavorites();

  assert.deepEqual(favorites.readCasetaFavoriteIds(), []);
  values.set(STORAGE_KEY, JSON.stringify(['z1-01', 42, null, ' z1-01 ']));
  assert.deepEqual(favorites.readCasetaFavoriteIds(), ['z1-01', '42']);
});

test('sets and removes one caseta favorite without affecting event favorites', async () => {
  const { values } = installStorage(['z1-01']);
  const favorites = await loadFavorites();

  assert.deepEqual(favorites.setCasetaFavorite('z2-07', true), ['z1-01', 'z2-07']);
  assert.deepEqual(favorites.setCasetaFavorite('z1-01', false), ['z2-07']);
  assert.equal(values.has('fiestasPucela:favorites'), false);
});

test('notifies subscribers after local and cross-tab favorite changes', async () => {
  const { values } = installStorage();
  const favorites = await loadFavorites();
  const updates = [];
  const unsubscribe = favorites.subscribeToCasetaFavorites((ids) => updates.push(ids));

  favorites.setCasetaFavorite('z2-07', true);
  values.set(STORAGE_KEY, JSON.stringify(['z1-01']));
  window.dispatchEvent({ type: 'storage', key: STORAGE_KEY });
  unsubscribe();
  values.set(STORAGE_KEY, JSON.stringify(['z3-01']));
  window.dispatchEvent({ type: 'storage', key: STORAGE_KEY });

  assert.deepEqual(updates, [['z2-07'], ['z1-01']]);
});
