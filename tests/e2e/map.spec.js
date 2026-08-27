import { test, expect } from './fixtures.js';

// Flujo 5: el mapa carga Leaflet en lazy y pinta marcadores. Es el guardián del
// import dinámico y del SRI: el script se sirve desde node_modules con el mismo
// contenido que unpkg, así que si el hash fijado deja de corresponder al fichero
// real el navegador lo rechaza y este test falla.
test('el mapa carga Leaflet bajo demanda y pinta marcadores', async ({ page }) => {
  await page.goto('/mapa/');

  const map = page.locator('[data-fiestas-map]');
  await expect(map).toBeVisible();

  await expect(page.locator('.leaflet-container')).toBeVisible();
  await expect.poll(
    () => page.locator('.leaflet-marker-icon, .leaflet-marker-pane > *').count(),
    { message: 'el mapa debe pintar al menos un marcador' }
  ).toBeGreaterThan(0);

  expect(await page.evaluate(() => typeof window.L)).toBe('object');
});
