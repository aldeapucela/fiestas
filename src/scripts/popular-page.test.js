import test from 'node:test';
import assert from 'node:assert/strict';
import { rankPopularEvents } from './popular-page.js';

const events = [
  { id: 1, date: '2026-09-05', startTime: '18:00', title: 'Tarde' },
  { id: 2, date: '2026-09-04', startTime: '19:00', title: 'Primera fecha' },
  { id: 3, date: '2026-09-04', startTime: '18:00', title: 'Primera hora' },
  { id: 4, date: '2026-09-04', startTime: '18:00', title: 'Otra primera hora' },
  { id: 5, date: '2026-09-06', startTime: '12:00', title: 'Pocas' }
];

test('popular events keep only activities with at least three saves', () => {
  const ranked = rankPopularEvents(events, new Map([
    ['1', 4], ['2', 3], ['3', 2], ['4', 1], ['5', 3]
  ]));

  assert.deepEqual(ranked.map((event) => event.id), [1, 2, 5]);
});

test('popular events sort ties by date, time, then title', () => {
  const ranked = rankPopularEvents(events, new Map([
    ['1', 3], ['2', 3], ['3', 3], ['4', 3], ['5', 3]
  ]));

  assert.deepEqual(ranked.map((event) => event.id), [4, 3, 2, 1, 5]);
});
