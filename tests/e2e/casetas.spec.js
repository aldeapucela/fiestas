import { test, expect } from './fixtures.js';

// Cada caseta visible del listado tiene su botón de favorita, así que sirve
// como recuento estable sin depender de las clases de maquetación.
const casetas = '[data-fiestas-caseta-favorite-toggle]';

// Flujo 9
test('las casetas se buscan y se filtran por dieta', async ({ page }) => {
  await page.goto('/casetas/');
  await expect(page.locator('[data-fiestas-casetas-page]')).toBeVisible();
  await expect(page.locator(casetas).first()).toBeVisible();
  const total = await page.locator(casetas).count();
  expect(total).toBeGreaterThan(0);

  // Término tomado del catálogo que la página ya tiene cargado.
  const name = await page.evaluate(() => (window.__FIESTAS_2026_CASETAS__ || [])[0]?.name || '');
  expect(name).toBeTruthy();

  await page.locator('[data-fiestas-casetas-search-toggle]').click();
  const input = page.locator('[data-fiestas-casetas-search-input]');
  await expect(input).toBeVisible();
  await input.fill(name);

  await expect.poll(() => page.locator(casetas).count()).toBeLessThan(total);
  expect(await page.locator(casetas).count()).toBeGreaterThan(0);

  const clear = page.locator('[data-fiestas-casetas-search-clear]');
  await expect(clear).toBeVisible();
  await clear.click();
  await expect.poll(() => page.locator(casetas).count()).toBe(total);

  await page.locator('[data-fiestas-casetas-filter-toggle]').click();
  const dietary = page.locator('[data-fiestas-casetas-dietary-filter]').first();
  await expect(dietary).toBeVisible();
  await dietary.click();
  await expect.poll(() => page.locator(casetas).count()).toBeLessThan(total);

  await page.locator('[data-fiestas-casetas-filter-clear]').click();
  await expect.poll(() => page.locator(casetas).count()).toBe(total);
});

test('guardar una caseta como favorita persiste al recargar', async ({ page }) => {
  await page.goto('/casetas/');
  const favorite = page.locator(casetas).first();
  await expect(favorite).toBeVisible();
  const casetaId = await favorite.getAttribute('data-caseta-id');

  // Cada caseta tiene botón en el listado y en el panel del mapa: se comprueba
  // el estado del primero y, sobre todo, que quede guardado.
  await favorite.click();
  await expect(favorite).toHaveAttribute('aria-pressed', 'true');

  await expect.poll(async () => {
    const raw = await page.evaluate(() => window.localStorage.getItem('fiestasPucela:casetas-favorites'));
    return JSON.parse(raw || '[]');
  }).toContain(casetaId);

  await page.reload();
  await expect(page.locator(`${casetas}[data-caseta-id="${casetaId}"]`).first()).toHaveAttribute('aria-pressed', 'true');
});

test('la ficha de una caseta abre y muestra su contenido', async ({ page }) => {
  await page.goto('/casetas/');
  await expect(page.locator(casetas).first()).toBeVisible();

  const urlPath = await page.evaluate(() => (window.__FIESTAS_2026_CASETAS__ || [])[0]?.urlPath || '');
  expect(urlPath).toBeTruthy();

  await page.goto(urlPath);
  await expect(page.locator('h1')).not.toBeEmpty();
});
