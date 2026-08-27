import { test, expect } from './fixtures.js';

// Flujo 10
test('populares renderiza sin romperse aunque no haya datos de guardados', async ({ page }) => {
  await page.goto('/populares/');
  await expect(page.locator('[data-fiestas-popular-page]')).toBeVisible();
  // El endpoint de contadores está simulado vacío: la página debe explicarlo, no fallar.
  await expect(page.locator('[data-fiestas-popular-list]')).toBeVisible();
});

test('el catálogo de planes vecinales renderiza y sus fichas abren', async ({ page }) => {
  await page.goto('/planes/');
  await expect(page.locator('[data-community-plans-page]')).toBeVisible();

  const firstPlan = page.locator('a[href^="/planes/"]').first();
  await expect(firstPlan).toBeVisible();
  const href = await firstPlan.getAttribute('href');

  await page.goto(href);
  await expect(page.locator('h1')).not.toBeEmpty();
});

test('mi plan renderiza vacío sin errores', async ({ page }) => {
  await page.goto('/plan/');
  await expect(page.locator('[data-fiestas-plans-page]')).toBeVisible();
});
