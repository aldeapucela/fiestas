import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const eventsUrl = new URL('../src/data/fiestas-2026/events.json', import.meta.url);

test('event catalog uses unique positive numeric ids', async () => {
  const events = JSON.parse(await fs.readFile(eventsUrl, 'utf8'));
  const ids = events.map((event) => event.id);

  assert.ok(ids.every((id) => Number.isInteger(id) && id > 0),
    'every event id must be a positive integer');
  assert.equal(new Set(ids).size, ids.length,
    'event ids must be unique so detail URLs remain addressable');
});
