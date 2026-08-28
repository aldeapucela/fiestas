import { test, expect, loadClientEvents } from './fixtures.js';

const FAVORITES_KEY = 'fiestasPucela:favorites';

function planHash(activityIds) {
  const payload = {
    schemaVersion: 1,
    festival: 'valladolid-2026',
    exportedAt: new Date('2026-08-01T10:00:00Z').toISOString(),
    plans: [{ name: 'Plan de prueba E2E', icon: 'layers', activityIds }]
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

// Flujo 7
test('guardar una actividad persiste en localStorage y sobrevive a recargar', async ({ page }) => {
  await page.goto('/');
  const card = page.locator('[data-fiestas-card]').first();
  await expect(card).toBeVisible();

  const activityId = await card.getAttribute('data-fiestas-card');
  const save = card.locator('[data-event-id], .fiestas-event-save').first();
  await save.click();

  await expect.poll(async () => {
    const raw = await page.evaluate((key) => window.localStorage.getItem(key), FAVORITES_KEY);
    return JSON.parse(raw || '[]');
  }).toContain(activityId);

  await page.reload();
  await expect(page.locator(`[data-fiestas-card="${activityId}"]`)).toBeVisible();
  await expect(page.locator(`[data-fiestas-card="${activityId}"] [aria-pressed="true"]`)).toHaveCount(1);

  // Y quitarlo también persiste.
  await page.locator(`[data-fiestas-card="${activityId}"] [aria-pressed="true"]`).click();
  await expect.poll(async () => {
    const raw = await page.evaluate((key) => window.localStorage.getItem(key), FAVORITES_KEY);
    return JSON.parse(raw || '[]');
  }).not.toContain(activityId);
});

// Flujo 8
test('importar un plan por hash válido lo previsualiza y lo guarda', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-fiestas-card]').first()).toBeVisible();
  const events = await loadClientEvents(page);
  const ids = events.slice(0, 3).map((event) => String(event.id));
  expect(ids.length).toBeGreaterThan(0);

  await page.goto(`/plan/importar/?hash=${encodeURIComponent(planHash(ids))}`);

  // Un enlace compartido entra por la vista "shared", no por la de subir fichero.
  await expect(page.locator('[data-plan-import-shared-preview]')).toBeVisible();
  await expect(page.locator('[data-plan-import-status]')).not.toContainText(/no es válido/i);

  await page.locator('[data-plan-import-shared-add]').click();
  await expect(page.locator('[data-plan-import-status]')).toContainText(/añadido a Mi plan/i);

  const plans = await page.evaluate(() => JSON.parse(window.localStorage.getItem('fiestasPucela:plans') || '{}'));
  expect(plans.plans?.length).toBeGreaterThan(0);
});

test('un hash corrupto muestra el error y no rompe la página', async ({ page }) => {
  await page.goto('/plan/importar/?hash=esto-no-es-base64-valido%21%21');

  await expect(page.locator('[data-plan-import-status]')).toContainText(/no es válido|no contiene/i);
  // La página sigue viva: el menú y el título siguen respondiendo.
  await expect(page.locator('[data-plan-import-title]')).toBeVisible();
  await expect(page.locator('[data-plan-import-shared-preview]')).toBeHidden();
});
