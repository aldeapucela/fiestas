import test from 'node:test';
import assert from 'node:assert/strict';

import { createPlanImportUrl, createPlanJson, decodePlanImportHash } from './plan-export.js';

test('plan import URL encodes the same JSON used by file export', () => {
  globalThis.window = { location: { origin: 'https://fiestas.aldeapucela.org' } };

  const plan = {
    name: 'Sábado con música',
    icon: 'music',
    activityIds: ['1', '30', '1']
  };

  const url = new URL(createPlanImportUrl(plan, '/plan/importar/'));
  const decoded = decodePlanImportHash(url.searchParams.get('hash'));
  const payload = JSON.parse(decoded);

  assert.equal(url.pathname, '/plan/importar/');
  assert.equal(decoded.at(-1), '\n');
  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.festival, 'valladolid-2026');
  assert.equal(typeof payload.exportedAt, 'string');
  assert.deepEqual(payload.plans, JSON.parse(createPlanJson(plan)).plans);
});
