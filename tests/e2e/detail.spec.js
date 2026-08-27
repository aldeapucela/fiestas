import { test, expect } from './fixtures.js';

// Devuelve la ruta de una ficha con coordenadas leyendo el propio catálogo que
// la página ya tiene cargado: no depende de ningún evento concreto.
async function detailPathWithCoordinates(page) {
  await page.goto('/');
  await expect(page.locator('[data-fiestas-card]').first()).toBeVisible();
  const urlPath = await page.evaluate(() => {
    const events = window.__FIESTAS_2026_EVENTS__ || [];
    return (events.find((event) => event.coordinates) || {}).urlPath || '';
  });
  expect(urlPath, 'debe existir al menos un evento con coordenadas').toBeTruthy();
  return urlPath;
}

// Flujo 6
test('la ficha de evento muestra título, hora, lugar y acceso al mapa', async ({ page }) => {
  const path = await detailPathWithCoordinates(page);
  await page.goto(path);

  const detail = page.locator('[data-fiestas-detail]');
  await expect(detail).toBeVisible();

  await expect(page.locator('h1')).not.toBeEmpty();
  await expect(detail).toHaveAttribute('data-event-start-time', /\d{2}:\d{2}/);
  await expect(page.locator('.fiestas-detail-facts')).toContainText(/\d{1,2}:\d{2}/);
  await expect(page.locator('.fiestas-detail-facts')).not.toBeEmpty();

  // Con coordenadas tiene que ofrecer el mapa.
  await expect(page.locator('[data-fiestas-detail-map]')).toBeVisible();
});
