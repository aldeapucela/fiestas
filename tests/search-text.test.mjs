import assert from 'node:assert/strict';
import test from 'node:test';

import { matchesSearch, normalizeText, searchTokens } from '../src/scripts/search-text.js';

test('ignores accents and capitals', () => {
  assert.equal(normalizeText('Café Bar'), 'cafe bar');
  assert.ok(matchesSearch('Café Bar Zorrilla', 'cafe'));
  assert.ok(matchesSearch('Cafe Bar Zorrilla', 'café'));
});

test('finds every word wherever it appears, in any order', () => {
  const caseta = 'Taberna Japonesa Wabi-Sabi Plaza Martí y Monsó';
  assert.ok(matchesSearch(caseta, 'taberna japonesa'));
  assert.ok(matchesSearch(caseta, 'japonesa taberna'));
  assert.ok(matchesSearch(caseta, 'wabi marti'));
  assert.ok(!matchesSearch(caseta, 'taberna gallega'));
});

test('surplus spaces do not change the result', () => {
  assert.deepEqual(searchTokens('  taberna   japonesa '), ['taberna', 'japonesa']);
  assert.ok(matchesSearch('Taberna Japonesa', '  taberna   japonesa '));
});

test('an empty query matches everything', () => {
  assert.deepEqual(searchTokens('   '), []);
  assert.ok(matchesSearch('La Criolla', ''));
  assert.ok(matchesSearch('La Criolla', '   '));
});
