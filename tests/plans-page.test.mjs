import assert from 'node:assert/strict';
import test from 'node:test';

import { validateImport } from '../src/scripts/plans-page.js';

test('plan imports report activities that no longer exist', () => {
  const result = validateImport(JSON.stringify({
    schemaVersion: 1,
    festival: 'valladolid-2026',
    plans: [
      {
        name: 'Plan con evento eliminado',
        icon: 'calendar',
        activityIds: ['403', '468', '472']
      }
    ]
  }), new Set(['403', '472']));

  assert.equal(result.ok, true);
  assert.equal(result.plans[0].isValid, false);
  assert.deepEqual(result.plans[0].validIds, ['403', '472']);
  assert.deepEqual(result.plans[0].missingIds, ['468']);
});
