import { test, expect, loadClientEvents } from './fixtures.js';

// Devuelve la ruta de una ficha con coordenadas leyendo el propio catálogo que
// la página ya tiene cargado: no depende de ningún evento concreto.
async function detailPathWithCoordinates(page) {
  await page.goto('/');
  await expect(page.locator('[data-fiestas-card]:visible').first()).toBeVisible();
  const events = await loadClientEvents(page);
  const urlPath = (events.find((event) => event.coordinates) || {}).urlPath || '';
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

test('la ficha muestra una nota breve de accesibilidad cuando aplica', async ({ page }) => {
  await page.goto('/e/216/el-tesoro-de-roald-dahl/');

  const note = page.locator('.fiestas-detail-accessibility-note');
  await expect(note).toBeVisible();
  await expect(note).toContainText('LSE');
  await expect(note).toContainText('Lengua de Signos Española');
});
