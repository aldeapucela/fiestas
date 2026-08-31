import { test, expect } from './fixtures.js';

// Flujo 10
test('populares renderiza sin romperse aunque no haya datos de guardados', async ({ page }) => {
  await page.goto('/populares/');
  await expect(page.locator('[data-fiestas-popular-page]')).toBeVisible();
  // El endpoint de contadores está simulado vacío: la página debe explicarlo, no fallar.
  await expect(page.locator('[data-fiestas-popular-list]')).toBeVisible();
});

test('populares permite cambiar al ranking por visitas', async ({ page }) => {
  await page.goto('/populares/');

  const visitsTab = page.getByRole('tab', { name: 'Por visitas', exact: true });
  await expect(visitsTab).toHaveAttribute('aria-selected', 'false');
  await visitsTab.click();

  await expect(visitsTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-fiestas-popular-intro]')).toHaveText('Estas son las actividades que más visitas han recibido');
  await expect(page.locator('[data-fiestas-popular-list]')).toHaveAttribute('aria-labelledby', 'fiestas-popular-tab-visits');
});

test('el catálogo de planes vecinales renderiza y sus fichas abren', async ({ page }) => {
  const planDataRequests = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/data/community-plans/')) planDataRequests.push(url.pathname);
  });
  await page.goto('/planes/');
  await expect(page.locator('[data-community-plans-page]')).toBeVisible();

  const firstPlan = page.locator('a[href^="/planes/"]').first();
  await expect(firstPlan).toBeVisible();
  await expect(page.locator('.fiestas-community-plan-card-meta').first()).not.toBeEmpty();
  expect(planDataRequests).toEqual([]);
  const href = await firstPlan.getAttribute('href');

  await page.goto(href);
  await expect(page.locator('h1')).not.toBeEmpty();
});

test('mi plan renderiza vacío sin errores', async ({ page }) => {
  await page.goto('/plan/');
  await expect(page.locator('[data-fiestas-plans-page]')).toBeVisible();
});
