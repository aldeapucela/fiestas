import { test, expect } from './fixtures.js';

// Flujo 4: el drawer solo existe en móvil, así que este fichero se salta en escritorio.
test.describe('navegación móvil', () => {
  test.skip(({ isMobile }) => !isMobile, 'solo aplica al proyecto móvil');

  test('el menú lateral abre, cierra con el botón y cierra con Escape', async ({ page }) => {
    await page.goto('/');

    const drawer = page.locator('[data-menu-drawer]');
    await expect(drawer).toBeHidden();

    await page.locator('[data-menu-open]').first().click();
    await expect(drawer).toBeVisible();

    // El primer [data-menu-close] es el backdrop, que queda debajo del panel:
    // se usa el botón de cerrar que hay dentro del propio diálogo.
    await page.locator('.menu-drawer-panel [data-menu-close]').first().click();
    await expect(drawer).toBeHidden();

    await page.locator('[data-menu-open]').first().click();
    await expect(drawer).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
  });

  test('el panel de filtros abre y se puede cerrar', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-fiestas-card]').first()).toBeVisible();

    const panel = page.locator('[data-fiestas-search-panel]');
    await page.locator('[data-fiestas-search-toggle]').click();
    await expect(panel).toBeVisible();

    await page.locator('[data-fiestas-search-toggle]').click();
    await expect(panel).toBeHidden();
  });
});
