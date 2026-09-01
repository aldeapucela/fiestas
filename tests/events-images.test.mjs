import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const eventsUrl = new URL('../src/data/fiestas-2026/events.json', import.meta.url);

async function loadEvents() {
  return JSON.parse(await fs.readFile(eventsUrl, 'utf8'));
}

test('events with multiple images keep image as the card image', async () => {
  const events = await loadEvents();
  for (const event of events) {
    if (!Array.isArray(event.images)) continue;

    assert.ok(event.images.length > 1, `event ${event.id} should only use images for multiple images`);
    assert.equal(event.image, event.images[0], `event ${event.id} image must be the first card image`);
    assert.equal(new Set(event.images).size, event.images.length, `event ${event.id} images must be unique`);
    assert.ok(event.images.every((image) => typeof image === 'string' && image.trim()), `event ${event.id} images must be non-empty strings`);
  }
});
