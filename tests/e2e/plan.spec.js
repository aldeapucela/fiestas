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

test('Mi plan usa la miniatura optimizada de una actividad con imagen', async ({ page }) => {
  await page.goto('/');
  const card = page.locator('[data-fiestas-card]').filter({ hasText: 'Tío Tragaldabas' }).first();
  await expect(card).toBeVisible();
  await card.locator('[data-fiestas-save], .fiestas-event-save').first().click();

  await page.goto('/plan/');
  const image = page.locator('img.fiestas-plan-timeline-image').first();
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute('src', /\/assets\/events\/thumbs\/.*\.webp$/);
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

test('migra favoritos y planes personales que apuntan a un evento fusionado', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('fiestasPucela:favorites', JSON.stringify(['583']));
    localStorage.setItem('fiestasPucela:plans', JSON.stringify({
      schemaVersion: 1,
      plans: [{
        id: 'local-legacy-plan',
        name: 'Plan antiguo',
        createdAt: '2026-08-20T10:00:00.000Z',
        updatedAt: '2026-08-20T10:00:00.000Z',
        activityIds: ['583', '783'],
        icon: 'music'
      }]
    }));
  });
  await page.goto('/');

  await expect.poll(async () => page.evaluate(() => ({
    favorites: JSON.parse(localStorage.getItem('fiestasPucela:favorites') || '[]'),
    planIds: JSON.parse(localStorage.getItem('fiestasPucela:plans') || '{}').plans?.[0]?.activityIds
  }))).toEqual({ favorites: ['783'], planIds: ['783'] });
});

test('un hash antiguo resuelve aliases hacia el evento canónico', async ({ page }) => {
  await page.goto(`/plan/importar/?hash=${encodeURIComponent(planHash(['583']))}`);

  await expect(page.locator('[data-plan-import-shared-preview]')).toBeVisible();
  await expect(page.locator('[data-plan-import-status]')).not.toContainText(/no hay actividades compatibles/i);
});
