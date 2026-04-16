import { test, expect } from '../fixtures/analysis.fixture.js';

test.describe('History Panel', () => {
  test('opens and shows at least one record', async ({ analysisPage }) => {
    const page = analysisPage;

    // Click History button in header
    await page.locator('button', { hasText: /^History$/ }).click();

    // History panel should appear
    await expect(page.locator('h2', { hasText: 'Analysis History' })).toBeVisible({ timeout: 5000 });

    // Wait for history API and items to load
    const panel = page.locator('.fixed.inset-0.z-50');
    const items = panel.locator('div.cursor-pointer');
    await items.first().waitFor({ timeout: 15_000 });
    expect(await items.count()).toBeGreaterThan(0);

    // Close panel — click the overlay backdrop (outside panel content)
    await panel.click({ position: { x: 10, y: 450 } });
  });

  test('clicking history item loads analysis result', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Open History
    const viewHistoryBtn = page.locator('button', { hasText: 'View History' });
    const historyBtn = page.locator('button', { hasText: /^History$/ });

    if (await viewHistoryBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await viewHistoryBtn.click();
    } else {
      await historyBtn.click();
    }

    await page.locator('h2', { hasText: 'Analysis History' }).waitFor({ timeout: 10_000 });

    // Click first history item inside panel overlay
    const panel = page.locator('.fixed.inset-0.z-50');
    const firstItem = panel.locator('div.cursor-pointer').first();
    await firstItem.click();

    // Should navigate to result page
    await page.locator('#section-overview').waitFor({ timeout: 30_000 });
    await expect(page.locator('#section-overview')).toBeVisible();
  });
});
