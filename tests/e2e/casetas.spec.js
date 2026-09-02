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
  await expect(page.locator('[data-fiestas-casetas-dietary-filter][value="gluten-free"]')).toBeVisible();
  await dietary.click();
  await expect.poll(() => page.locator(casetas).count()).toBeLessThan(total);

  await page.locator('[data-fiestas-casetas-filter-clear]').click();
  await expect.poll(() => page.locator(casetas).count()).toBe(total);
});

test('mantiene visible la búsqueda al abrir el cajón desde una URL compartida', async ({ page }) => {
  await page.goto('/casetas/?search=croquetas');

  const status = page.locator('[data-fiestas-casetas-search-status]');
  await expect(status).toBeVisible();
  await expect(status).toHaveText('Búsqueda activa: «croquetas»');
  await expect(page.locator('[data-fiestas-casetas-search-toggle]')).toHaveClass(/is-active/);

  await page.locator('[data-fiestas-map-sheet-toggle]').click();
  await expect(page.locator('[data-fiestas-casetas-search-input]')).toBeVisible();
  await expect(page.locator('[data-fiestas-casetas-search-input]')).toHaveValue('croquetas');
  await expect(status).toBeVisible();
  await expect(status).toHaveText('Búsqueda activa: «croquetas»');
});

test('filtra las casetas pendientes de carta desde un enlace y permite limpiarlo', async ({ page }) => {
  await page.goto('/casetas/');
  const casetaRows = page.locator(casetas);
  const allRows = await casetaRows.count();

  await page.goto('/casetas/?menu=missing');

  await expect.poll(() => casetaRows.count()).toBeGreaterThan(0);
  expect(await casetaRows.count()).toBeLessThan(allRows);
  await expect(page.locator('[data-fiestas-map-clear-filters]')).toBeVisible();
  expect(new URL(page.url()).searchParams.get('menu')).toBe('missing');

  await page.locator('[data-fiestas-map-clear-filters]').click();
  await expect.poll(() => casetaRows.count()).toBe(allRows);
  expect(new URL(page.url()).searchParams.get('menu')).toBeNull();
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

test('las casetas relacionadas abren su propia ficha', async ({ page }) => {
  await page.goto('/c/la-criolla/');
  const related = page.locator('.fiestas-related-item').first();
  await expect(related).toBeVisible();

  const relatedName = await related.locator('strong').textContent();
  const relatedHref = await related.getAttribute('href');
  expect(relatedHref).toMatch(/^\/c\/[^/]+\/$/);

  await related.click();
  await expect(page).toHaveURL(new RegExp(`${relatedHref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
  await expect(page.locator('h1')).toHaveText(relatedName.trim());
});

test('la ficha conserva la búsqueda y filtros al volver al listado', async ({ page }) => {
  await page.goto('/casetas/');
  const filterCase = await page.evaluate(() => {
    const caseta = (window.__FIESTAS_2026_CASETAS__ || []).find((item) =>
      item?.details?.menuSections?.some((section) => section?.items?.some((item) => item?.dietary === 'vegetarian'))
    );
    if (!caseta) return null;
    window.localStorage.setItem('fiestasPucela:casetas-favorites', JSON.stringify([caseta.id]));
    return caseta;
  });
  expect(filterCase).not.toBeNull();

  const params = new URLSearchParams({
    favorites: '1',
    search: filterCase.name,
    zone: filterCase.zone,
    location: filterCase.location
  });
  params.append('dietary', 'vegetarian');
  await page.goto(`/casetas/?${params.toString()}`);
  const link = page.locator('.fiestas-map-result-link').first();
  await expect(link).toBeVisible();

  const href = await link.getAttribute('href');
  expect(href).toContain('/c/');
  const detailUrl = new URL(href, 'http://127.0.0.1:8002');
  const returnPath = detailUrl.searchParams.get('return');
  expect(returnPath).toContain('/casetas/');
  const returnUrl = new URL(returnPath, 'http://127.0.0.1:8002');
  expect(returnUrl.searchParams.get('favorites')).toBe('1');
  expect(returnUrl.searchParams.get('search')).toBe(filterCase.name);
  expect(returnUrl.searchParams.get('zone')).toBe(filterCase.zone);
  expect(returnUrl.searchParams.get('location')).toBe(filterCase.location);
  expect(returnUrl.searchParams.getAll('dietary')).toContain('vegetarian');

  await page.goto(href);
  await page.locator('[data-fiestas-back]').click();
  await expect.poll(async () => new URL(await page.url()).pathname).toBe('/casetas/');
  const returnedUrl = new URL(await page.url());
  expect(returnedUrl.searchParams.get('favorites')).toBe('1');
  expect(returnedUrl.searchParams.get('search')).toBe(filterCase.name);
  expect(returnedUrl.searchParams.getAll('dietary')).toContain('vegetarian');
});
