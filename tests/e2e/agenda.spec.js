import { test, expect } from './fixtures.js';

const cards = '[data-fiestas-card]';

// Los asserts van sobre invariantes ("filtrar reduce el número de tarjetas"),
// nunca sobre títulos concretos, para que cambiar el programa no rompa la suite.
async function openSearchPanel(page) {
  const panel = page.locator('[data-fiestas-search-panel]');
  if (!(await panel.isVisible())) await page.locator('[data-fiestas-search-toggle]').click();
  await expect(panel).toBeVisible();
  return panel;
}

test.describe('agenda', () => {
  // Flujo 1
  test('renderiza tarjetas y el selector de fechas filtra el listado', async ({ page }) => {
    await page.goto('/?date=all');

    await expect(page.locator(cards).first()).toBeVisible();
    const total = await page.locator(cards).count();
    expect(total).toBeGreaterThan(0);

    const days = page.locator('[data-fiestas-dates] [data-date]:not([data-date="all"])');
    await expect(days.first()).toBeVisible();
    await page.locator('[data-fiestas-dates] [data-date]:not([data-date="all"]):not(.is-active)').first().click();

    await expect.poll(() => page.locator(cards).count()).toBeLessThan(total);
    expect(await page.locator(cards).count()).toBeGreaterThan(0);

    // Al elegir un día concreto solo debe quedar su sección.
    await expect(page.locator('.fiestas-day-title')).toHaveCount(1);

    // El contador del día tiene que cuadrar con las tarjetas pintadas.
    const heading = await page.locator('.fiestas-day-head span').first().textContent();
    expect(Number(heading.trim().split(' ')[0])).toBe(await page.locator(cards).count());
  });

  test('muestra Todos antes del día inicial y no reordena al cambiar de día', async ({ page }) => {
    await page.goto('/?date=2026-09-11');

    const dates = page.locator('[data-fiestas-dates] [data-date]');
    const initialOrder = [
      '2026-09-10',
      '2026-09-09',
      '2026-09-08',
      '2026-09-07',
      '2026-09-06',
      '2026-09-05',
      '2026-09-04',
      'all',
      '2026-09-11',
      '2026-09-12',
      '2026-09-13'
    ];
    await expect.poll(() => dates.evaluateAll((cards) => cards.map((card) => card.dataset.date))).toEqual(initialOrder);
    await expect(dates.nth(7)).toHaveAttribute('data-date', 'all');
    await expect(dates.nth(8)).toHaveAttribute('data-date', '2026-09-11');
    await expect(dates.nth(8)).toHaveClass(/is-active/);
    await expect.poll(() => dates.locator('..').evaluate((strip) => strip.scrollLeft)).toBeGreaterThan(0);

    await page.locator('[data-fiestas-dates] [data-date="2026-09-12"]').click();
    await expect.poll(() => dates.evaluateAll((cards) => cards.map((card) => card.dataset.date))).toEqual(initialOrder);
    await expect(dates.nth(9)).toHaveClass(/is-active/);
  });

  // Flujo 2
  test('la búsqueda filtra y se puede limpiar', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator(cards).first()).toBeVisible();
    const total = await page.locator(cards).count();

    await openSearchPanel(page);
    // Término tomado del propio contenido: no depende de un evento concreto.
    const title = await page.locator('.fiestas-event-title').first().textContent();
    const term = title.trim().split(/\s+/).find((word) => word.length > 4) || title.trim();

    await page.locator('[data-fiestas-search]').fill(term);
    await expect.poll(() => page.locator(cards).count()).toBeLessThan(total);
    expect(await page.locator(cards).count()).toBeGreaterThan(0);

    await page.locator('[data-fiestas-clear-filters]').click();
    await expect.poll(() => page.locator(cards).count()).toBe(total);
  });

  // Flujo 3
  test('los filtros por tipo reducen el listado y se reflejan en la UI', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator(cards).first()).toBeVisible();
    const total = await page.locator(cards).count();

    await openSearchPanel(page);
    await page.locator('[data-fiestas-types-toggle]').click();
    const options = page.locator('[data-fiestas-types] input[type="checkbox"]');
    await expect(options.first()).toBeVisible();
    await options.first().check();

    await expect.poll(() => page.locator(cards).count()).toBeLessThan(total);
    await expect(page.locator('[data-fiestas-filter-count]')).toContainText(/resultado/);
    await expect(page.locator('[data-fiestas-clear-filters]')).toBeVisible();

    // El desplegable abierto tapa la fila de filtros entera, incluido su propio
    // botón. Se cierra como en la app: con un clic en el fondo, fuera del menú.
    await page.locator('body').dispatchEvent('click');
    await expect(page.locator('[data-fiestas-types]')).toBeHidden();

    await page.locator('[data-fiestas-clear-filters]').click();
    await expect.poll(() => page.locator(cards).count()).toBe(total);
  });
});
