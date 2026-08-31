import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterPopularVisitedEvents,
  getPopularVisitThreshold,
  rankPopularEvents,
  rankVisitedEvents
} from './popular-page.js';

const events = [
  { id: 1, date: '2026-09-05', startTime: '18:00', title: 'Tarde' },
  { id: 2, date: '2026-09-04', startTime: '19:00', title: 'Primera fecha' },
  { id: 3, date: '2026-09-04', startTime: '18:00', title: 'Primera hora' },
  { id: 4, date: '2026-09-04', startTime: '18:00', title: 'Otra primera hora' },
  { id: 5, date: '2026-09-06', startTime: '12:00', title: 'Pocas' }
];

test('popular events keep only activities with at least ten saves', () => {
  const ranked = rankPopularEvents(events, new Map([
    ['1', 11], ['2', 10], ['3', 9], ['4', 1], ['5', 10]
  ]));

  assert.deepEqual(ranked.map((event) => event.id), [1, 2, 5]);
});

test('popular events sort ties by date, time, then title', () => {
  const ranked = rankPopularEvents(events, new Map([
    ['1', 10], ['2', 10], ['3', 10], ['4', 10], ['5', 10]
  ]));

  assert.deepEqual(ranked.map((event) => event.id), [4, 3, 2, 1, 5]);
});

test('visited events use the same threshold and tie-breakers with visit counts', () => {
  const ranked = rankVisitedEvents(events, new Map([
    ['1', 4], ['2', 5], ['3', 2], ['4', 5], ['5', 1]
  ]));

  assert.deepEqual(ranked.map((event) => event.id), [4, 2, 1]);
});

test('ranking does not mutate the source event list', () => {
  const source = [...events];
  rankPopularEvents(source, new Map([['1', 10], ['2', 10], ['5', 10]]));

  assert.deepEqual(source, events);
});

test('visit threshold grows with the annual total', () => {
  assert.equal(getPopularVisitThreshold(499), 3);
  assert.equal(getPopularVisitThreshold(16037), 81);
});

test('visited ranking keeps a small top range and falls back when needed', () => {
  const ranked = rankVisitedEvents([
    ...events,
    { id: 6, date: '2026-09-07', startTime: '12:00', title: 'Sexta' },
    { id: 7, date: '2026-09-07', startTime: '13:00', title: 'Séptima' }
  ], new Map([
    ['1', 900], ['2', 400], ['3', 160], ['4', 120], ['5', 80], ['6', 60], ['7', 30]
  ]));
  const result = filterPopularVisitedEvents(ranked, new Map([
    ['1', 900], ['2', 400], ['3', 160], ['4', 120], ['5', 80], ['6', 60], ['7', 30]
  ]), 16037);

  assert.equal(result.threshold, 81);
  assert.equal(result.usedFallback, true);
  assert.deepEqual(result.events.map((event) => event.id), [1, 2, 3, 4, 5]);
});

test('visited ranking never grows beyond thirty cards', () => {
  const manyEvents = Array.from({ length: 35 }, (_, index) => ({
    id: index + 1,
    date: '2026-09-04',
    startTime: '12:00',
    title: `Actividad ${index + 1}`
  }));
  const counts = new Map(manyEvents.map((event) => [String(event.id), 10]));

  const result = filterPopularVisitedEvents(manyEvents, counts, 100);
  assert.equal(result.events.length, 30);
});
