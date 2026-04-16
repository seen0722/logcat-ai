import { test, expect } from '../fixtures/analysis.fixture.js';

test.describe('Power Overview', () => {
  test('shows key metrics when power data exists', async ({ analysisPage }) => {
    const page = analysisPage;

    const powerSection = page.locator('#section-power');
    // Power section is conditional — skip if not present
    if (!await powerSection.isVisible({ timeout: 3000 }).catch(() => false)) {
      test.skip(true, 'No power data in this bugreport');
      return;
    }

    await powerSection.scrollIntoViewIfNeeded();

    // Heading
    await expect(powerSection.locator('h2', { hasText: 'Power Management' })).toBeVisible();

    // At least some metrics should be visible (battery, wakefulness, etc.)
    const metricsBar = powerSection.locator('.flex.flex-wrap');
    await expect(metricsBar.first()).toBeVisible();
  });

  test('show/hide details toggle works', async ({ analysisPage }) => {
    const page = analysisPage;

    const powerSection = page.locator('#section-power');
    if (!await powerSection.isVisible({ timeout: 3000 }).catch(() => false)) {
      test.skip(true, 'No power data in this bugreport');
      return;
    }

    await powerSection.scrollIntoViewIfNeeded();

    const showBtn = powerSection.locator('button', { hasText: 'Show details' });
    if (await showBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await showBtn.click();
      await page.waitForTimeout(300);

      // Should now show "Hide details"
      await expect(powerSection.locator('button', { hasText: 'Hide details' })).toBeVisible();

      // Detail content should appear (e.g., tables)
      const tables = powerSection.locator('table');
      if (await tables.count() > 0) {
        await expect(tables.first()).toBeVisible();
      }

      // Toggle back
      await powerSection.locator('button', { hasText: 'Hide details' }).click();
      await expect(showBtn).toBeVisible();
    }
  });
});
