import { test, expect } from './fixtures.js';

// Flujo 11
test('el tema cambia y se conserva al navegar', async ({ page }) => {
  await page.goto('/');

  const isDark = () => page.evaluate(() => document.documentElement.classList.contains('dark'));
  const before = await isDark();

  // El interruptor vive dentro del menú lateral, así que hay que abrirlo.
  await page.locator('[data-menu-open]').first().click();
  await expect(page.locator('[data-menu-drawer]')).toBeVisible();
  await page.locator('[data-theme-toggle]').first().click();
  await expect.poll(isDark).toBe(!before);

  const stored = await page.evaluate(() => window.localStorage.getItem('aldeapucela_theme'));
  expect(stored).toBe(before ? 'light' : 'dark');

  await page.goto('/mapa/');
  expect(await isDark()).toBe(!before);
});
