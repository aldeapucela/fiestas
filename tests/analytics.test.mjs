import assert from 'node:assert/strict';
import test from 'node:test';

const TRACKED_FAVORITES_STORAGE_KEY = 'fiestasPucela:analytics:saved-activities';

function installBrowserGlobals() {
  const values = new Map();

  globalThis.window = {
    location: {
      hostname: 'fiestas.aldeapucela.org',
      href: 'https://fiestas.aldeapucela.org/'
    },
    navigator: { doNotTrack: '0' },
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value)
    },
    _paq: []
  };

  globalThis.document = {
    createElement: () => ({
      dataset: {},
      addEventListener: () => {}
    }),
    head: { append: () => {} }
  };

  return values;
}

test('tracks and deduplicates saves after Matomo replaces the initial array queue', async () => {
  const values = installBrowserGlobals();
  const analytics = await import(`../src/scripts/analytics.js?test=${Date.now()}`);
  const sent = [];

  window._paq = { push: (event) => sent.push(event) };

  assert.equal(analytics.trackFavoriteChanged('307', true), true);
  assert.equal(analytics.trackFavoriteChanged('307', true), false);
  assert.deepEqual(sent, [['trackEvent', 'activity', 'save', '307']]);
  assert.deepEqual(JSON.parse(values.get(TRACKED_FAVORITES_STORAGE_KEY)), ['307']);
});
