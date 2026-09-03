import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

import {
  POST_HEIGHT,
  POST_CAROUSEL_MAX_ITEMS,
  POST_MAX_ITEMS,
  POST_WIDTH,
  STORY_CONTENT_BOTTOM,
  STORY_HEIGHT,
  STORY_SAFE_BOTTOM,
  STORY_SAFE_TOP,
  STORY_WIDTH,
  formatStoryDate,
  isDailyPopularDate,
  rankDailyPopularEvents,
  rankDailyPostEvents,
  selectStoryPosterEvents
} from '../src/scripts/daily-popular.js';
import { generateDailyPopular } from '../scripts/generate-daily-popular.mjs';

test('accepts only the ten Fiestas dates', () => {
  assert.equal(isDailyPopularDate('2026-09-04'), true);
  assert.equal(isDailyPopularDate('2026-09-13'), true);
  assert.equal(isDailyPopularDate('2026-09-03'), false);
  assert.equal(isDailyPopularDate('2026-09-14'), false);
});

test('formats the story date in Spanish using the calendar date', () => {
  assert.equal(formatStoryDate('2026-09-04'), 'Viernes 4 de septiembre');
  assert.equal(formatStoryDate('2026-09-07'), 'Lunes 7 de septiembre');
});

test('ranks day events with normalized 60/40 saves and visits', () => {
  const events = [
    { id: 1, date: '2026-09-04', title: 'Solo guardados', startTime: '12:00' },
    { id: 2, date: '2026-09-04', title: 'Solo visitas', startTime: '13:00' },
    { id: 3, date: '2026-09-04', title: 'Equilibrada', startTime: '14:00' }
  ];
  const ranked = rankDailyPopularEvents(events, [
    { id: '1', saveCount: 100, visitCount: 0 },
    { id: '2', saveCount: 0, visitCount: 100 },
    { id: '3', saveCount: 80, visitCount: 80 }
  ]);
  assert.deepEqual(ranked.map((event) => event.id), [1, 3, 2]);
  assert.equal(ranked[0].popularityScore, 0.6);
});

test('ranks carousel posts by saves before visits', () => {
  const events = [
    { id: 1, date: '2026-09-04', title: 'Muchas visitas', startTime: '12:00' },
    { id: 2, date: '2026-09-04', title: 'Más guardados', startTime: '13:00' },
    { id: 3, date: '2026-09-04', title: 'Empate de guardados', startTime: '14:00' }
  ];
  const ranked = rankDailyPostEvents(events, [
    { id: '1', saveCount: 10, visitCount: 100 },
    { id: '2', saveCount: 20, visitCount: 1 },
    { id: '3', saveCount: 20, visitCount: 8 }
  ]);
  assert.deepEqual(ranked.map((event) => event.id), [3, 2, 1]);
  assert.equal(POST_CAROUSEL_MAX_ITEMS, 8);
});

test('does not repeat shared poster files in the story', () => {
  const selected = selectStoryPosterEvents([
    { id: 1, image: '/assets/events/shared.jpg' },
    { id: 2, image: '/assets/events/shared.jpg' },
    { id: 3, image: '/assets/events/other.jpg' },
    { id: 4, image: 'https://example.com/remote.jpg' }
  ]);
  assert.deepEqual(selected.map((event) => event.id), [1, 3]);
});

test('generates story and vertical post images with a reusable manifest', async () => {
  const events = [
    { id: 1, date: '2026-09-04', title: 'Gira de verano Nintendo', startTime: '12:00', image: '/assets/events/tia-melitona-illustration.png', location: 'Campo Grande' },
    { id: 2, date: '2026-09-04', title: 'Paco Devotion', startTime: '20:00', image: '/assets/events/paco-devotion-fiestas-valladolid-tour-2026.jpg', location: 'Valladolid' }
  ];
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fiestas-daily-popular-test-'));
  const result = await generateDailyPopular({
    date: '2026-09-04',
    events,
    metricsPayload: { activities: [{ id: '1', saveCount: 5, visitCount: 20 }, { id: '2', saveCount: 3, visitCount: 10 }] },
    outputDir
  });
  const metadata = await sharp(result.outputImagePath).metadata();
  const postMetadata = await sharp(result.outputPostImagePath).metadata();
  assert.equal(metadata.width, STORY_WIDTH);
  assert.equal(metadata.height, STORY_HEIGHT);
  assert.equal(postMetadata.width, POST_WIDTH);
  assert.equal(postMetadata.height, POST_HEIGHT);
  assert.equal(result.manifest.safeArea.top, STORY_SAFE_TOP);
  assert.equal(result.manifest.safeArea.bottom, STORY_SAFE_BOTTOM);
  assert.equal(STORY_CONTENT_BOTTOM, STORY_HEIGHT - STORY_SAFE_BOTTOM);
  assert.equal(result.manifest.items.length, 2);
  assert.equal(result.manifest.imageUrl, 'https://fiestas.aldeapucela.org/daily-popular/2026-09-04.jpg');
  assert.equal(result.manifest.storyImageUrl, result.manifest.imageUrl);
  assert.equal(result.manifest.postImageUrl, 'https://fiestas.aldeapucela.org/daily-popular/2026-09-04-post.jpg');
  assert.deepEqual(result.manifest.postImageUrls, [
    'https://fiestas.aldeapucela.org/daily-popular/2026-09-04-post.jpg',
    'https://fiestas.aldeapucela.org/daily-popular/2026-09-04-post-2.jpg'
  ]);
  assert.equal(result.outputPostImagePaths.length, 2);
  assert.equal(result.manifest.postItems.length, 2);
  assert.equal(result.manifest.postImageWidth, POST_WIDTH);
  assert.equal(result.manifest.postImageHeight, POST_HEIGHT);
  assert.equal(POST_MAX_ITEMS, 4);
});

test('uses typographic poster compositions when popular activities have no local image', async () => {
  const events = [
    { id: 11, date: '2026-09-04', title: 'Actividad sin cartel', startTime: '18:00', location: 'Plaza Mayor' },
    { id: 12, date: '2026-09-04', title: 'Otra actividad sin imagen', startTime: '21:30', location: 'Las Moreras' }
  ];
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fiestas-daily-popular-fallback-test-'));
  const result = await generateDailyPopular({
    date: '2026-09-04',
    events,
    metricsPayload: { activities: [{ id: '11', saveCount: 5, visitCount: 20 }, { id: '12', saveCount: 3, visitCount: 10 }] },
    outputDir
  });
  const metadata = await sharp(result.outputImagePath).metadata();
  const postMetadata = await sharp(result.outputPostImagePath).metadata();
  assert.equal(metadata.width, STORY_WIDTH);
  assert.equal(metadata.height, STORY_HEIGHT);
  assert.equal(postMetadata.width, POST_WIDTH);
  assert.equal(postMetadata.height, POST_HEIGHT);
  assert.equal(result.manifest.items.length, 2);
});
