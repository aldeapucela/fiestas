import assert from 'node:assert/strict';
import test from 'node:test';

const TRACKED_FAVORITES_STORAGE_KEY = 'fiestasPucela:analytics:saved-activities';
const TRACKED_CASETA_FAVORITES_STORAGE_KEY = 'fiestasPucela:analytics:saved-casetas';
const TRACKED_CASETA_DISH_LIKES_STORAGE_KEY = 'fiestasPucela:analytics:liked-caseta-dishes';
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

test('tracks and deduplicates caseta favorites independently from activities', async () => {
  const values = installBrowserGlobals();
  const analytics = await import(`../src/scripts/analytics.js?caseta=${Date.now()}`);
  const sent = [];

  window._paq = { push: (event) => sent.push(event) };

  assert.equal(analytics.trackCasetaFavoriteChanged('Z1-05', true), true);
  assert.equal(analytics.trackCasetaFavoriteChanged('z1-05', true), false);
  assert.deepEqual(sent, [['trackEvent', 'caseta', 'save', 'z1_05']]);
  assert.deepEqual(JSON.parse(values.get(TRACKED_CASETA_FAVORITES_STORAGE_KEY)), ['z1-05']);
  assert.equal(values.has(TRACKED_FAVORITES_STORAGE_KEY), false);
});

test('tracks caseta removals and rejects invalid caseta IDs', async () => {
  installBrowserGlobals();
  const analytics = await import(`../src/scripts/analytics.js?caseta-remove=${Date.now()}`);
  const sent = [];

  window._paq = { push: (event) => sent.push(event) };

  assert.equal(analytics.trackCasetaFavoriteChanged('z2-07', false), true);
  assert.equal(analytics.trackCasetaFavoriteChanged('event-307', true), false);
  assert.deepEqual(sent, [['trackEvent', 'caseta', 'remove_save', 'z2_07']]);
});

test('does not send caseta favorite events when analytics is disabled or DNT is enabled', async () => {
  installBrowserGlobals();
  window.__FIESTAS_ANALYTICS_CONFIG__ = { enabled: false };
  const disabled = await import(`../src/scripts/analytics.js?caseta-disabled=${Date.now()}`);
  window._paq = { push: () => { throw new Error('disabled analytics should not push'); } };
  assert.equal(disabled.trackCasetaFavoriteChanged('z1-01', true), false);

  installBrowserGlobals();
  window.navigator.doNotTrack = '1';
  const dnt = await import(`../src/scripts/analytics.js?caseta-dnt=${Date.now()}`);
  window._paq = { push: () => { throw new Error('DNT analytics should not push'); } };
  assert.equal(dnt.trackCasetaFavoriteChanged('z1-01', true), false);
});

test('tracks and deduplicates one like per caseta dish with a stable technical name', async () => {
  const values = installBrowserGlobals();
  const analytics = await import(`../src/scripts/analytics.js?dish=${Date.now()}`);
  const sent = [];

  window._paq = { push: (event) => sent.push(event) };

  assert.equal(analytics.trackCasetaDishLiked('Z2-07', 'pincho-brocheta-pollo'), true);
  assert.equal(analytics.trackCasetaDishLiked('z2-07', 'pincho-brocheta-pollo'), false);
  assert.equal(analytics.trackCasetaDishUnliked('z2-07', 'pincho-brocheta-pollo'), true);
  assert.equal(analytics.trackCasetaDishLiked('z2-07', 'pincho-brocheta-pollo-renamed'), true);
  assert.deepEqual(sent, [
    ['trackEvent', 'caseta_dish', 'like', 'z2_07_pincho_brocheta_pollo'],
    ['trackEvent', 'caseta_dish', 'remove_like', 'z2_07_pincho_brocheta_pollo'],
    ['trackEvent', 'caseta_dish', 'like', 'z2_07_pincho_brocheta_pollo_renamed']
  ]);
  assert.deepEqual(JSON.parse(values.get(TRACKED_CASETA_DISH_LIKES_STORAGE_KEY)), [
    'z2_07_pincho_brocheta_pollo',
    'z2_07_pincho_brocheta_pollo_renamed'
  ]);
  assert.equal(values.has(TRACKED_CASETA_FAVORITES_STORAGE_KEY), false);
});

test('rejects invalid caseta dish identifiers and tolerates disabled analytics', async () => {
  const values = installBrowserGlobals();
  const analytics = await import(`../src/scripts/analytics.js?dish-invalid=${Date.now()}`);
  const sent = [];

  window._paq = { push: (event) => sent.push(event) };
  assert.equal(analytics.trackCasetaDishLiked('z8-01', 'pincho-rabas'), false);
  assert.equal(analytics.trackCasetaDishLiked('z2-07', 'Pincho con espacios'), false);
  assert.deepEqual(sent, []);
  assert.equal(values.has(TRACKED_CASETA_DISH_LIKES_STORAGE_KEY), false);

  installBrowserGlobals();
  window.__FIESTAS_ANALYTICS_CONFIG__ = { enabled: false };
  const disabled = await import(`../src/scripts/analytics.js?dish-disabled=${Date.now()}`);
  window._paq = { push: () => { throw new Error('disabled analytics should not push'); } };
  assert.equal(disabled.trackCasetaDishLiked('z2-07', 'pincho-rabas'), false);
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
