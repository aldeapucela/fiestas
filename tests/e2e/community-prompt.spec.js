import { test, expect } from './fixtures.js';

const COMMUNITY_PROMPT_STATE_KEY = 'fiestasPucela:community-prompt:v1';
const COMMUNITY_PROMPT_ACTIVE_SESSION_KEY = 'fiestasPucela:community-prompt:active:v1';
const VISIT_TRACKER_KEY = 'fiestasPucela:visit-tracker';

async function seedEligibleVisitor(page) {
  await page.addInitScript(({ visitTrackerKey, promptStateKey, activeSessionKey }) => {
    const today = new Date();
    const localDate = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
    if (!localStorage.getItem(visitTrackerKey)) {
      localStorage.setItem(visitTrackerKey, JSON.stringify({
        schemaVersion: 1,
        visitedDays: 2,
        lastVisitDate: localDate
      }));
    }
    if (!localStorage.getItem(promptStateKey)) {
      localStorage.setItem(promptStateKey, JSON.stringify({
        schemaVersion: 1,
        campaignId: 'valladolid-2026',
        exposureCount: 0,
        lastShownAt: 0,
        nextEligibleAt: 0,
        neverAgain: false,
        relevantActionSeen: false
      }));
      sessionStorage.removeItem(activeSessionKey);
    }
    const fixedNow = new Date('2026-09-05T12:00:00+02:00').getTime();
    Date.now = () => fixedNow;
  }, {
    visitTrackerKey: VISIT_TRACKER_KEY,
    promptStateKey: COMMUNITY_PROMPT_STATE_KEY,
    activeSessionKey: COMMUNITY_PROMPT_ACTIVE_SESSION_KEY
  });
}

async function triggerRelevantAction(page) {
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('fiestas:engagement', {
      detail: { category: 'activity', action: 'save', name: '307' }
    }));
  });
}

test('aparece tras dos días y una acción relevante, y respeta dos exposiciones', async ({ page }) => {
  await seedEligibleVisitor(page);
  await page.goto('/');

  const prompt = page.locator('[data-community-prompt]');
  await expect(prompt).toBeHidden();

  await triggerRelevantAction(page);
  await expect(prompt).toBeVisible();
  await expect(prompt.locator('.community-prompt-panel')).toHaveAttribute('role', 'region');
  await expect(prompt.getByRole('button', { name: 'No volver a recordármelo', exact: true })).toHaveCount(1);

  await page.locator('[data-community-prompt-dismiss]').click();
  await expect(prompt).toBeHidden();
  const afterFirstDismiss = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), COMMUNITY_PROMPT_STATE_KEY);
  expect(afterFirstDismiss.exposureCount).toBe(1);
  expect(afterFirstDismiss.nextEligibleAt).toBeGreaterThan(Date.now());

  await page.reload();
  await expect(prompt).toBeHidden();

  await page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key));
    state.nextEligibleAt = 0;
    localStorage.setItem(key, JSON.stringify(state));
  }, COMMUNITY_PROMPT_STATE_KEY);
  await page.reload();
  await triggerRelevantAction(page);
  await expect(prompt).toBeVisible();

  await page.getByRole('button', { name: 'No volver a recordármelo', exact: true }).click();
  await expect(prompt).toBeHidden();
  await page.reload();
  await expect(prompt).toBeHidden();
});

test('los clics de canal mantienen el banner abierto y aplican el silencio', async ({ page }) => {
  await seedEligibleVisitor(page);
  await page.goto('/planes/');
  const prompt = page.locator('[data-community-prompt]');

  await triggerRelevantAction(page);
  await expect(prompt).toBeVisible();
  await page.locator('[data-community-prompt-channel="whatsapp"]').evaluate((link) => {
    link.removeAttribute('target');
    link.addEventListener('click', (event) => event.preventDefault(), { once: true });
  });
  await page.locator('[data-community-prompt-channel="whatsapp"]').click();

  await expect(prompt).toBeVisible();
  const state = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), COMMUNITY_PROMPT_STATE_KEY);
  expect(state.exposureCount).toBe(1);
  expect(state.nextEligibleAt).toBeGreaterThan(Date.now());
  expect(state.neverAgain).toBe(false);

  await page.locator('[data-community-prompt-channel="chat"]').evaluate((link) => {
    link.removeAttribute('target');
    link.addEventListener('click', (event) => event.preventDefault(), { once: true });
  });
  await page.locator('[data-community-prompt-channel="chat"]').click();
  await expect(prompt).toBeVisible();
});

test('no vuelve a mostrarse al navegar si el visitante todavía no lo ha cerrado', async ({ page }) => {
  await seedEligibleVisitor(page);
  await page.goto('/');
  const prompt = page.locator('[data-community-prompt]');

  await triggerRelevantAction(page);
  await expect(prompt).toBeVisible();
  expect(await page.evaluate((key) => sessionStorage.getItem(key), COMMUNITY_PROMPT_ACTIVE_SESSION_KEY)).toBeTruthy();

  await page.goto('/planes/');
  await expect(page.locator('[data-community-prompt]')).toBeHidden();
  const state = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), COMMUNITY_PROMPT_STATE_KEY);
  expect(state.exposureCount).toBe(1);
  expect(state.nextEligibleAt).toBe(0);
});

test('no aparece al abrir una ficha y aparece al volver a la agenda', async ({ page }) => {
  await seedEligibleVisitor(page);
  await page.goto('/e/1/gira-de-verano-nintendo/');
  const prompt = page.locator('[data-community-prompt]');

  await expect(prompt).toBeHidden();
  await page.goto('/');
  await expect(prompt).toBeVisible();
});
