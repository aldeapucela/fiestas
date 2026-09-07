import { test, expect } from './fixtures.js';

// Flujo 10
test('populares renderiza sin romperse aunque no haya datos de guardados', async ({ page }) => {
  await page.goto('/populares/');
  await expect(page.locator('[data-fiestas-popular-page]')).toBeVisible();
  // El endpoint de contadores está simulado vacío: la página debe explicarlo, no fallar.
  await expect(page.locator('[data-fiestas-popular-list]')).toBeVisible();
});

test('populares permite cambiar al ranking por visitas', async ({ page }) => {
  await page.goto('/populares/');

  const visitsTab = page.getByRole('tab', { name: 'Por visitas', exact: true });
  await expect(visitsTab).toHaveAttribute('aria-selected', 'false');
  await visitsTab.click();

  await expect(visitsTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-fiestas-popular-intro]')).toHaveText('Estas son las actividades que más visitas han recibido');
  await expect(page.locator('[data-fiestas-popular-list]')).toHaveAttribute('aria-labelledby', 'fiestas-popular-tab-visits');
});

test('populares permite ocultar finalizadas en ambos rankings', async ({ page }) => {
  await page.addInitScript(() => {
    const OriginalDate = Date;
    const fixedNow = OriginalDate.parse('2026-09-07T12:00:00+02:00');
    class TestDate extends OriginalDate {
      constructor(...args) {
        super(...(args.length ? args : [fixedNow]));
      }

      static now() {
        return fixedNow;
      }
    }
    TestDate.parse = OriginalDate.parse;
    TestDate.UTC = OriginalDate.UTC;
    window.Date = TestDate;
  });
  await page.route('**/fiestas/saves', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      activities: [
        { id: '4', saveCount: 20, visitCount: 4 },
        { id: '131', saveCount: 19, visitCount: 3 }
      ],
      totalVisits: 7
    })
  }));
  await page.goto('/populares/');

  const toggle = page.locator('[data-fiestas-popular-finished-toggle]');
  await expect(toggle).toContainText('Ocultar finalizadas');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('[data-fiestas-popular-mode="visits"] i')).toHaveClass(/fa-eye/);
  await expect(toggle.locator('i')).toHaveClass(/fa-clock/);
  await expect(page.locator('[data-fiestas-card="4"]')).toBeVisible();
  await expect(page.locator('[data-fiestas-card="131"]')).toBeVisible();

  await toggle.click();

  await expect(toggle).toContainText('Mostrar finalizadas');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle.locator('i')).toHaveClass(/fa-clock/);
  await expect(page).toHaveURL(/finalizadas=ocultas/);
  await expect(page.locator('[data-fiestas-card="4"]')).toHaveCount(0);
  await expect(page.locator('[data-fiestas-card="131"]')).toBeVisible();

  await page.getByRole('tab', { name: 'Por visitas', exact: true }).click();
  await expect(page.locator('[data-fiestas-card="4"]')).toHaveCount(0);
  await expect(page.locator('[data-fiestas-card="131"]')).toBeVisible();
});

test('el catálogo de planes vecinales renderiza y sus fichas abren', async ({ page }) => {
  const planDataRequests = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/data/community-plans/')) planDataRequests.push(url.pathname);
  });
  await page.goto('/planes/');
  await expect(page.locator('[data-community-plans-page]')).toBeVisible();

  const firstPlan = page.locator('a[href^="/planes/"]').first();
  await expect(firstPlan).toBeVisible();
  await expect(page.locator('.fiestas-community-plan-card-meta').first()).not.toBeEmpty();
  expect(planDataRequests).toEqual([]);
  const href = await firstPlan.getAttribute('href');

  await page.goto(href);
  await expect(page.locator('h1')).not.toBeEmpty();
});

test('los planes vecinales pliegan las actividades finalizadas', async ({ page }) => {
  await page.addInitScript(() => {
    const OriginalDate = Date;
    const fixedNow = OriginalDate.parse('2026-09-07T12:00:00+02:00');
    class TestDate extends OriginalDate {
      constructor(...args) {
        super(...(args.length ? args : [fixedNow]));
      }

      static now() {
        return fixedNow;
      }
    }
    window.Date = TestDate;
  });
  await page.goto('/planes/de-tardeo-en-tardeo/');

  const finishedToggle = page.locator('[data-plan-finished-toggle]');
  const finishedList = page.locator('[data-plan-finished-list]');
  const pastGroup = page.locator('[data-plan-day-group="2026-09-04"]');
  await expect(finishedToggle).toHaveCount(1);
  await expect(finishedToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(finishedList).toBeHidden();
  await expect(pastGroup).toBeHidden();

  await finishedToggle.click();
  await expect(finishedToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(finishedList).toBeVisible();
  await expect(pastGroup).toBeVisible();
});

test('mi plan renderiza vacío sin errores', async ({ page }) => {
  await page.goto('/plan/');
  await expect(page.locator('[data-fiestas-plans-page]')).toBeVisible();
});
