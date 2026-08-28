import { test, expect } from './fixtures.js';

// Flujo 12
test('el service worker se registra y el manifest es válido', async ({ page }) => {
  await page.goto('/');

  await expect.poll(
    () => page.evaluate(async () => Boolean(await navigator.serviceWorker.getRegistration())),
    { message: 'el service worker debe registrarse', timeout: 15_000 }
  ).toBe(true);

  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const response = await page.request.get(href);
  expect(response.ok()).toBe(true);

  const manifest = await response.json();
  expect(manifest.name).toBeTruthy();
  expect(manifest.start_url).toBeTruthy();
  expect(Array.isArray(manifest.icons) && manifest.icons.length).toBeTruthy();
});
