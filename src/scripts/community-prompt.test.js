import assert from 'node:assert/strict';
import test from 'node:test';

delete globalThis.window;
delete globalThis.document;

const prompt = await import(`./community-prompt.js?test=${Date.now()}`);
const campaign = prompt.DEFAULT_COMMUNITY_PROMPT_CAMPAIGN;
const campaignDate = new Date('2026-09-05T12:00:00').getTime();

test('requires two active days and one relevant action', () => {
  const state = {
    ...prompt.createCommunityPromptState(),
    relevantActionSeen: true
  };

  assert.equal(prompt.canShowCommunityPrompt({ state, visitedDays: 1, campaign, now: campaignDate }), false);
  assert.equal(prompt.canShowCommunityPrompt({ state, visitedDays: 2, campaign, now: campaignDate }), true);
  assert.equal(prompt.canShowCommunityPrompt({ state, visitedDays: 2, campaign, now: new Date('2026-09-14T00:00:00').getTime() }), false);
});

test('allows only two exposures and applies a five-day cooldown', () => {
  const initial = {
    ...prompt.createCommunityPromptState(),
    relevantActionSeen: true
  };
  const first = prompt.recordCommunityPromptExposure(initial, campaignDate);
  const second = prompt.recordCommunityPromptExposure({ ...first, nextEligibleAt: 0 }, campaignDate + prompt.COMMUNITY_PROMPT_SNOOZE_MS);
  const third = prompt.recordCommunityPromptExposure({ ...second, nextEligibleAt: 0 }, campaignDate + 2 * prompt.COMMUNITY_PROMPT_SNOOZE_MS);

  assert.equal(first.exposureCount, 1);
  assert.equal(first.nextEligibleAt, campaignDate + prompt.COMMUNITY_PROMPT_SNOOZE_MS);
  assert.equal(second.exposureCount, 2);
  assert.equal(third.exposureCount, 2);
  assert.equal(prompt.canShowCommunityPrompt({ state: first, visitedDays: 2, campaign, now: campaignDate + 1 }), false);
  assert.equal(prompt.canShowCommunityPrompt({ state: second, visitedDays: 2, campaign, now: campaignDate + prompt.COMMUNITY_PROMPT_SNOOZE_MS + 1 }), false);
});

test('permanent dismissal blocks the prompt regardless of date', () => {
  const state = prompt.recordCommunityPromptNeverAgain(prompt.createCommunityPromptState());
  assert.equal(state.neverAgain, true);
  assert.equal(prompt.canShowCommunityPrompt({ state, visitedDays: 10, campaign, now: campaignDate }), false);
});

test('recognizes relevant engagement and only successful searches', () => {
  assert.equal(prompt.isRelevantCommunityEngagement({ category: 'activity', action: 'save' }), true);
  assert.equal(prompt.isRelevantCommunityEngagement({ category: 'plan', action: 'add_community' }), true);
  assert.equal(prompt.isRelevantCommunityEngagement({ category: 'agenda', action: 'search', name: 'with_results' }), true);
  assert.equal(prompt.isRelevantCommunityEngagement({ category: 'agenda', action: 'search', name: 'without_results' }), false);
  assert.equal(prompt.isRelevantCommunityEngagement({ category: 'pwa', action: 'installed' }), false);
});

test('reads malformed state as a clean campaign state and persists valid state', () => {
  const values = new Map([[prompt.COMMUNITY_PROMPT_STORAGE_KEY, '{not json}']]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
  const clean = prompt.readCommunityPromptState(storage, campaign.id);
  assert.equal(clean.exposureCount, 0);
  assert.equal(prompt.writeCommunityPromptState(storage, clean), true);
  assert.deepEqual(JSON.parse(values.get(prompt.COMMUNITY_PROMPT_STORAGE_KEY)), clean);
});
