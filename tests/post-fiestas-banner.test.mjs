import assert from 'node:assert/strict';
import test from 'node:test';

const banner = await import(`../src/scripts/post-fiestas-banner.js?test=${Date.now()}`);

test('uses the Europe/Madrid calendar date for campaign visibility', () => {
  assert.equal(banner.getMadridDate(new Date('2026-09-10T22:30:00.000Z')), '2026-09-11');
  assert.equal(
    banner.isPostFiestasBannerActive(
      '2026-09-11',
      '2026-09-20',
      new Date('2026-09-11T08:00:00.000Z')
    ),
    true
  );
  assert.equal(
    banner.isPostFiestasBannerActive(
      '2026-09-11',
      '2026-09-20',
      new Date('2026-09-21T08:00:00.000Z')
    ),
    false
  );
  assert.equal(
    banner.isPostFiestasBannerActive(
      '2026-09-11',
      null,
      new Date('2030-09-21T08:00:00.000Z')
    ),
    true
  );
});

test('shows the welcome dialog once per day and once per session', () => {
  const createStorage = () => {
    const values = new Map();
    return {
      getItem: (key) => values.get(key) || null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: (key) => values.delete(key)
    };
  };
  const storage = createStorage();
  const sessionStorage = createStorage();
  const firstVisit = new Date('2026-09-14T10:00:00.000Z');

  assert.equal(
    banner.shouldShowPostFiestasWelcome({
      storage,
      sessionStorage,
      startDate: '2026-09-14',
      now: firstVisit
    }),
    true
  );

  banner.markPostFiestasWelcomeSeen(storage, firstVisit);
  banner.markPostFiestasWelcomeSeenInSession(sessionStorage, firstVisit);
  assert.equal(
    banner.shouldShowPostFiestasWelcome({
      storage,
      sessionStorage,
      startDate: '2026-09-14',
      now: firstVisit
    }),
    false
  );

  assert.equal(
    banner.shouldShowPostFiestasWelcome({
      storage,
      sessionStorage,
      startDate: '2026-09-14',
      now: new Date('2026-09-15T10:00:00.000Z')
    }),
    true
  );
  assert.equal(
    banner.shouldShowPostFiestasWelcome({
      storage,
      sessionStorage,
      startDate: '2026-09-14',
      now: firstVisit,
      preview: true
    }),
    true
  );
});
