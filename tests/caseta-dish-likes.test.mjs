import assert from 'node:assert/strict';
import test from 'node:test';

function installStorage(value = null) {
  const values = new Map(value === null ? [] : [['fiestasPucela:liked-caseta-dishes', value]]);
  const dispatched = [];
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, nextValue) => values.set(key, nextValue)
    },
    dispatchEvent: (event) => dispatched.push(event.type),
    addEventListener: () => {},
    removeEventListener: () => {}
  };
  globalThis.document = {
    createElement: () => ({
      dataset: {},
      addEventListener: () => {}
    }),
    querySelector: () => null,
    querySelectorAll: () => [],
    head: { append: () => {} }
  };
  return { values, dispatched };
}

test('normalizes caseta dish keys and ignores corrupt values', async () => {
  installStorage(JSON.stringify([
    'Z2-07/pincho-brocheta-pollo',
    'z2-07/pincho-brocheta-pollo',
    'invalid',
    'z8-01/pincho-rabas',
    'z2-07/Pincho con espacios'
  ]));
  const likes = await import(`../src/scripts/caseta-dish-likes.js?read=${Date.now()}`);

  assert.deepEqual(likes.readCasetaDishLikeIds(), ['z2-07/pincho-brocheta-pollo']);
  assert.equal(likes.casetaDishKey('z2-07', 'pincho-rabas'), 'z2-07/pincho-rabas');
  assert.equal(likes.casetaDishKey('bad', 'pincho-rabas'), '');
});

test('stores a dish like independently from caseta favorites', async () => {
  const { values, dispatched } = installStorage('not-json');
  const likes = await import(`../src/scripts/caseta-dish-likes.js?write=${Date.now()}`);

  assert.deepEqual(likes.setCasetaDishLiked('z3-01', 'racion-cecina-leon'), ['z3-01/racion-cecina-leon']);
  assert.deepEqual(JSON.parse(values.get('fiestasPucela:liked-caseta-dishes')), ['z3-01/racion-cecina-leon']);
  assert.equal(values.has('fiestasPucela:casetas-favorites'), false);
  assert.deepEqual(dispatched, ['fiestas:caseta-dish-likes-changed']);

  assert.deepEqual(likes.setCasetaDishLiked('z3-01', 'racion-cecina-leon', false), []);
  assert.deepEqual(JSON.parse(values.get('fiestasPucela:liked-caseta-dishes')), []);
  assert.deepEqual(dispatched, ['fiestas:caseta-dish-likes-changed', 'fiestas:caseta-dish-likes-changed']);
});

test('keeps the page usable when localStorage is unavailable', async () => {
  const dispatched = [];
  globalThis.window = {
    localStorage: {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); }
    },
    dispatchEvent: (event) => dispatched.push(event.type),
    addEventListener: () => {},
    removeEventListener: () => {}
  };
  globalThis.document = {
    createElement: () => ({
      dataset: {},
      addEventListener: () => {}
    }),
    querySelector: () => null,
    querySelectorAll: () => [],
    head: { append: () => {} }
  };
  const likes = await import(`../src/scripts/caseta-dish-likes.js?blocked=${Date.now()}`);

  assert.deepEqual(likes.readCasetaDishLikeIds(), []);
  assert.deepEqual(likes.setCasetaDishLiked('z5-28', 'pincho-guiso-dia'), ['z5-28/pincho-guiso-dia']);
  assert.deepEqual(dispatched, ['fiestas:caseta-dish-likes-changed']);
});

test('matches casetas with a liked votable dish, not unrelated stored keys', async () => {
  const { casetaHasLikedDish } = await import(`../src/scripts/casetas-page.js?filter=${Date.now()}`);
  const caseta = {
    id: 'z2-07',
    details: {
      menuSections: [
        { votable: true, items: [{ id: 'pincho-brocheta-pollo', name: 'Brocheta de pollo' }] },
        { votable: false, items: [{ id: 'bebida-agua', name: 'Agua' }] }
      ]
    }
  };

  assert.equal(casetaHasLikedDish(caseta, new Set(['z2-07/pincho-brocheta-pollo'])), true);
  assert.equal(casetaHasLikedDish(caseta, new Set(['z2-07/bebida-agua'])), false);
  assert.equal(casetaHasLikedDish(caseta, new Set(['z3-01/racion-cecina-leon'])), false);
});
