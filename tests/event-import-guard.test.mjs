import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { buildImportGuard } from '../scripts/event-import-guard.mjs';

const decisions = JSON.parse(await fs.readFile('src/data/fiestas-2026/import-event-decisions.json', 'utf8'));
const events = JSON.parse(await fs.readFile('src/data/fiestas-2026/events.json', 'utf8'));

test('bloquea huellas de eventos locales eliminados', () => {
  const guard = buildImportGuard(decisions);
  const blocked = guard.getBlockedEvent({
    date: '2026-09-07',
    startTime: '18:00',
    title: 'Vibra 2026 (Festival)',
    location: 'C/ Matías Sagrador (junto a Fuente Dorada), Valladolid'
  });

  assert.equal(blocked.deletedLocalId, 762);
  assert.match(blocked.reason, /no reimportar/);
});

test('expone remotos bloqueados y remotos duplicados como decisiones versionadas', () => {
  const guard = buildImportGuard(decisions);

  assert.equal(guard.getBlockedRemote(2148).reason, 'Ubicación ambigua en Las Moreras; no se fuerza el cruce.');
  assert.equal(guard.getDuplicateLocal(1999).localId, 474);
  assert.equal(guard.getDuplicateLocal(2424).localId, 756);
});

test('el catalogo actual no contiene eventos con huella bloqueada', () => {
  const guard = buildImportGuard(decisions);
  const blockedEvents = events
    .map((event) => ({ event, decision: guard.getBlockedEvent(event) }))
    .filter(({ decision }) => decision);

  assert.deepEqual(blockedEvents, []);
});
