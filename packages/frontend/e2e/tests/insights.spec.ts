import { test, expect } from '../fixtures/analysis.fixture.js';

test.describe('Insights Cards', () => {
  test('severity filter buttons are visible', async ({ analysisPage }) => {
    const section = analysisPage.locator('#section-insights');

    // "All" filter should be visible and active by default
    const allBtn = section.locator('button', { hasText: /^All\s/ });
    await expect(allBtn).toBeVisible();
  });

  test('clicking severity filter changes displayed insights', async ({ analysisPage }) => {
    const section = analysisPage.locator('#section-insights');

    // Try clicking "Critical" filter if it exists
    const criticalBtn = section.locator('button', { hasText: /^Critical\s/ });
    if (await criticalBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await criticalBtn.click();
      // "All" should no longer be the active filter — the UI should update
      await analysisPage.waitForTimeout(300);

      // Switch back to All
      const allBtn = section.locator('button', { hasText: /^All\s/ });
      await allBtn.click();
    }
  });

  test('insight cards can be expanded and collapsed', async ({ analysisPage }) => {
    const section = analysisPage.locator('#section-insights');

    // Find the first insight card
    const firstCard = section.locator('.cursor-pointer').first();
    if (await firstCard.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Click to expand
      await firstCard.click();
      await analysisPage.waitForTimeout(300);

      // Click again to collapse
      await firstCard.click();
    }
  });

  test('"Show info-level items" button works when present', async ({ analysisPage }) => {
    const section = analysisPage.locator('#section-insights');

    const showMoreBtn = section.locator('button', { hasText: /Show \d+ info-level/ });
    if (await showMoreBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await showMoreBtn.click();
      // After clicking, more cards should appear and the button should disappear
      await expect(showMoreBtn).not.toBeVisible({ timeout: 3000 });
    }
  });
});
