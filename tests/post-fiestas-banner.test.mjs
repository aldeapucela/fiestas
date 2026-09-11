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
