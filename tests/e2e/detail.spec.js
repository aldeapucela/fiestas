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

test('la ficha confirmada enlaza a Eventos antes de la descripción y usa su canonical', async ({ page }) => {
  await page.goto('/e/924/los-40-sessions-concierto/');

  await expect(page.locator('link[rel="canonical"]'))
    .toHaveAttribute('href', 'https://eventos.aldeapucela.org/e/2533/los-40-sessions-concierto/');
  await expect(page.locator('meta[property="og:url"]'))
    .toHaveAttribute('content', 'https://eventos.aldeapucela.org/e/2533/los-40-sessions-concierto/');
  const sourceLink = page.locator('.fiestas-detail-source-link a');
  await expect(sourceLink).toHaveAttribute('href', 'https://eventos.aldeapucela.org/e/2533/los-40-sessions-concierto/');
  await expect(sourceLink).toContainText('Ver la ficha de Los 40 Sessions (Concierto) en eventos.aldeapucela.org');
  expect(await page.evaluate(() => {
    const sourceLink = document.querySelector('.fiestas-detail-source-link');
    const description = document.querySelector('.fiestas-detail-description');
    return Boolean(sourceLink && description &&
      (sourceLink.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING));
  })).toBe(true);
});

test('la ficha ambigua conserva canonical propio y no inventa un enlace a Eventos', async ({ page }) => {
  await page.goto('/e/34/xxxiv-exposicion-ferroviaria-asvafer/');

  await expect(page.locator('link[rel="canonical"]'))
    .toHaveAttribute('href', 'https://fiestas.aldeapucela.org/e/34/xxxiv-exposicion-ferroviaria-asvafer/');
  await expect(page.locator('.fiestas-detail-source-link')).toHaveCount(0);
});
