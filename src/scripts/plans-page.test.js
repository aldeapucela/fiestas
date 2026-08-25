import test from 'node:test';
import assert from 'node:assert/strict';

import { createCommunityPlanUrl, plansMatchSource, validateImport } from './plans-page.js';

const eventIds = new Set(['1', '7']);

function payload(plan) {
  return JSON.stringify({
    schemaVersion: 1,
    festival: 'valladolid-2026',
    plans: [plan]
  });
}

test('plan import accepts known icons and keeps only known activity ids', () => {
  const result = validateImport(payload({
    name: 'Plan familiar',
    icon: 'family',
    activityIds: ['1', '999', '1']
  }), eventIds);

  assert.equal(result.ok, true);
  assert.equal(result.plans[0].isValid, false);
  assert.deepEqual(result.plans[0].validIds, ['1']);
  assert.deepEqual(result.plans[0].missingIds, ['999']);
});

test('plan import rejects icons that are not part of the supported set', () => {
  const result = validateImport(payload({
    name: 'Plan incompatible',
    icon: 'script',
    activityIds: ['1']
  }), eventIds);

  assert.equal(result.ok, false);
  assert.equal(result.errorType, 'invalid_icon');
});

test('plan import enforces the maximum name length', () => {
  const result = validateImport(payload({
    name: 'x'.repeat(81),
    icon: 'layers',
    activityIds: ['1']
  }), eventIds);

  assert.equal(result.ok, false);
  assert.equal(result.errorType, 'invalid_name');
});

test('plan import rejects names that look like markup or contain control characters', () => {
  const result = validateImport(payload({
    name: '<script>alert(1)</script>',
    icon: 'layers',
    activityIds: ['1']
  }), eventIds);

  assert.equal(result.ok, false);
  assert.equal(result.errorType, 'invalid_name');
});

test('community plans use the friendly URL only when their content is unchanged', () => {
  const source = {
    name: 'Cielo y estrellas',
    icon: 'stars',
    activityIds: ['1', '7', '134']
  };

  assert.equal(plansMatchSource({ ...source, sourcePlanId: 'cielo-y-estrellas' }, source), true);
  assert.equal(plansMatchSource({ ...source, name: 'Mi plan' }, source), false);
  assert.equal(plansMatchSource({ ...source, activityIds: ['1', '7'] }, source), false);
  assert.equal(plansMatchSource({ ...source, icon: 'music' }, source), false);
});

test('friendly community URLs include the share campaign', () => {
  assert.equal(
    createCommunityPlanUrl('cielo-y-estrellas', 'https://fiestas.aldeapucela.org/plan/importar/'),
    'https://fiestas.aldeapucela.org/planes/cielo-y-estrellas/?mtm_campaign=share'
  );
});
