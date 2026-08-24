import assert from 'node:assert/strict';
import test from 'node:test';

const TRACKED_FAVORITES_STORAGE_KEY = 'fiestasPucela:analytics:saved-activities';
const TRACKED_COMMUNITY_PLANS_STORAGE_KEY = 'fiestasPucela:analytics:added-community-plans';

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

test('tracks the stable id when a community plan is added', async () => {
  const values = installBrowserGlobals();
  const analytics = await import(`../src/scripts/analytics.js?community=${Date.now()}`);
  const sent = [];

  window._paq = { push: (event) => sent.push(event) };

  assert.equal(analytics.trackCommunityPlanAdded('indie-pero-no-solo'), true);
  assert.equal(analytics.trackCommunityPlanAdded('indie-pero-no-solo'), false);
  assert.deepEqual(sent, [['trackEvent', 'plan', 'add_community', 'indie_pero_no_solo']]);
  assert.deepEqual(JSON.parse(values.get(TRACKED_COMMUNITY_PLANS_STORAGE_KEY)), ['indie_pero_no_solo']);
});

test('tracks an explicit PWA install action without tracking availability', async () => {
  installBrowserGlobals();
  const analytics = await import(`../src/scripts/analytics.js?pwa=${Date.now()}`);
  const sent = [];

  window._paq = { push: (event) => sent.push(event) };

  assert.equal(analytics.trackPwaInstallClicked('menu'), true);
  assert.deepEqual(sent, [['trackEvent', 'pwa', 'install_clicked', 'install', 'menu']]);
  assert.equal('trackPwaInstallAvailable' in analytics, false);
});
