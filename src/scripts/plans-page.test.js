import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createCommunityPlanUrl,
  isPlanActivityPast,
  isPlanDatePast,
  mergeCommunityPlanUpdates,
  plansMatchSource,
  validateImport
} from './plans-page.js';

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

test('plan import resolves activity ids that were merged after being shared', () => {
  const result = validateImport(payload({
    name: 'Plan antiguo',
    icon: 'music',
    activityIds: ['583', '999']
  }), new Set(['783']), { '583': '783' });

  assert.equal(result.ok, true);
  assert.deepEqual(result.plans[0].validIds, ['783']);
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

test('updates an untouched community plan while preserving its local identity and timestamps', () => {
  const plan = {
    id: 'local-plan',
    sourcePlanId: 'cielo-y-estrellas',
    name: 'Cielo y estrellas',
    icon: 'stars',
    activityIds: ['1'],
    createdAt: '2026-08-20T10:00:00.000Z',
    updatedAt: '2026-08-20T10:00:00.000Z'
  };
  const result = mergeCommunityPlanUpdates([plan], new Map([
    ['cielo-y-estrellas', {
      name: 'Cielo y estrellas',
      icon: 'stars',
      activityIds: ['1', '7']
    }]
  ]));

  assert.equal(result.changed, true);
  assert.deepEqual(result.plans[0].activityIds, ['1', '7']);
  assert.equal(result.plans[0].id, plan.id);
  assert.equal(result.plans[0].createdAt, plan.createdAt);
  assert.equal(result.plans[0].updatedAt, plan.updatedAt);
});

test('does not update a community plan after a local modification', () => {
  const plan = {
    id: 'local-plan',
    sourcePlanId: 'cielo-y-estrellas',
    name: 'Mi selección',
    icon: 'stars',
    activityIds: ['1'],
    createdAt: '2026-08-20T10:00:00.000Z',
    updatedAt: '2026-08-20T10:01:00.000Z'
  };
  const result = mergeCommunityPlanUpdates([plan], new Map([
    ['cielo-y-estrellas', {
      name: 'Cielo y estrellas',
      icon: 'stars',
      activityIds: ['1', '7']
    }]
  ]));

  assert.equal(result.changed, false);
  assert.deepEqual(result.plans, [plan]);
});

test('past plan activities are identified without collapsing their day', () => {
  const now = new Date(2026, 8, 5, 12);

  assert.equal(isPlanDatePast('2026-09-04', now), true);
  assert.equal(isPlanActivityPast({ date: '2026-09-04', startTime: '20:00' }, now), true);
  assert.equal(isPlanActivityPast({ date: '2026-09-05', startTime: '11:00' }, now), false);
  assert.equal(isPlanActivityPast({ date: '2026-09-05', startTime: '11:00', endTime: '12:00' }, now), true);
  assert.equal(isPlanActivityPast({ date: '2026-09-06', startTime: '10:00' }, now), false);
});
