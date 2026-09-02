import assert from 'node:assert/strict';
import test from 'node:test';
import {
  emptyImportRegistry,
  getRegisteredOccurrence,
  normalizeImportRegistry,
  occurrenceRegistryKey,
  registerOccurrence,
  resolveLocalEventId
} from '../scripts/event-import-registry.mjs';

test('usa una identidad estable por ocurrencia y no por el título', () => {
  const remote = {
    id: 2222,
    startsAt: '2026-09-05T13:30:00+02:00',
    endsAt: '2026-09-12T13:30:00+02:00'
  };
  assert.equal(occurrenceRegistryKey(remote, { date: '2026-09-05', startTime: '13:30' }), 'day-2026-09-05');
  assert.equal(occurrenceRegistryKey(remote, { key: 'session-a', date: '2026-09-05' }), 'session-a');
  assert.equal(occurrenceRegistryKey({ id: 1, startsAt: '2026-09-05T20:00:00+02:00', endsAt: '2026-09-05T21:00:00+02:00' }, { date: '2026-09-05' }), 'single');
});

test('registra, normaliza y recupera enlaces históricos', () => {
  const registry = emptyImportRegistry();
  registerOccurrence(registry, 2412, 'day-2026-09-06', {
    status: 'linked',
    localEventId: 796,
    reason: 'Migración'
  });
  assert.deepEqual(getRegisteredOccurrence(registry, 2412, 'day-2026-09-06'), {
    status: 'linked',
    localEventId: '796',
    reason: 'Migración'
  });
  assert.equal(resolveLocalEventId('583', {
    '583': { targetEventId: '783' },
    '783': { targetEventId: '437' }
  }), '437');
  assert.deepEqual(normalizeImportRegistry(registry), registry);
});
